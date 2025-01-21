import type { LoadingState } from "@/src/screens/TransactionsScreen/TransactionsScreen";
import type { FlowDeclaration } from "@/src/services/TransactionFlow";

import { Amount } from "@/src/comps/Amount/Amount";
import { fmtnum } from "@/src/formatting";
import { getCollToken, getPrefixedTroveId, usePredictAdjustTroveUpfrontFee } from "@/src/liquity-utils";
import { LoanCard } from "@/src/screens/TransactionsScreen/LoanCard";
import { TransactionDetailsRow } from "@/src/screens/TransactionsScreen/TransactionsScreen";
import { usePrice } from "@/src/services/Prices";
import { graphQuery, TroveByIdQuery } from "@/src/subgraph-queries";
import { isTroveId } from "@/src/types";
import { vDnum, vPositionLoanCommited } from "@/src/valibot-utils";
import * as dn from "dnum";
import { match, P } from "ts-pattern";
import * as v from "valibot";
import { readContract } from "wagmi/actions";
import { BOLD_TOKEN_SYMBOL } from "@liquity2/uikit";
import { getApprovalAddress, getApprovalAmount, getStERC20Amount, useStERC20Amount } from "../services/Ethereum";

const FlowIdSchema = v.literal("updateBorrowPosition");

const RequestSchema = v.object({
  flowId: FlowIdSchema,
  backLink: v.union([
    v.null(),
    v.tuple([
      v.string(), // path
      v.string(), // label
    ]),
  ]),
  successLink: v.tuple([
    v.string(), // path
    v.string(), // label
  ]),
  successMessage: v.string(),
  maxUpfrontFee: vDnum(),
  prevLoan: vPositionLoanCommited(),
  loan: vPositionLoanCommited(),
});

export type Request = v.InferOutput<typeof RequestSchema>;

type FinalStep =
  | "adjustTrove" // update both collateral and borrowed
  | "depositBold"
  | "depositColl"
  | "withdrawBold"
  | "withdrawColl";

type Step =
  | FinalStep
  | "approveBold"
  | "approveColl";

const stepNames: Record<Step, string> = {
  approveBold: `Approve ${BOLD_TOKEN_SYMBOL}`,
  approveColl: "Approve {collSymbol}",
  adjustTrove: "Update Position",
  depositBold: "Update Position",
  depositColl: "Update Position",
  withdrawBold: "Update Position",
  withdrawColl: "Update Position",
};

function getDebtChange(loan: Request["loan"], prevLoan: Request["prevLoan"]) {
  return dn.sub(loan.borrowed, prevLoan.borrowed);
}

function getCollChange(loan: Request["loan"], prevLoan: Request["prevLoan"]) {
  return dn.sub(loan.deposit, prevLoan.deposit);
}

function getFinalStep(request: Request): FinalStep {
  const collChange = getCollChange(request.loan, request.prevLoan);
  const debtChange = getDebtChange(request.loan, request.prevLoan);

  // both coll and debt change -> adjust trove
  if (!dn.eq(collChange, 0) && !dn.eq(debtChange, 0)) {
    return "adjustTrove";
  }
  // coll increases -> deposit
  if (dn.gt(collChange, 0)) {
    return "depositColl";
  }
  // coll decreases -> withdraw
  if (dn.lt(collChange, 0)) {
    return "withdrawColl";
  }
  // debt increases -> withdraw BOLD (borrow)
  if (dn.gt(debtChange, 0)) {
    return "withdrawBold";
  }
  // debt decreases -> deposit BOLD (repay)
  if (dn.lt(debtChange, 0)) {
    return "depositBold";
  }
  throw new Error("Invalid request");
}

export const updateBorrowPosition: FlowDeclaration<Request, Step> = {
  title: "Review & Send Transaction",

  Summary({ flow }) {
    const { request } = flow;
    const { loan, prevLoan } = request;

    const collateral = getCollToken(loan.collIndex);
    if (!collateral) {
      throw new Error(`Invalid collateral index: ${loan.collIndex}`);
    }

    const upfrontFeeData = useUpfrontFeeData(loan, prevLoan);

    const loadingState = match(upfrontFeeData)
      .returnType<LoadingState>()
      .with({ status: "error" }, () => "error")
      .with({ status: "pending" }, () => "loading")
      .with({ data: null }, () => "not-found")
      .with({ data: P.nonNullable }, () => "success")
      .otherwise(() => "error");

    const borrowedWithFee = dn.add(
      loan.borrowed,
      upfrontFeeData.data?.upfrontFee ?? dn.from(0, 18),
    );

    return (
      <LoanCard
        leverageMode={false}
        loadingState={loadingState}
        loan={{ ...loan, borrowed: borrowedWithFee }}
        prevLoan={prevLoan}
        onRetry={() => {}}
        txPreviewMode
      />
    );
  },

  Details({ flow }) {
    const { request } = flow;
    const { loan, prevLoan } = request;

    const collChange = getCollChange(loan, prevLoan);

    const displayedCollChange = useStERC20Amount(loan.collIndex, collChange);

    const collateral = getCollToken(loan.collIndex);
    if (!collateral) {
      throw new Error(`Invalid collateral index: ${loan.collIndex}`);
    }

    const collPrice = usePrice(collateral?.symbol ?? null);
    const upfrontFeeData = useUpfrontFeeData(loan, prevLoan);

    const debtChangeWithFee = upfrontFeeData.data?.debtChangeWithFee;
    const isBorrowing = upfrontFeeData.data?.isBorrowing;

    return (
      <>
        {displayedCollChange && !dn.eq(displayedCollChange, 0) && (
          <TransactionDetailsRow
            label={dn.gt(displayedCollChange, 0) ? "You deposit" : "You withdraw"}
            value={[
              <div
                key="start"
                title={`${fmtnum(dn.abs(displayedCollChange), "full")} ${collateral.name}`}
                style={{
                  color: dn.eq(displayedCollChange, 0n)
                    ? "var(--colors-content-alt2)"
                    : undefined,
                }}
              >
                {fmtnum(dn.abs(displayedCollChange))} {collateral.name}
              </div>,
              <Amount
                key="end"
                fallback="…"
                prefix="$"
                value={collPrice && dn.mul(dn.abs(displayedCollChange), collPrice)}
              />,
            ]}
          />
        )}
        {debtChangeWithFee && !dn.eq(debtChangeWithFee, 0n) && (
          <TransactionDetailsRow
            label={isBorrowing ? "You borrow" : "You repay"}
            value={[
              <Amount
                key="start"
                fallback="…"
                value={debtChangeWithFee && dn.abs(debtChangeWithFee)}
                suffix={` ${BOLD_TOKEN_SYMBOL}`}
              />,
              upfrontFeeData.data?.upfrontFee && dn.gt(upfrontFeeData.data.upfrontFee, 0n) && (
                <Amount
                  key="end"
                  fallback="…"
                  prefix="Incl. "
                  value={upfrontFeeData.data.upfrontFee}
                  suffix={` ${BOLD_TOKEN_SYMBOL} interest rate adjustment fee`}
                />
              ),
            ]}
          />
        )}
      </>
    );
  },

  parseRequest(request) {
    return v.parse(RequestSchema, request);
  },

  getStepName(stepId, { contracts, request }) {
    const { loan } = request;
    const name = stepNames[stepId];
    const coll = contracts.collaterals[loan.collIndex];
    return name.replace(/\{collSymbol\}/g, coll.symbol);
  },

  async getSteps({ account, contracts, request, wagmiConfig }) {
    const debtChange = getDebtChange(request.loan, request.prevLoan);
    const collChange = getCollChange(request.loan, request.prevLoan);
    const coll = contracts.collaterals[request.loan.collIndex];

    const Controller = coll.symbol === "ETH"
      ? coll.contracts.LeverageWETHZapper
      : coll.contracts.LeverageLSTZapper;

    if (!account.address) {
      throw new Error("Account address is required");
    }

    const isBoldApproved = !dn.lt(debtChange, 0) || !dn.gt(dn.abs(debtChange), [
      await readContract(wagmiConfig, {
        ...contracts.BoldToken,
        functionName: "allowance",
        args: [account.address, Controller.address],
      }) ?? 0n,
      18,
    ]);

    const approvalAddress = getApprovalAddress(coll.symbol);

    // Collateral token needs to be approved if collChange > 0 and collToken != "ETH" (no LeverageWETHZapper)
    const isCollApproved = await (async () => {
      if (coll.symbol === 'ETH') {
        return true;
      }
      if (!dn.gt(collChange, 0)) {
        return true;
      }
      const normalizedCollChange = await getStERC20Amount(coll.symbol, collChange, wagmiConfig);
      const allowance = [await readContract(wagmiConfig, {
        ...coll.contracts.CollToken,
        address: approvalAddress,
        functionName: "allowance",
        args: [account.address!, Controller.address],
      }), 18] as dn.Dnum;

      return !dn.gt(normalizedCollChange, allowance);
    })();

    return [
      isBoldApproved ? null : "approveBold" as const,
      isCollApproved ? null : "approveColl" as const,
      getFinalStep(request),
    ].filter((step) => step !== null);
  },

  async writeContractParams(stepId, { account, contracts, request, wagmiConfig }) {
    const { loan, prevLoan, maxUpfrontFee } = request;
    const collChange = getCollChange(loan, prevLoan);
    const debtChange = getDebtChange(loan, prevLoan);
    const { collIndex, troveId } = loan;

    const collateral = contracts.collaterals[collIndex];
    const { LeverageWETHZapper, LeverageLSTZapper } = collateral.contracts;

    const Controller = collateral.symbol === "ETH" ? LeverageWETHZapper : LeverageLSTZapper;

    if (!account.address) {
      throw new Error("Account address is required");
    }

    if (stepId === "approveBold") {
      return {
        ...contracts.BoldToken,
        functionName: "approve",
        args: [
          Controller.address,
          dn.abs(debtChange)[0],
        ],
      };
    }

    if (stepId === "approveColl") {
      const approvalAddress = getApprovalAddress(collateral.symbol);
      const approvalAmount = await getApprovalAmount(collateral.symbol, dn.abs(debtChange), wagmiConfig);
      return {
        ...collateral.contracts.CollToken,
        address: approvalAddress,
        functionName: "approve",
        args: [
          Controller.address,
          approvalAmount,
        ],
      };
    }

    // WETH zapper
    if (collateral.symbol === "ETH") {
      return await match(stepId)
        .with("adjustTrove", () => ({
          ...LeverageWETHZapper,
          functionName: "adjustTroveWithRawETH",
          args: [
            troveId,
            dn.abs(collChange)[0],
            !dn.lt(collChange, 0n),
            dn.abs(debtChange)[0],
            !dn.lt(debtChange, 0n),
            maxUpfrontFee[0],
          ],
          value: dn.gt(collChange, 0n) ? collChange[0] : 0n,
        }))
        .with("depositColl", async () => {
          const normalizedCollChange = await getStERC20Amount(collateral.symbol, collChange, wagmiConfig);
          return ({
            ...LeverageWETHZapper,
            functionName: "addCollWithRawETH",
            args: [troveId],
            value: normalizedCollChange[0],
          });
        })
        .with("withdrawColl", () => ({
          ...LeverageWETHZapper,
          functionName: "withdrawCollToRawETH",
          args: [troveId, dn.abs(collChange)[0]],
        }))
        .with("depositBold", () => ({
          ...LeverageWETHZapper,
          functionName: "repayBold",
          args: [troveId, dn.abs(debtChange)[0]],
        }))
        .with("withdrawBold", () => ({
          ...LeverageWETHZapper,
          functionName: "withdrawBold",
          args: [troveId, dn.abs(debtChange)[0], maxUpfrontFee[0]],
        }))
        .exhaustive();
    }

    // GasComp zapper
    return await match(stepId)
      .with("adjustTrove", () => ({
        ...LeverageLSTZapper,
        functionName: "adjustTrove",
        args: [
          troveId,
          dn.abs(collChange)[0],
          !dn.lt(collChange, 0n),
          dn.abs(debtChange)[0],
          !dn.lt(debtChange, 0n),
          maxUpfrontFee[0],
        ],
      }))
      .with("depositColl", async () => {
        const normalizedCollChange = await getStERC20Amount(collateral.symbol, collChange, wagmiConfig);
        return ({
          ...LeverageLSTZapper,
          functionName: "addColl",
          args: [troveId, normalizedCollChange[0]],
        });
      })
      .with("withdrawColl", () => ({
        ...LeverageLSTZapper,
        functionName: "withdrawColl",
        args: [troveId, dn.abs(collChange)[0]],
      }))
      .with("depositBold", () => ({
        ...LeverageLSTZapper,
        functionName: "repayBold",
        args: [troveId, dn.abs(debtChange)[0]],
      }))
      .with("withdrawBold", () => ({
        ...LeverageLSTZapper,
        functionName: "withdrawBold",
        args: [troveId, dn.abs(debtChange)[0], maxUpfrontFee[0]],
      }))
      .exhaustive();
  },
  async postFlowCheck({ request, steps }) {
    const lastStep = steps?.at(-1);
    if (lastStep?.txStatus !== "post-check" || !isTroveId(lastStep.txReceiptData)) {
      return;
    }

    const lastUpdate = request.loan.updatedAt;

    const prefixedTroveId = getPrefixedTroveId(
      request.loan.collIndex,
      lastStep.txReceiptData,
    );

    while (true) {
      const { trove } = await graphQuery(TroveByIdQuery, { id: prefixedTroveId });

      // trove found and updated: check done
      if (trove && Number(trove.updatedAt) * 1000 !== lastUpdate) {
        break;
      }
    }
  },
};

function useUpfrontFeeData(loan: Request["loan"], prevLoan: Request["prevLoan"]) {
  const debtChange = dn.sub(loan.borrowed, prevLoan.borrowed);
  const isBorrowing = dn.gt(debtChange, 0);

  const upfrontFee = usePredictAdjustTroveUpfrontFee(
    loan.collIndex,
    loan.troveId,
    isBorrowing ? debtChange : [0n, 18],
  );

  return {
    ...upfrontFee,
    data: !upfrontFee.data ? null : {
      isBorrowing,
      debtChangeWithFee: isBorrowing
        ? dn.add(debtChange, upfrontFee.data)
        : debtChange,
      upfrontFee: upfrontFee.data,
    },
  };
}
