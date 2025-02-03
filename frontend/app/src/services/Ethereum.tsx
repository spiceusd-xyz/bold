"use client";

import "@rainbow-me/rainbowkit/styles.css";

import type { CollIndex, Token } from "@/src/types";
import type { Address, CollateralSymbol, TokenSymbol } from "@liquity2/uikit";
import type { ComponentProps, ReactNode } from "react";
import type { Chain } from "wagmi/chains";
import type { Config as WagmiConfig } from "wagmi";

import { getCollateralContract, getContracts } from "@/src/contracts";
import { ACCOUNT_BALANCES } from "@/src/demo-mode";
import { useDemoMode } from "@/src/demo-mode";
import * as dn from "dnum";
import { dnum18 } from "@/src/dnum-utils";
import {
  CHAIN_BLOCK_EXPLORER,
  CHAIN_CONTRACT_ENS_REGISTRY,
  CHAIN_CONTRACT_ENS_RESOLVER,
  CHAIN_CONTRACT_MULTICALL,
  CHAIN_CURRENCY,
  CHAIN_ID,
  CHAIN_NAME,
  CHAIN_RPC_URL,
  CONTRACT_BOLD_TOKEN,
  CONTRACT_LQTY_TOKEN,
  CONTRACT_LUSD_TOKEN,
  WALLET_CONNECT_PROJECT_ID,
} from "@/src/env";
import { getSafeStatus } from "@/src/safe-utils";
import { noop } from "@/src/utils";
import { BOLD_TOKEN_SYMBOL, isCollateralSymbol, useTheme } from "@liquity2/uikit";
import {
  getDefaultConfig,
  lightTheme,
  RainbowKitProvider,
  useAccountModal,
  useConnectModal,
} from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  injectedWallet,
  metaMaskWallet,
  rabbyWallet,
  safeWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { match } from "ts-pattern";
import { erc20Abi } from "viem";
import {
  http,
  useAccount as useAccountWagmi,
  useBalance as useBalanceWagmi,
  useEnsName,
  useReadContract,
  WagmiProvider,
} from "wagmi";
import { CONTRACT_USDB_TOKEN } from "../constants";
import { NrERC20 } from "../abi/NrERC20";
import { readContract } from "@wagmi/core";

export function Ethereum({ children }: { children: ReactNode }) {
  const wagmiConfig = useWagmiConfig();
  const rainbowKitProps = useRainbowKitProps();
  return (
    <WagmiProvider config={wagmiConfig}>
      <RainbowKitProvider {...rainbowKitProps}>
        {children}
      </RainbowKitProvider>
    </WagmiProvider>
  );
}

export function useAccount():
  & Omit<ReturnType<typeof useAccountWagmi>, "connector">
  & {
    connect: () => void;
    disconnect: () => void;
    ensName: string | undefined;
    safeStatus: Awaited<ReturnType<typeof getSafeStatus>> | null;
  }
{
  const demoMode = useDemoMode();
  const account = useAccountWagmi();
  const { openConnectModal } = useConnectModal();
  const { openAccountModal } = useAccountModal();
  const ensName = useEnsName({ address: account?.address });

  const safeStatus = useQuery({
    queryKey: ["safeStatus", account.address],
    enabled: Boolean(account.address),
    queryFn: () => {
      if (!account.address) {
        throw new Error("No account address");
      }
      return getSafeStatus(account.address);
    },
    staleTime: Infinity,
    refetchInterval: false,
  });

  if (demoMode.enabled) {
    return demoMode.account;
  }

  return {
    ...account,
    connect: openConnectModal || noop,
    disconnect: account.isConnected && openAccountModal || noop,
    ensName: ensName.data ?? undefined,
    safeStatus: safeStatus.data ?? null,
  };
}

export function useBalance(
  address: Address | undefined,
  token: Token["symbol"] | undefined,
) {
  const demoMode = useDemoMode();
  const contracts = getContracts();

  const tokenBalanceAddress = match(token)
    .when(
      (symbol) => Boolean(symbol && isCollateralSymbol(symbol) && symbol !== "ETH"),
      (symbol) => {
        if (!symbol || !isCollateralSymbol(symbol) || symbol === "ETH") {
          return null;
        }
        if (symbol === 'USDB') {
          return CONTRACT_USDB_TOKEN;
        }
        const collateral = contracts.collaterals.find((c) => c.symbol === symbol);
        return collateral?.contracts.CollToken.address ?? null;
      },
    )
    .with("LUSD", () => CONTRACT_LUSD_TOKEN)
    .with(BOLD_TOKEN_SYMBOL, () => CONTRACT_BOLD_TOKEN)
    .with("LQTY", () => CONTRACT_LQTY_TOKEN)
    .otherwise(() => null);

  const tokenBalance = useReadContract({
    address: tokenBalanceAddress ?? undefined,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address && [address],
    query: {
      select: (value) => dnum18(value ?? 0n),
      enabled: Boolean(!demoMode.enabled && address && token !== "ETH"),
    },
  });

  const ethBalance = useBalanceWagmi({
    address,
    query: {
      select: ({ value }) => dnum18(value ?? 0n),
      enabled: Boolean(!demoMode.enabled && address && token === "ETH"),
    },
  });

  return demoMode.enabled && token
    ? { data: ACCOUNT_BALANCES[token as keyof typeof ACCOUNT_BALANCES] ?? dn.from(0), isLoading: false }
    : (token === "ETH" ? ethBalance : tokenBalance);
}

function useRainbowKitProps(): Omit<ComponentProps<typeof RainbowKitProvider>, "children"> {
  const theme = useTheme();
  return {
    modalSize: "compact",
    theme: lightTheme({
      accentColor: theme.color("accent"),
    }),
  };
}

export function useWagmiConfig() {
  return useMemo(() => {
    const chain = createChain({
      id: CHAIN_ID,
      name: CHAIN_NAME,
      currency: CHAIN_CURRENCY,
      rpcUrl: CHAIN_RPC_URL,
      blockExplorer: CHAIN_BLOCK_EXPLORER,
      contractEnsRegistry: CHAIN_CONTRACT_ENS_REGISTRY ?? undefined,
      contractEnsResolver: CHAIN_CONTRACT_ENS_RESOLVER ?? undefined,
      contractMulticall: { address: CHAIN_CONTRACT_MULTICALL },
    });
    return getDefaultConfig({
      appName: "Liquity V2",
      projectId: WALLET_CONNECT_PROJECT_ID,
      chains: [chain],
      wallets: [{
        groupName: "Suggested",
        wallets: [
          injectedWallet,
          rabbyWallet,
          metaMaskWallet,
          coinbaseWallet,
          safeWallet,
          walletConnectWallet,
        ],
      }],
      transports: {
        [chain.id]: http(CHAIN_RPC_URL),
      },
      ssr: true,
    });
  }, [
    CHAIN_BLOCK_EXPLORER,
    CHAIN_CONTRACT_ENS_REGISTRY,
    CHAIN_CONTRACT_ENS_RESOLVER,
    CHAIN_CONTRACT_MULTICALL,
    CHAIN_CURRENCY,
    CHAIN_ID,
    CHAIN_NAME,
    CHAIN_RPC_URL,
    WALLET_CONNECT_PROJECT_ID,
  ]);
}

function createChain({
  id,
  name,
  currency,
  rpcUrl,
  blockExplorer,
  contractEnsRegistry,
  contractEnsResolver,
  contractMulticall,
}: {
  id: number;
  name: string;
  currency: { name: string; symbol: string; decimals: number };
  rpcUrl: string;
  blockExplorer?: { name: string; url: string };
  contractEnsRegistry?: { address: Address; block?: number };
  contractEnsResolver?: { address: Address; block?: number };
  contractMulticall?: { address: Address; block?: number };
}): Chain {
  return {
    id,
    name,
    nativeCurrency: currency,
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
    blockExplorers: blockExplorer && {
      default: blockExplorer,
    },
    contracts: {
      ensRegistry: contractEnsRegistry,
      ensUniversalResolver: contractEnsResolver,
      multicall3: contractMulticall,
    },
  } satisfies Chain;
}

export function getIsNrERC20Token (symbol: TokenSymbol | null | undefined) {
  return ['ETH', 'USDB'].includes(symbol ?? '');
}

export function useNrERC20Amount(symbol: CollateralSymbol | null, stERC20Amount: dn.Dnum | null | undefined) {
  const isNrERC20Token = getIsNrERC20Token(symbol);

  const {data: tokensPerStERC20} = useReadContract({
    abi: NrERC20,
    address: getCollateralContract(symbol, 'CollToken')?.address,
    functionName: 'tokensPerStERC20',
    query: {
      enabled: isNrERC20Token,
    }
  });

  if (!isNrERC20Token) {
    return stERC20Amount;
  }

  if (!tokensPerStERC20 || !stERC20Amount) {
    return;
  }

  return dn.setDecimals(dn.div(dn.mul(stERC20Amount, tokensPerStERC20), 1e9), 9);
}


export function useStERC20Amount(symbol: TokenSymbol | CollIndex | null | undefined, nrERC20Amount: dn.Dnum | null | undefined) {
  const collateral = getContracts().collaterals.find(collateral => typeof symbol === 'number' ? collateral.collIndex === symbol : collateral.symbol === symbol);
  const isNrERC20Token = getIsNrERC20Token(collateral?.symbol);

  const {data: stERC20PerToken} = useReadContract({
    abi: NrERC20,
    address: collateral?.contracts.CollToken.address,
    functionName: 'stERC20PerToken',
    query: {
      enabled: isNrERC20Token,
    }
  });

  if (!isNrERC20Token) {
    return nrERC20Amount;
  }

  if (!stERC20PerToken || !nrERC20Amount) {
    return;
  }

  return dn.div(dn.mul(dn.setDecimals(nrERC20Amount, 18), stERC20PerToken), 1e18);
}

export async function getStERC20Amount(symbol: CollateralSymbol, collAmount: dn.Dnum, wagmiConfig: WagmiConfig) {
  const collateral = getContracts().collaterals.find(collateral => typeof symbol === 'number' ? collateral.collIndex === symbol : collateral.symbol === symbol)!;
  const isNrERC20Token = getIsNrERC20Token(collateral?.symbol);

  if (!isNrERC20Token) {
    return collAmount;
  }

  const stERC20PerToken = await readContract(wagmiConfig, {
    abi: NrERC20,
    address: getCollateralContract(symbol, 'CollToken')?.address ?? '0x',
    functionName: 'stERC20PerToken',
  });

  return dn.div(dn.mul(dn.setDecimals(collAmount, 18), stERC20PerToken), 1e18);
}


export function getApprovalAddress (symbol: CollateralSymbol) {
  return symbol === 'USDB' ? CONTRACT_USDB_TOKEN :
    getContracts().collaterals.find(collateral => collateral.symbol === symbol)!.contracts.CollToken.address;
}

export async function getApprovalAmount (symbol: CollateralSymbol, collAmount: dn.Dnum, wagmiConfig: WagmiConfig): Promise<bigint> { 
  const stERC20Amount = await getStERC20Amount(symbol, collAmount, wagmiConfig);
  const approvalAmount = dn.mul(stERC20Amount, 1.01);
  return approvalAmount[0];
}
