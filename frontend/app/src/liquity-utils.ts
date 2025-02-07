import type { Contracts } from "@/src/contracts";
import type {
  CollIndex,
  Dnum,
  PositionEarn,
  PositionLoanCommitted,
  PositionStake,
  PrefixedTroveId,
  TroveId,
} from "@/src/types";
import type { Address, CollateralSymbol, CollateralToken } from "@liquity2/uikit";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Config as WagmiConfig } from "wagmi";

import { DATA_REFRESH_INTERVAL, INTEREST_RATE_INCREMENT, INTEREST_RATE_MAX, INTEREST_RATE_MIN } from "@/src/constants";
import { getCollateralContract, getContracts, getProtocolContract } from "@/src/contracts";
import { dnum18, DNUM_0, dnumOrNull, jsonStringifyWithDnum } from "@/src/dnum-utils";
import { CHAIN_BLOCK_EXPLORER, LIQUITY_STATS_URL } from "@/src/env";
import { useContinuousBoldGains } from "@/src/liquity-stability-pool";
import {
  useGovernanceStats,
  useGovernanceUser,
  useInterestRateBrackets,
  useLoanById,
  useStabilityPool,
} from "@/src/subgraph-hooks";
import { isCollIndex, isTroveId } from "@/src/types";
import { COLLATERALS, isAddress } from "@liquity2/uikit";
import { useQuery } from "@tanstack/react-query";
import * as dn from "dnum";
import { useMemo } from "react";
import * as v from "valibot";
import { encodeAbiParameters, keccak256, parseAbiParameters } from "viem";
import { useBalance, useReadContract, useReadContracts } from "wagmi";
import { readContract } from "wagmi/actions";

export function shortenTroveId(troveId: TroveId, chars = 8) {
  return troveId.length < chars * 2 + 2
    ? troveId
    // : troveId.slice(0, chars + 2) + "…" + troveId.slice(-chars);
    : troveId.slice(0, chars + 2) + "…";
}

export function getTroveId(owner: Address, ownerIndex: bigint | number) {
  return BigInt(keccak256(encodeAbiParameters(
    parseAbiParameters("address, uint256"),
    [owner, BigInt(ownerIndex)],
  )));
}

export function parsePrefixedTroveId(value: PrefixedTroveId): {
  collIndex: CollIndex;
  troveId: TroveId;
} {
  const [collIndex_, troveId] = value.split(":");
  if (!collIndex_ || !troveId) {
    throw new Error(`Invalid prefixed trove ID: ${value}`);
  }
  const collIndex = parseInt(collIndex_, 10);
  if (!isCollIndex(collIndex) || !isTroveId(troveId)) {
    throw new Error(`Invalid prefixed trove ID: ${value}`);
  }
  return { collIndex, troveId };
}

export function getPrefixedTroveId(collIndex: CollIndex, troveId: TroveId): PrefixedTroveId {
  return `${collIndex}:${troveId}`;
}

export function getCollToken(collIndex: null): null;
export function getCollToken(collIndex: CollIndex): CollateralToken;
export function getCollToken(collIndex: CollIndex | null): CollateralToken | null;
export function getCollToken(collIndex: CollIndex | null): CollateralToken | null {
  const { collaterals } = getContracts();
  if (collIndex === null) {
    return null;
  }
  return collaterals.map(({ symbol }) => {
    const collateral = COLLATERALS.find((c) => c.symbol === symbol);
    if (!collateral) {
      throw new Error(`Unknown collateral symbol: ${symbol}`);
    }
    return collateral;
  })[collIndex] ?? null;
}

export function getCollIndexFromSymbol(symbol: CollateralSymbol | null): CollIndex | null {
  if (symbol === null) return null;
  const { collaterals } = getContracts();
  const collIndex = collaterals.findIndex((coll) => coll.symbol === symbol);
  return isCollIndex(collIndex) ? collIndex : null;
}

export function useEarnPool(collIndex: null | CollIndex) {
  const collateral = getCollToken(collIndex);
  const pool = useStabilityPool(collIndex ?? undefined);
  const stats = useLiquityStats();
  const branchStats = collateral && stats.data?.branch[collateral?.symbol];
  return {
    ...pool,
    data: {
      apr: dnumOrNull(branchStats?.spApyAvg1d, 18),
      apr7d: dnumOrNull(branchStats?.spApyAvg7d, 18),
      collateral,
      totalDeposited: pool.data?.totalDeposited ?? null,
    },
  };
}

export function isEarnPositionActive(position: PositionEarn | null) {
  return Boolean(
    position && (
      dn.gt(position.deposit, 0)
      || dn.gt(position.rewards.bold, 0)
      || dn.gt(position.rewards.coll, 0)
    ),
  );
}

export function useEarnPosition(
  collIndex: null | CollIndex,
  account: null | Address,
): UseQueryResult<PositionEarn | null> {
  const getBoldGains = useContinuousBoldGains(account, collIndex);

  const yieldGainsInBold = useQuery({
    queryFn: () => getBoldGains.data?.(Date.now()) ?? null,
    queryKey: ["useEarnPosition:getBoldGains", collIndex, account],
    refetchInterval: 10_000,
    enabled: getBoldGains.status === "success",
  });

  const StabilityPool = getCollateralContract(collIndex, "StabilityPool");
  if (!StabilityPool) {
    throw new Error(`Invalid collateral index: ${collIndex}`);
  }

  const spReads = useReadContracts({
    contracts: [{
      ...StabilityPool,
      functionName: "getCompoundedBoldDeposit",
      args: [account ?? "0x"],
    }, {
      ...StabilityPool,
      functionName: "getDepositorCollGain",
      args: [account ?? "0x"],
    }, {
      ...StabilityPool,
      functionName: "stashedColl",
      args: [account ?? "0x"],
    }],
    allowFailure: false,
    query: {
      select: ([deposit, collGain, stashedColl]) => ({
        spDeposit: dnum18(deposit),
        spCollGain: dnum18(collGain),
        spStashedColl: dnum18(stashedColl),
      }),
      enabled: account !== null,
    },
  });

  return useQuery({
    queryKey: ["useEarnPosition", collIndex, account],
    queryFn: () => {
      return {
        type: "earn" as const,
        owner: account,
        deposit: spReads.data?.spDeposit ?? DNUM_0,
        collIndex,
        rewards: {
          bold: yieldGainsInBold.data ?? DNUM_0,
          coll: dn.add(
            spReads.data?.spCollGain ?? DNUM_0,
            spReads.data?.spStashedColl ?? DNUM_0,
          ),
        },
      };
    },
    enabled: Boolean(
      account
        && collIndex !== null
        && yieldGainsInBold.status === "success"
        && getBoldGains.status === "success"
        && spReads.status === "success",
    ),
  });
}

export function useAccountVotingPower(account: Address | null, lqtyDiff: bigint = 0n) {
  const govUser = useGovernanceUser(account);
  const govStats = useGovernanceStats();

  return useMemo(() => {
    if (!govStats.data || !govUser.data) {
      return null;
    }

    const t = BigInt(Math.floor(Date.now() / 1000));

    const { totalLQTYStaked, totalOffset } = govStats.data;
    const totalVp = (BigInt(totalLQTYStaked) + lqtyDiff) * t - BigInt(totalOffset);

    const { stakedLQTY, stakedOffset } = govUser.data;
    const userVp = (BigInt(stakedLQTY) + lqtyDiff) * t - BigInt(stakedOffset);

    // pctShare(t) = userVotingPower(t) / totalVotingPower(t)
    return dn.div([userVp, 18], [totalVp, 18]);
  }, [govUser.data, govStats.data, lqtyDiff]);
}

export function useStakePosition(address: null | Address) {
  const votingPower = useAccountVotingPower(address);

  const LqtyStaking = getProtocolContract("LqtyStaking");
  const LusdToken = getProtocolContract("LusdToken");
  const Governance = getProtocolContract("Governance");

  const userProxyAddress = useReadContract({
    ...Governance,
    functionName: "deriveUserProxyAddress",
    args: [address ?? "0x"],
    query: { enabled: Boolean(address) },
  });

  const userProxyBalance = useBalance({
    address: userProxyAddress.data ?? "0x",
    query: { enabled: Boolean(address) && userProxyAddress.isSuccess },
  });

  const stakePosition = useReadContracts({
    contracts: [
      {
        ...LqtyStaking,
        functionName: "stakes",
        args: [userProxyAddress.data ?? "0x"],
      },
      {
        ...LqtyStaking,
        functionName: "totalLQTYStaked",
      },
      {
        ...LqtyStaking,
        functionName: "getPendingETHGain",
        args: [userProxyAddress.data ?? "0x"],
      },
      {
        ...LqtyStaking,
        functionName: "getPendingLUSDGain",
        args: [userProxyAddress.data ?? "0x"],
      },
      {
        ...LusdToken,
        functionName: "balanceOf",
        args: [userProxyAddress.data ?? "0x"],
      },
    ],
    query: {
      enabled: Boolean(address) && userProxyAddress.isSuccess && userProxyBalance.isSuccess,
      refetchInterval: DATA_REFRESH_INTERVAL,
      select: ([
        depositResult,
        totalStakedResult,
        pendingEthGainResult,
        pendingLusdGainResult,
        lusdBalanceResult,
      ]): PositionStake | null => {
        if (
          depositResult.status === "failure" || totalStakedResult.status === "failure"
          || pendingEthGainResult.status === "failure" || pendingLusdGainResult.status === "failure"
          || lusdBalanceResult.status === "failure"
        ) {
          return null;
        }
        const deposit = dnum18(depositResult.result);
        const totalStaked = dnum18(totalStakedResult.result);
        return {
          type: "stake",
          deposit,
          owner: address ?? "0x",
          totalStaked,
          rewards: {
            eth: dnum18(pendingEthGainResult.result + (userProxyBalance.data?.value ?? 0n)),
            lusd: dnum18(pendingLusdGainResult.result + lusdBalanceResult.result),
          },
          share: DNUM_0,
        };
      },
    },
  });

  return stakePosition.data && votingPower
    ? { ...stakePosition, data: { ...stakePosition.data, share: votingPower } }
    : stakePosition;
}

export function useTroveNftUrl(collIndex: null | CollIndex, troveId: null | TroveId) {
  const TroveNft = getCollateralContract(collIndex, "TroveNFT");
  return TroveNft && troveId && `${CHAIN_BLOCK_EXPLORER?.url}nft/${TroveNft.address}/${BigInt(troveId)}`;
}

const RATE_STEPS = Math.round((INTEREST_RATE_MAX - INTEREST_RATE_MIN) / INTEREST_RATE_INCREMENT) + 1;

export function useAverageInterestRate(collIndex: null | CollIndex) {
  const brackets = useInterestRateBrackets(collIndex);

  const data = useMemo(() => {
    if (!brackets.isSuccess) {
      return null;
    }

    let totalDebt = DNUM_0;
    let totalWeightedRate = DNUM_0;

    for (const bracket of brackets.data) {
      totalDebt = dn.add(totalDebt, bracket.totalDebt);
      totalWeightedRate = dn.add(
        totalWeightedRate,
        dn.mul(bracket.rate, bracket.totalDebt),
      );
    }

    return dn.eq(totalDebt, 0)
      ? DNUM_0
      : dn.div(totalWeightedRate, totalDebt);
  }, [brackets.isSuccess, brackets.data]);

  return {
    ...brackets,
    data,
  };
}

export function useInterestRateChartData(collIndex: null | CollIndex) {
  const brackets = useInterestRateBrackets(collIndex);

  const chartData = useQuery({
    queryKey: [
      "useInterestRateChartData",
      collIndex,
      jsonStringifyWithDnum(brackets.data),
    ],
    queryFn: () => {
      if (!brackets.isSuccess) {
        return [];
      }

      let totalDebt = DNUM_0;
      let highestDebt = DNUM_0;
      const debtByNonEmptyRateBrackets = new Map<number, Dnum>();
      for (const bracket of brackets.data) {
        const rate = dn.toNumber(dn.mul(bracket.rate, 100));
        if (rate >= INTEREST_RATE_MIN && rate <= INTEREST_RATE_MAX) {
          totalDebt = dn.add(totalDebt, bracket.totalDebt);
          debtByNonEmptyRateBrackets.set(rate, bracket.totalDebt);
          if (dn.gt(bracket.totalDebt, highestDebt)) {
            highestDebt = bracket.totalDebt;
          }
        }
      }

      let runningDebtTotal = DNUM_0;
      const chartData = Array.from({ length: RATE_STEPS }, (_, i) => {
        const rate = INTEREST_RATE_MIN + Math.floor(i * INTEREST_RATE_INCREMENT * 10) / 10;
        const debt = debtByNonEmptyRateBrackets?.get(rate) ?? DNUM_0;
        const debtInFront = runningDebtTotal;
        runningDebtTotal = dn.add(runningDebtTotal, debt);
        return {
          debt,
          debtInFront,
          rate: INTEREST_RATE_MIN + Math.floor(i * INTEREST_RATE_INCREMENT * 10) / 10,
          size: totalDebt[0] === 0n ? 0 : dn.toNumber(dn.div(debt, highestDebt)),
        };
      });

      return chartData;
    },
    refetchInterval: DATA_REFRESH_INTERVAL,
    enabled: brackets.isSuccess,
  });

  return brackets.isSuccess ? chartData : {
    ...chartData,
    data: [],
  };
}

export function usePredictOpenTroveUpfrontFee(
  collIndex: CollIndex,
  borrowedAmount: Dnum,
  interestRateOrBatch: Address | Dnum,
) {
  const batch = isAddress(interestRateOrBatch);

  return useReadContract({
    ...getProtocolContract("HintHelpers"),
    functionName: batch
      ? "predictOpenTroveAndJoinBatchUpfrontFee"
      : "predictOpenTroveUpfrontFee",
    args: batch
      ? [BigInt(collIndex), borrowedAmount[0], interestRateOrBatch]
      : [BigInt(collIndex), borrowedAmount[0], interestRateOrBatch[0]],
    query: {
      refetchInterval: DATA_REFRESH_INTERVAL,
      select: dnum18,
    },
  });
}

export function usePredictAdjustTroveUpfrontFee(
  collIndex: CollIndex,
  troveId: TroveId,
  debtIncrease: Dnum,
) {
  return useReadContract({
    ...getProtocolContract("HintHelpers"),
    functionName: "predictAdjustTroveUpfrontFee",
    args: [
      BigInt(collIndex),
      BigInt(troveId),
      debtIncrease[0],
    ],
    query: {
      refetchInterval: DATA_REFRESH_INTERVAL,
      select: dnum18,
    },
  });
}

// predicts the upfront fee for:
// - adjusting the interest rate of a trove (non-batch => non-batch)
// - joining a batch with a new interest rate (non-batch => batch or batch => batch)
// - removing a trove from a batch (batch => non-batch)
export function usePredictAdjustInterestRateUpfrontFee(
  collIndex: CollIndex,
  troveId: TroveId,
  newInterestRateOrBatch: Address | Dnum,
  fromBatch: boolean,
) {
  const functionName = isAddress(newInterestRateOrBatch)
    ? "predictJoinBatchInterestRateUpfrontFee"
    : fromBatch
    ? "predictRemoveFromBatchUpfrontFee"
    : "predictAdjustInterestRateUpfrontFee";

  return useReadContract({
    ...getProtocolContract("HintHelpers"),
    functionName,
    args: [
      BigInt(collIndex),
      BigInt(troveId),
      typeof newInterestRateOrBatch === "string"
        ? newInterestRateOrBatch
        : newInterestRateOrBatch[0],
    ],
    query: {
      refetchInterval: DATA_REFRESH_INTERVAL,
      select: dnum18,
    },
  });
}

// from https://github.com/liquity/bold/blob/204a3dec54a0e8689120ca48faf4ece5cf8ccd22/README.md#example-opentrove-transaction-with-hints
export async function getTroveOperationHints({
  wagmiConfig,
  contracts,
  collIndex,
  interestRate,
}: {
  wagmiConfig: WagmiConfig;
  contracts: Contracts;
  collIndex: number;
  interestRate: bigint;
}): Promise<{
  upperHint: bigint;
  lowerHint: bigint;
}> {
  const collateral = contracts.collaterals[collIndex];
  if (!collateral) {
    throw new Error(`Invalid collateral index: ${collIndex}`);
  }

  const numTroves = await readContract(wagmiConfig, {
    ...collateral.contracts.SortedTroves,
    functionName: "getSize",
  });

  const [approxHint] = await readContract(wagmiConfig, {
    ...contracts.HintHelpers,
    functionName: "getApproxHint",
    args: [
      BigInt(collIndex),
      interestRate,
      // (10 * sqrt(troves)) gives a hint close to the right position
      10n * BigInt(Math.ceil(Math.sqrt(Number(numTroves)))),
      42n, // random seed
    ],
  });

  const [upperHint, lowerHint] = await readContract(wagmiConfig, {
    ...collateral.contracts.SortedTroves,
    functionName: "findInsertPosition",
    args: [
      interestRate,
      approxHint,
      approxHint,
    ],
  });

  return { upperHint, lowerHint };
}

const StatsSchema = v.pipe(
  v.object({
    total_bold_supply: v.string(),
    total_debt_pending: v.string(),
    total_coll_value: v.string(),
    total_sp_deposits: v.string(),
    total_value_locked: v.string(),
    max_sp_apy: v.string(),
    branch: v.record(
      v.string(),
      v.object({
        coll_active: v.string(),
        coll_default: v.string(),
        coll_price: v.string(),
        sp_deposits: v.string(),
        interest_accrual_1y: v.string(),
        interest_pending: v.string(),
        batch_management_fees_pending: v.string(),
        debt_pending: v.string(),
        coll_value: v.string(),
        sp_apy: v.string(),
        sp_apy_avg_1d: v.optional(v.string()),
        sp_apy_avg_7d: v.optional(v.string()),
        value_locked: v.string(),
      }),
    ),
  }),
  v.transform((value) => ({
    totalBoldSupply: dnumOrNull(value.total_bold_supply, 18),
    totalDebtPending: dnumOrNull(value.total_debt_pending, 18),
    totalCollValue: dnumOrNull(value.total_coll_value, 18),
    totalSpDeposits: dnumOrNull(value.total_sp_deposits, 18),
    totalValueLocked: dnumOrNull(value.total_value_locked, 18),
    maxSpApy: dnumOrNull(value.max_sp_apy, 18),
    branch: Object.fromEntries(
      Object.entries(value.branch).map(([symbol, branch]) => {
        symbol = symbol.toUpperCase();
        if (symbol === "WETH") symbol = "ETH";
        return [symbol, {
          collActive: dnumOrNull(branch.coll_active, 18),
          collDefault: dnumOrNull(branch.coll_default, 18),
          collPrice: dnumOrNull(branch.coll_price, 18),
          spDeposits: dnumOrNull(branch.sp_deposits, 18),
          interestAccrual1y: dnumOrNull(branch.interest_accrual_1y, 18),
          interestPending: dnumOrNull(branch.interest_pending, 18),
          batchManagementFeesPending: dnumOrNull(branch.batch_management_fees_pending, 18),
          debtPending: dnumOrNull(branch.debt_pending, 18),
          collValue: dnumOrNull(branch.coll_value, 18),
          spApy: dnumOrNull(branch.sp_apy, 18),
          spApyAvg1d: dnumOrNull(branch.sp_apy_avg_1d, 18),
          spApyAvg7d: dnumOrNull(branch.sp_apy_avg_7d, 18),
          valueLocked: dnumOrNull(branch.value_locked, 18),
        }];
      }),
    ),
  })),
);

export function useBranchDebt(collIndex: CollIndex | null) {
  const BorrowerOperations = getCollateralContract(collIndex, "BorrowerOperations");
  if (!BorrowerOperations) {
    throw new Error(`Invalid collateral index: ${collIndex}`);
  }
  return useReadContract({
    ...BorrowerOperations,
    functionName: "getEntireSystemDebt",
    query: {
      refetchInterval: DATA_REFRESH_INTERVAL,
      select: dnum18,
    },
  });
}

export function useLiquityStats() {
  return useQuery({
    queryKey: ["liquity-stats"],
    queryFn: async () => {
      if (!LIQUITY_STATS_URL) {
        throw new Error("LIQUITY_STATS_URL is not defined");
      }
      const response = await fetch(LIQUITY_STATS_URL);
      return v.parse(StatsSchema, await response.json());
    },
    enabled: Boolean(LIQUITY_STATS_URL),
  });
}

export function useLatestTroveData(collIndex: CollIndex, troveId: TroveId) {
  const TroveManager = getCollateralContract(collIndex, "TroveManager");
  if (!TroveManager) {
    throw new Error(`Invalid collateral index: ${collIndex}`);
  }
  return useReadContract({
    ...TroveManager,
    functionName: "getLatestTroveData",
    args: [BigInt(troveId)],
    query: {
      refetchInterval: DATA_REFRESH_INTERVAL,
    },
  });
}

export function useLoanLiveDebt(collIndex: CollIndex, troveId: TroveId) {
  const latestTroveData = useLatestTroveData(collIndex, troveId);
  return {
    ...latestTroveData,
    data: latestTroveData.data?.entireDebt ?? null,
  };
}

export function useLoan(collIndex: CollIndex, troveId: TroveId): UseQueryResult<PositionLoanCommitted | null> {
  const liveDebt = useLoanLiveDebt(collIndex, troveId);
  const loan = useLoanById(getPrefixedTroveId(collIndex, troveId));

  if (liveDebt.status === "pending" || loan.status === "pending") {
    return {
      ...loan,
      data: undefined,
      error: null,
      isError: false,
      isFetching: true,
      isLoading: true,
      isLoadingError: false,
      isPending: true,
      isRefetchError: false,
      isSuccess: false,
      status: "pending",
    };
  }

  if (!loan.data) {
    return loan;
  }

  return {
    ...loan,
    data: {
      ...loan.data,
      borrowed: liveDebt.data ? dnum18(liveDebt.data) : loan.data.borrowed,
    },
  };
}
