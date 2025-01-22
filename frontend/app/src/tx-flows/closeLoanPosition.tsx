import type { FlowDeclaration } from "@/src/services/TransactionFlow";

import { Amount } from "@/src/comps/Amount/Amount";
import { ETH_GAS_COMPENSATION } from "@/src/constants";
import { fmtnum } from "@/src/formatting";
import { getCloseFlashLoanAmount } from "@/src/liquity-leverage";
import { getCollToken, getPrefixedTroveId } from "@/src/liquity-utils";
import { LoanCard } from "@/src/screens/TransactionsScreen/LoanCard";
import { TransactionDetailsRow } from "@/src/screens/TransactionsScreen/TransactionsScreen";
import { usePrice } from "@/src/services/Prices";
import { graphQuery, TroveByIdQuery } from "@/src/subgraph-queries";
import { vPositionLoanCommited } from "@/src/valibot-utils";
import { ADDRESS_ZERO, BOLD_TOKEN_SYMBOL } from "@liquity2/uikit";
import * as dn from "dnum";
import * as v from "valibot";
import { readContract } from "wagmi/actions";
import { useStERC20Amount } from "../services/Ethereum";

const FlowIdSchema = v.literal("closeLoanPosition");

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

  loan: vPositionLoanCommited(),
  repayWithCollateral: v.boolean(),
});

export type Request = v.InferOutput<typeof RequestSchema>;

type Step =
  | "closeLoanPosition"
  | "closeLoanPositionFromCollateral"
  | "approveBold";

const stepNames: Record<Step, string> = {
  approveBold: `Approve ${BOLD_TOKEN_SYMBOL}`,
  closeLoanPosition: "Close loan",
  closeLoanPositionFromCollateral: "Close loan",
};

export const closeLoanPosition: FlowDeclaration<Request, Step> = {
  title: "Review & Send Transaction",

  Summary({ flow }) {
    const { loan } = flow.request;

    return (
      <LoanCard
        leverageMode={false}
        loadingState="success"
        loan={null}
        prevLoan={loan}
        onRetry={() => {}}
        txPreviewMode
      />
    );
  },

  Details({ flow }) {
    const { loan, repayWithCollateral } = flow.request;
    const collateral = getCollToken(loan.collIndex);

    if (!collateral) {
      throw new Error("Invalid collateral index: " + loan.collIndex);
    }

    const collPrice = usePrice(collateral.symbol);

    const amountToRepay = collPrice ? (
        repayWithCollateral
        ? (dn.div(loan.borrowed ?? dn.from(0), collPrice))
        : (loan.borrowed ?? dn.from(0))
     ) : undefined;

    const collToReclaim = amountToRepay ? (
      repayWithCollateral
        ? dn.sub(loan.deposit, amountToRepay)
        : loan.deposit
    ) : undefined;
  
    const displayedCollToReclaim = useStERC20Amount(collateral.symbol, collToReclaim);

    if (!amountToRepay || !collToReclaim) {
      return null;
    }

    return (
      <>
        <TransactionDetailsRow
          label={repayWithCollateral ? "You repay (from collateral)" : "You repay"}
          value={[
            <Amount
              key="start"
              value={amountToRepay}
              suffix={` ${repayWithCollateral ? collateral.symbol : BOLD_TOKEN_SYMBOL}`}
            />,
          ]}
        />
        <TransactionDetailsRow
          label="You reclaim collateral"
          value={[
            <Amount
              key="start"
              value={displayedCollToReclaim}
              suffix={` ${collateral.symbol}`}
            />,
          ]}
        />
        <TransactionDetailsRow
          label="You reclaim the gas compensation deposit"
          value={[
            <div
              key="start"
              title={`${fmtnum(ETH_GAS_COMPENSATION, "full")} ETH`}
            >
              {fmtnum(ETH_GAS_COMPENSATION, 4)} ETH
            </div>,
          ]}
        />
      </>
    );
  },

  getStepName(stepid) {
    return stepNames[stepid];
  },

  async getSteps({ account, contracts, request, wagmiConfig }) {
    const { loan } = request;

    const coll = contracts.collaterals[loan.collIndex];

    const Zapper = coll.symbol === "ETH"
      ? coll.contracts.LeverageWETHZapper
      : coll.contracts.LeverageLSTZapper;

    if (!account.address) {
      throw new Error("Account address is required");
    }

    const { entireDebt: entireDebtBN } = await readContract(wagmiConfig, {
      ...coll.contracts.TroveManager,
      functionName: "getLatestTroveData",
      args: [BigInt(loan.troveId)],
    });

    const entireDebt = [entireDebtBN, 18] as dn.Dnum;
    const boldAllowance = [
      await readContract(wagmiConfig, {
        ...contracts.BoldToken,
        functionName: "allowance",
        args: [account.address, Zapper.address],
      }) ?? 0n,
      18,
    ] as dn.Dnum;

    const isBoldApproved = request.repayWithCollateral || !dn.gt(entireDebt, boldAllowance);

    const closeStep = request.repayWithCollateral
      ? "closeLoanPositionFromCollateral" as const
      : "closeLoanPosition" as const;

    return [
      isBoldApproved ? null : "approveBold" as const,
      closeStep,
    ].filter((step) => step !== null);
  },

  parseRequest(request) {
    return v.parse(RequestSchema, request);
  },

  async writeContractParams(stepId, { contracts, request, wagmiConfig }) {
    const { loan } = request;

    const coll = contracts.collaterals[loan.collIndex];

    if (stepId === "approveBold") {
      const { entireDebt } = await readContract(wagmiConfig, {
        ...coll.contracts.TroveManager,
        functionName: "getLatestTroveData",
        args: [BigInt(loan.troveId)],
      });

      const Zapper = coll.symbol === "ETH"
        ? coll.contracts.LeverageWETHZapper
        : coll.contracts.LeverageLSTZapper;

      return {
        ...contracts.BoldToken,
        functionName: "approve",
        args: [Zapper.address, dn.mul([entireDebt, 18], 1.1)[0]], // TODO: calculate the amount to approve in a more precise way
      };
    }

    if (stepId === "closeLoanPosition") {
      return coll.symbol === "ETH"
        ? {
          ...coll.contracts.LeverageWETHZapper,
          functionName: "closeTroveToRawETH" as const,
          args: [loan.troveId],
        }
        : {
          ...coll.contracts.LeverageLSTZapper,
          functionName: "closeTroveToRawETH" as const,
          args: [loan.troveId],
        };
    }

    if (stepId === "closeLoanPositionFromCollateral") {
      const closeFlashLoanAmount = await getCloseFlashLoanAmount(loan.collIndex, loan.troveId, wagmiConfig);

      if (!closeFlashLoanAmount) {
        throw new Error("Could not calculate closeFlashLoanAmount");
      }

      const closeParams = {
        troveId: BigInt(loan.troveId),
        flashLoanAmount: closeFlashLoanAmount,
        receiver: ADDRESS_ZERO,
      };

      return coll.symbol === "ETH"
        ? {
          ...coll.contracts.LeverageWETHZapper,
          functionName: "closeTroveFromCollateral" as const,
          args: [closeParams],
        }
        : {
          ...coll.contracts.LeverageLSTZapper,
          functionName: "closeTroveFromCollateral" as const,
          args: [closeParams],
        };
    }

    throw new Error("Invalid stepId: " + stepId);
  },

  async postFlowCheck({ request }) {
    const prefixedTroveId = getPrefixedTroveId(
      request.loan.collIndex,
      request.loan.troveId,
    );
    while (true) {
      const { trove } = await graphQuery(TroveByIdQuery, { id: prefixedTroveId });
      if (trove?.closedAt !== undefined) return;
    }
  },
};
