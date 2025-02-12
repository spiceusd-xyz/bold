"use client";

import type { CollateralSymbol } from "@/src/types";

import { Amount } from "@/src/comps/Amount/Amount";
import { Positions } from "@/src/comps/Positions/Positions";
import { getContracts } from "@/src/contracts";
import { DNUM_1 } from "@/src/dnum-utils";
import {
  getCollIndexFromSymbol,
  getCollToken,
  useAverageInterestRate,
  useBranchDebt,
  useEarnPool,
} from "@/src/liquity-utils";
import { useAccount } from "@/src/services/Ethereum";
import { css } from "@/styled-system/css";
import { token } from "@/styled-system/tokens";
import { AnchorTextButton, BOLD_TOKEN_SYMBOL, IconBorrow, IconEarn, TokenIcon } from "@liquity2/uikit";
import * as dn from "dnum";
import Link from "next/link";
import { HomeTable } from "./HomeTable";

export function HomeScreen() {
  const account = useAccount();

  const { collaterals } = getContracts();
  const collSymbols = collaterals.map((coll) => coll.symbol);

  return (
    <div
      className={css({
        flexGrow: 1,
        display: "flex",
        flexDirection: "column",
        gap: 64,
        width: "100%",
      })}
    >
      <Positions address={account.address ?? null} />
      <div
        className={css({
          display: "grid",
          gap: 24,
          gridTemplateColumns: "1fr 1fr",
        })}
      >
        <HomeTable
          title={`Borrow ${BOLD_TOKEN_SYMBOL} against Blast native assets`}
          subtitle="You can adjust your loans, including your interest rate, at any time"
          icon={<IconBorrow />}
          columns={[
            "Collateral",
            <span title="Average interest rate, per annum">
              Avg rate, p.a.
            </span>,
            <span title="Maximum Loan-to-Value ratio">
              Max LTV
            </span>,
            "Total debt",
            null,
          ] as const}
          rows={collSymbols.map((symbol) => (
            <BorrowingRow
              key={symbol}
              symbol={symbol}
            />
          ))}
        />
        <HomeTable
          title={`Earn rewards with ${BOLD_TOKEN_SYMBOL}`}
          subtitle={`Earn ${BOLD_TOKEN_SYMBOL} & other token rewards by putting your ${BOLD_TOKEN_SYMBOL} in a stability pool`}
          icon={<IconEarn />}
          columns={[
            "Pool",
            <abbr title="Annual Percentage Rate over the last 24 hours">APR</abbr>,
            <abbr title="Annual Percentage Rate over the last 7 days">
              7d APR
            </abbr>,
            "Pool size",
            null,
          ] as const}
          rows={collSymbols.map((symbol) => <EarnRewardsRow key={symbol} symbol={symbol} />)}
        />
      </div>
    </div>
  );
}

function BorrowingRow({
  symbol,
}: {
  symbol: CollateralSymbol;
}) {
  const collIndex = getCollIndexFromSymbol(symbol);
  const collateral = getCollToken(collIndex);
  const avgInterestRate = useAverageInterestRate(collIndex);
  const branchDebt = useBranchDebt(collIndex);

  const maxLtv = collateral?.collateralRatio && dn.gt(collateral.collateralRatio, 0)
    ? dn.div(DNUM_1, collateral.collateralRatio)
    : null;

  return (
    <tr>
      <td>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: 8,
          })}
        >
          <TokenIcon symbol={symbol} size="mini" />
          <span>{collateral?.name}</span>
        </div>
      </td>
      <td>
        <Amount
          fallback="…"
          percentage
          value={avgInterestRate.data}
        />
      </td>
      <td>
        <Amount
          value={maxLtv}
          percentage
        />
      </td>
      <td>
        <Amount
          format="compact"
          prefix="$"
          value={branchDebt.data}
        />
      </td>
      <td>
        <div
          className={css({
            display: "flex",
            gap: 16,
            justifyContent: "flex-end",
          })}
        >
          <Link
            href={`/borrow/${symbol.toLowerCase()}`}
            legacyBehavior
            passHref
          >
            <AnchorTextButton
              style={{
                color: token("colors.lightPurple:30")
              }}
              label={
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 14,
                  })}
                >
                  Borrow
                  <TokenIcon symbol={BOLD_TOKEN_SYMBOL} size="mini" />
                </div>
              }
              title={`Borrow ${collateral?.name} from ${symbol}`}
            />
          </Link>
          {
            /*<Link
            href={`/multiply/${symbol.toLowerCase()}`}
            legacyBehavior
            passHref
          >
            <AnchorTextButton
              style={{
                color: token("colors.lightPurple:30")
              }}
              label={
                <div
                  className={css({
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    fontSize: 14,
                  })}
                >
                  Multiply
                  <TokenIcon symbol={symbol} size="mini" />
                </div>
              }
              title={`Borrow ${collateral?.name} from ${symbol}`}
            />
          </Link>*/
          }
        </div>
      </td>
    </tr>
  );
}

function EarnRewardsRow({
  symbol,
}: {
  symbol: CollateralSymbol;
}) {
  const collIndex = getCollIndexFromSymbol(symbol);
  const collateral = getCollToken(collIndex);
  const earnPool = useEarnPool(collIndex);

  return (
    <tr>
      <td>
        <div
          className={css({
            display: "flex",
            alignItems: "center",
            gap: 8,
          })}
        >
          <TokenIcon symbol={symbol} size="mini" />
          <span>{collateral?.name}</span>
        </div>
      </td>
      <td>
        <Amount
          fallback="…"
          percentage
          value={earnPool.data.apr}
        />
      </td>
      <td>
        <Amount
          fallback="…"
          percentage
          value={earnPool.data.apr7d}
        />
      </td>
      <td>
        <Amount
          fallback="…"
          format="compact"
          prefix="$"
          value={earnPool.data?.totalDeposited}
        />
      </td>
      <td>
        <Link
          href={`/earn/${symbol.toLowerCase()}`}
          legacyBehavior
          passHref
        >
          <AnchorTextButton
            style={{
              color: token("colors.lightPurple:30")
            }}
            label={
              <div
                className={css({
                  display: "flex",
                  alignItems: "center",
                  gap: 4,
                  fontSize: 14,
                })}
              >
                Earn
                <TokenIcon.Group size="mini">
                  <TokenIcon symbol={BOLD_TOKEN_SYMBOL} />
                  <TokenIcon symbol={symbol} />
                </TokenIcon.Group>
              </div>
            }
            title={`Earn ${BOLD_TOKEN_SYMBOL} with ${collateral?.name}`}
          />
        </Link>
      </td>
    </tr>
  );
}
