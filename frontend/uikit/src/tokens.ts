import type { Token } from "./types";

import tokenBold from "./token-icons/SUSD.svg";
import tokenEth from "./token-icons/eth.svg";
import tokenLqty from "./token-icons/lqty.svg";
import tokenLusd from "./token-icons/lusd.svg";
import tokenUsdb from "./token-icons/USDB.png";
import tokenBlast from "./token-icons/BLAST.png";
import tokenFnx from "./token-icons/FNX.png";
import tokenHyper from "./token-icons/HYPER.png";
import tokenThrust from "./token-icons/THRUSTER.png";


export type CollateralSymbols = ["ETH", "USDB", "BLAST", "FNX", "HYPER", "THRUST"];

export type CollateralSymbol = CollateralSymbols[number];

export function isCollateralSymbol(symbol: string): symbol is CollateralSymbol { 
  return symbol === "ETH" || symbol === "RETH" || symbol === "WSTETH" || symbol === "ETH" || symbol === "USDB" || symbol === "BLAST" || symbol === "FNX" || symbol === "HYPER" || symbol === "THRUST";
}

export type CollateralToken = Token & {
  collateralRatio: number;
  symbol: CollateralSymbol;
};

export const LUSD: Token = {
  icon: tokenLusd,
  name: "LUSD",
  symbol: "LUSD" as const,
} as const;

export const BOLD: Token = {
  icon: tokenBold,
  name: "BOLD",
  symbol: "BOLD" as const,
} as const;

export const LQTY: Token = {
  icon: tokenLqty,
  name: "LQTY",
  symbol: "LQTY" as const,
} as const;

export const ETH : CollateralToken = {
  collateralRatio: 1.25,
  icon: tokenEth,
  // name: "Ether",
  name: "ETH",
  symbol: "ETH" as const,
};
export const USDB : CollateralToken = {
  collateralRatio: 1.11,
  icon: tokenUsdb,
  // name: "USDB",
  name: "USDB",
  symbol: "USDB" as const,
};
export const BLAST : CollateralToken = {
  collateralRatio: 1.42,
  icon: tokenBlast,
  // name: "Blast",
  name: "BLAST",
  symbol: "BLAST" as const,
};
export const FNX : CollateralToken = {
  collateralRatio: 1.66,
  icon: tokenFnx,
  // name: "Fenix",
  name: "FNX",
  symbol: "FNX" as const,
};
export const HYPER : CollateralToken = {
  collateralRatio: 1.66,
  icon: tokenHyper,
  // name: "Hyper",
  name: "HYPER",
  symbol: "HYPER" as const,
};
export const THRUST : CollateralToken = {
  collateralRatio: 1.66,
  icon: tokenThrust,
  // name: "Thrust",
  name: "THRUST",
  symbol: "THRUST" as const,
};

export const COLLATERALS: CollateralToken[] = [
  ETH,
  USDB,
  BLAST,
  FNX,
  HYPER,
  THRUST,
];

export const TOKENS_BY_SYMBOL = {
  BOLD,
  LQTY,
  LUSD,
  ETH,
  USDB,
  BLAST,
  FNX,
  HYPER,
  THRUST,
} as const;
