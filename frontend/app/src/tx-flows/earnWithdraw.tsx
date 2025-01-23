import type { FlowDeclaration } from "@/src/services/TransactionFlow";

import { Amount } from "@/src/comps/Amount/Amount";
import { EarnPositionSummary } from "@/src/comps/EarnPositionSummary/EarnPositionSummary";
import { TransactionDetailsRow } from "@/src/screens/TransactionsScreen/TransactionsScreen";
import { TransactionStatus } from "@/src/screens/TransactionsScreen/TransactionStatus";
import { usePrice } from "@/src/services/Prices";
import { vCollIndex, vPositionEarn } from "@/src/valibot-utils";
import * as dn from "dnum";
import * as v from "valibot";
import { BOLD_TOKEN_SYMBOL } from "@liquity2/uikit";
import { writeContract } from "wagmi/actions";
import { createRequestSchema, verifyTransaction } from "./shared";

const RequestSchema = createRequestSchema(
  "earnWithdraw",
  {
    prevEarnPosition: vPositionEarn(),
    earnPosition: vPositionEarn(),
    collIndex: vCollIndex(),
    claim: v.boolean(),
  },
);

export type EarnWithdrawRequest = v.InferOutput<typeof RequestSchema>;

export const earnWithdraw: FlowDeclaration<EarnWithdrawRequest> = {
  title: "Review & Send Transaction",

  Summary({ request }) {
    return (
      <EarnPositionSummary
        collIndex={request.collIndex}
        earnPosition={request.earnPosition}
        prevEarnPosition={request.prevEarnPosition}
        txPreviewMode
      />
    );
  },

  Details({ request }) {
    const boldPrice = usePrice(BOLD_TOKEN_SYMBOL);
    const boldAmount = dn.abs(dn.sub(
      request.earnPosition.deposit,
      request.prevEarnPosition.deposit,
    ));
    return (
      <>
        <TransactionDetailsRow
          label="You withdraw"
          value={[
            <Amount
              key="start"
              suffix={` ${BOLD_TOKEN_SYMBOL}`}
              value={boldAmount}
            />,
            <Amount
              key="end"
              prefix="$"
              value={boldPrice.data && dn.mul(boldAmount, boldPrice.data)}
            />,
          ]}
        />
      </>
    );
  },

  steps: {
    withdrawFromStabilityPool: {
      name: () => "Withdraw",
      Status: TransactionStatus,

      async commit({ contracts, request, wagmiConfig }) {
        const collateral = contracts.collaterals[request.collIndex];
        if (!collateral) {
          throw new Error("Invalid collateral index: " + request.collIndex);
        }
        const { StabilityPool } = collateral.contracts;

        const boldAmount = dn.abs(dn.sub(
          request.earnPosition.deposit,
          request.prevEarnPosition.deposit,
        ));

        return writeContract(wagmiConfig, {
          ...StabilityPool,
          functionName: "withdrawFromSP",
          args: [boldAmount[0], request.claim],
        });
      },

      async verify({ wagmiConfig, isSafe }, hash) {
        await verifyTransaction(wagmiConfig, hash, isSafe);
      },
    },
  },

  async getSteps() {
    return ["withdrawFromStabilityPool"];
  },

  parseRequest(request) {
    return v.parse(RequestSchema, request);
  },
};
