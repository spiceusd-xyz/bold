"use client";

import type { CollateralSymbol, TokenSymbol } from "@/src/types";
import type { UseQueryResult } from "@tanstack/react-query";
import type { Dnum } from "dnum";

import { PRICE_REFRESH_INTERVAL } from "@/src/constants";
import { getCollateralContract, getContracts } from "@/src/contracts";
import { dnum18 } from "@/src/dnum-utils";
import { COINGECKO_API_KEY } from "@/src/env";
import { isCollateralSymbol } from "@liquity2/uikit";
import { useQuery } from "@tanstack/react-query";
import * as dn from "dnum";
import * as v from "valibot";
import { useConfig } from "wagmi";
import { NrERC20 } from "../abi/NrERC20";
import { BOLD_TOKEN_SYMBOL, BOLDTokenSymbol } from "@liquity2/uikit";
import { getIsNrERC20Token } from "./Ethereum";
import { readContract } from "@wagmi/core";

type PriceToken = "LQTY" | BOLDTokenSymbol | "LUSD" | CollateralSymbol;

function getCollateralTokenAddress(token: CollateralSymbol) {
  const contracts = getContracts();
  const collateral = contracts.collaterals.find((c) => c.symbol === token);
  return collateral?.contracts.CollToken.address ?? null;
}

function useCollateralPrice(symbol: null | CollateralSymbol): UseQueryResult<Dnum> {
  // "ETH" is a fallback when null is passed, so we can return a standard
  // query object from the PriceFeed ABI, while the query stays disabled
  const PriceFeed = getCollateralContract(symbol ?? "ETH", "PriceFeed");

  const wagmiConfig = useConfig();

  if (!PriceFeed) {
    throw new Error(`Price feed contract not found for ${symbol}`);
  }

  return useQuery({
    queryKey: ['useCollateralPrice', symbol],
    enabled: symbol !== null,
    refetchInterval: PRICE_REFRESH_INTERVAL,
    queryFn: async () => {
      if (!symbol) {
        throw new Error(`Invalid symbol: ${symbol}`);
      }
      const [rawPriceBigInt] = await readContract(wagmiConfig, {
        ...PriceFeed,
        functionName: "fetchPrice",
      });
      const rawPrice = dnum18(rawPriceBigInt);
      
      const isNrERC20Token = getIsNrERC20Token(symbol);
      if (!isNrERC20Token) {
        return rawPrice;
      }

      const nrTokenAddress =  getCollateralTokenAddress(symbol);

      if (!nrTokenAddress) {
        throw new Error(`Cannot find collateral token address: ${symbol}`);
      }

      const stERC20PerToken = await readContract(wagmiConfig, {
        abi: NrERC20,
        address: nrTokenAddress,
        functionName: 'stERC20PerToken',
      })

      const nrTokenPrice = rawPrice;
      const stTokenPrice = dn.div(dn.mul(nrTokenPrice, BigInt(1e9)), stERC20PerToken)[0];

      return stTokenPrice;
    },
  });
}

type CoinGeckoSymbol = TokenSymbol & ("LQTY" | "LUSD");
const coinGeckoTokenIds: {
  [key in CoinGeckoSymbol]: string;
} = {
  "LQTY": "liquity",
  "LUSD": "liquity-usd",
};

function useCoinGeckoPrice(supportedSymbol: null | CoinGeckoSymbol): UseQueryResult<Dnum> {
  return useQuery({
    queryKey: ["coinGeckoPrice", ...Object.keys(coinGeckoTokenIds)],
    queryFn: async () => {
      if (supportedSymbol === null) {
        throw new Error("Unsupported symbol");
      }

      const url = new URL("https://api.coingecko.com/api/v3/simple/price");
      url.searchParams.set("vs_currencies", "usd");
      url.searchParams.set("ids", Object.values(coinGeckoTokenIds).join(","));

      const headers: HeadersInit = { accept: "application/json" };

      if (COINGECKO_API_KEY?.apiType === "demo") {
        headers["x-cg-demo-api-key"] = COINGECKO_API_KEY.apiKey;
      } else if (COINGECKO_API_KEY?.apiType === "pro") {
        headers["x-cg-pro-api-key"] = COINGECKO_API_KEY.apiKey;
      }

      const response = await fetch(url, { headers });

      if (!response.ok) {
        throw new Error(`Failed to fetch price for ${Object.keys(coinGeckoTokenIds).join(",")}`);
      }

      const result = v.parse(
        v.object(
          v.entriesFromList(
            Object.values(coinGeckoTokenIds),
            v.object({ "usd": v.number() }),
          ),
        ),
        await response.json(),
      );

      const prices = {} as { [key in CoinGeckoSymbol]: Dnum | null };

      for (const key of Object.keys(coinGeckoTokenIds) as CoinGeckoSymbol[]) {
        const value = result[coinGeckoTokenIds[key]];
        if (value) {
          prices[key] = value.usd ? dn.from(value.usd, 18) : null;
        }
      }

      return prices;
    },
    select: (data) => {
      if (supportedSymbol === null || !data[supportedSymbol]) {
        throw new Error("Unsupported symbol");
      }
      return data[supportedSymbol];
    },
    enabled: supportedSymbol !== null,
    refetchInterval: PRICE_REFRESH_INTERVAL,
  });
}

export function usePrice<PT extends PriceToken>(symbol: PT | null): UseQueryResult<Dnum> {
  const fromCoinGecko = symbol === "LQTY" || symbol === "LUSD";
  const fromPriceFeed = !fromCoinGecko && symbol !== null && isCollateralSymbol(symbol);

  const collPrice = useCollateralPrice(fromPriceFeed ? symbol : null);
  const coinGeckoPrice = useCoinGeckoPrice(fromCoinGecko ? symbol : null);
  const boldPrice = useQuery({
    queryKey: ["boldPrice"],
    queryFn: () => dn.from(1, 18),
    enabled: symbol === BOLD_TOKEN_SYMBOL,
  });

  // could be any of the three, we just need
  // to return a disabled query result object
  if (symbol === null) {
    return boldPrice;
  }

  if (fromCoinGecko) {
    return coinGeckoPrice;
  }

  if (fromPriceFeed) {
    return collPrice;
  }

  if (symbol === BOLD_TOKEN_SYMBOL) {
    return boldPrice;
  }

  throw new Error(`Unsupported token: ${symbol}`);
}
