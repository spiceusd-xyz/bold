"use client";

import { CollateralSymbol, Entries } from "@/src/types";
import type { Dnum } from "dnum";
import type { Dispatch, ReactNode, SetStateAction } from "react";

import { getCollateralContract, getContracts } from "@/src/contracts";
import {
  BOLD_PRICE as DEMO_BOLD_PRICE,
  ETH_PRICE as DEMO_ETH_PRICE,
  LQTY_PRICE as DEMO_LQTY_PRICE,
  LUSD_PRICE as DEMO_LUSD_PRICE,
  PRICE_UPDATE_INTERVAL as DEMO_PRICE_UPDATE_INTERVAL,
  PRICE_UPDATE_MANUAL as DEMO_PRICE_UPDATE_MANUAL,
  PRICE_UPDATE_VARIATION as DEMO_PRICE_UPDATE_VARIATION,
  RETH_PRICE as DEMO_RETH_PRICE,
  WSTETH_PRICE as DEMO_WSTETH_PRICE,
} from "@/src/demo-mode";
import { dnum18, jsonStringifyWithDnum } from "@/src/dnum-utils";
import { COLL_SYMBOLS, CONTRACT_BOLD_TOKEN, CONTRACT_LQTY_TOKEN, CONTRACT_LUSD_TOKEN, DEMO_MODE } from "@/src/env";
import { useQuery } from "@tanstack/react-query";
import * as dn from "dnum";
import { createContext, useContext, useEffect, useState } from "react";
import { useRef } from "react";
import * as v from "valibot";
import { useReadContract } from "wagmi";
import { NrERC20 } from "../abi/NrERC20";
import { isCollateralSymbol, Token, BOLD_TOKEN_SYMBOL, BOLDTokenSymbol } from "@liquity2/uikit";
import { match } from "ts-pattern";

type PriceToken = "LQTY" | BOLDTokenSymbol | "LUSD" | CollateralSymbol;

type Prices = Record<PriceToken, Dnum | null>;

const initialPrices: Prices = {
  [BOLD_TOKEN_SYMBOL]: dn.from(1, 18),
  LQTY: null,
  LUSD: dn.from(1, 18),

  // collaterals
  ...(() => Object.fromEntries(
    COLL_SYMBOLS.map(symbol => [symbol, null])
  ))() as Record<CollateralSymbol, null>
};

const PRICE_REFRESH_INTERVAL = 60_000;

function useWatchCollateralPrice(collateral: CollateralSymbol) {
  const PriceFeed = getCollateralContract(collateral, "PriceFeed");
  return useReadContract({
    ...(PriceFeed as NonNullable<typeof PriceFeed>),
    functionName: "lastGoodPrice",
    query: {
      enabled: PriceFeed !== null,
      refetchInterval: PRICE_REFRESH_INTERVAL,
    },
  });
}

const coinGeckoTokenIds = {
  LQTY: "liquity",
  LUSD: "liquity-usd",
} as const;

function useCoinGeckoPrice(supportedSymbol: keyof typeof coinGeckoTokenIds) {
  const lqtyAndLusdPrices = useQuery({
    queryKey: ["coinGeckoPrice", Object.keys(coinGeckoTokenIds).join("+")],
    queryFn: async () => {
      const ids = Object.values(coinGeckoTokenIds);
      const symbols = Object.keys(coinGeckoTokenIds);

      const response = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?vs_currencies=usd&ids=${ids.join(",")}`,
        { headers: { accept: "application/json" } },
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch price for ${ids.join(",")}`);
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

      const prices = {} as Record<typeof supportedSymbol, Dnum | null>;

      for (const [id, value] of Object.entries(result) as Entries<typeof result>) {
        const idIndex = ids.indexOf(id);
        const key = symbols[idIndex] as typeof supportedSymbol;
        prices[key] = value.usd ? dn.from(value.usd, 18) : null;
      }

      return prices;
    },
    refetchInterval: PRICE_REFRESH_INTERVAL,
  });

  return {
    ...lqtyAndLusdPrices,
    data: lqtyAndLusdPrices.data?.[supportedSymbol] ?? null,
  };
}

let useWatchPrices = function useWatchPrices(callback: (prices: Prices) => void): void {
  const lqtyPrice = useCoinGeckoPrice("LQTY");
  const lusdPrice = useCoinGeckoPrice("LUSD");
  const collateralPriceMap = Object.fromEntries(
    COLL_SYMBOLS.map(symbol => [
      // eslint-disable-next-line react-hooks/rules-of-hooks
      symbol, useWatchCollateralPrice(symbol)
    ])
  )

  // @ts-ignore
  const prevPrices = useRef<Prices>({
    [BOLD_TOKEN_SYMBOL]: null,
    LQTY: null,
    LUSD: null,
    ...Object.fromEntries(COLL_SYMBOLS.map(symbol => [symbol, null])),
  });

  useEffect(() => {
    const newPrices = {
      [BOLD_TOKEN_SYMBOL]: dn.from(1, 18), // TODO
      LQTY: lqtyPrice.data ? dn.from(lqtyPrice.data, 18) : null,
      LUSD: lusdPrice.data ? dn.from(lusdPrice.data, 18) : null,
      ...Object.fromEntries(
        COLL_SYMBOLS.map(symbol => [symbol, collateralPriceMap[symbol].data ? dnum18(collateralPriceMap[symbol].data) : null])
      )
    } as Prices

    const hasChanged = jsonStringifyWithDnum(newPrices) !== jsonStringifyWithDnum(prevPrices.current);

    if (hasChanged) {
      callback(newPrices);
      prevPrices.current = newPrices;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    callback,
    lqtyPrice,
    lusdPrice,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ...Object.values(collateralPriceMap),
  ]);
};

// in demo mode, simulate a variation of the prices
if (DEMO_MODE) {
  useWatchPrices = (callback) => {
    useEffect(() => {
      const update = () => {
        const variation = () => dn.from((Math.random() - 0.5) * DEMO_PRICE_UPDATE_VARIATION, 18);
        callback({
          [BOLD_TOKEN_SYMBOL]: dn.add(DEMO_BOLD_PRICE, dn.mul(DEMO_BOLD_PRICE, variation())),
          LQTY: dn.add(DEMO_LQTY_PRICE, dn.mul(DEMO_LQTY_PRICE, variation())),
          LUSD: dn.add(DEMO_LUSD_PRICE, dn.mul(DEMO_LUSD_PRICE, variation())),
          // @ts-ignore
          ETH: dn.add(DEMO_ETH_PRICE, dn.mul(DEMO_ETH_PRICE, variation())),
          // @ts-ignore
          RETH: dn.add(DEMO_RETH_PRICE, dn.mul(DEMO_RETH_PRICE, variation())),
          // @ts-ignore
          WSTETH: dn.add(DEMO_WSTETH_PRICE, dn.mul(DEMO_WSTETH_PRICE, variation())),
        });
      };

      const timer = DEMO_PRICE_UPDATE_MANUAL
        ? undefined
        : setInterval(update, DEMO_PRICE_UPDATE_INTERVAL);

      update();

      return () => clearInterval(timer);
    }, []);
  };
}

const PriceContext = createContext<{
  prices: Prices;
  setPrices: Dispatch<SetStateAction<Prices>>;
}>({
  prices: initialPrices,
  setPrices: () => {},
});

export function Prices({ children }: { children: ReactNode }) {
  const [prices, setPrices] = useState<Prices>(initialPrices);

  useWatchPrices(setPrices);

  return (
    <PriceContext.Provider value={{ prices, setPrices }}>
      {children}
    </PriceContext.Provider>
  );
}

export function useAllPrices() {
  const { prices } = useContext(PriceContext);
  return prices;
}

function getTokenAddress(token: Token["symbol"] | undefined,) {
  const contracts = getContracts();
  return match(token)
    .when(
      (symbol) => Boolean(symbol && isCollateralSymbol(symbol)),
      (symbol) => {
        if (!symbol || !isCollateralSymbol(symbol)) {
          return null;
        }
        const collateral = contracts.collaterals.find((c) => c.symbol === symbol);
        return collateral?.contracts.CollToken.address ?? null;
      },
    )
    .with(BOLD_TOKEN_SYMBOL, () => CONTRACT_BOLD_TOKEN)
    .with("LQTY", () => CONTRACT_LQTY_TOKEN)
    .with("LUSD", () => CONTRACT_LUSD_TOKEN)
    .otherwise(() => null);

}

export function usePrice(token: PriceToken | null) {
  const { prices } = useContext(PriceContext);
  const tokenAddress = token && getTokenAddress(token);
  const isNrERC20Token = ['ETH', 'USDB'].includes(token ?? '');

  const {data: stERC20PerToken} = useReadContract({
    abi: NrERC20,
    address: tokenAddress ?? '0x',
    functionName: 'stERC20PerToken',
    query: {
      enabled: !!tokenAddress && isNrERC20Token
    }
  })

  const price = (() => {
    if (!token) {
      return null;
    }
    if (isNrERC20Token) {
      if (!stERC20PerToken || !prices[token]) {
        return null;
      }
      const nrERC20Price = prices[token];
      const stERC20Price = dn.div(dn.mul(nrERC20Price, 1000000000n), stERC20PerToken);;

      return stERC20Price;
    }
    return prices[token];
  })();

  return price;
}

export function useUpdatePrice() {
  const { setPrices } = useContext(PriceContext);
  return (token: PriceToken, price: Dnum | null) => {
    setPrices((prices) => ({ ...prices, [token]: price }));
  };
}
