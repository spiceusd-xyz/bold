/* eslint-disable react/jsx-key */
/* eslint-disable import/no-anonymous-default-export */

import { BOLD_TOKEN_SYMBOL } from "@liquity2/uikit";
import type { ReactNode as N } from "react";

export default {
  // Used in the top bar and other places
  appName: "SpiceUSD",

  // Menu bar
  menu: {
    dashboard: "Dashboard",
    borrow: "Borrow",
    multiply: "Multiply",
    earn: "Earn",
    stake: "Stake",
  },

  accountButton: {
    wrongNetwork: "Wrong network",
    connectAccount: "Connect",
  },

  generalInfotooltips: {
    loanLiquidationRisk: [
      "Liquidation risk",
      <>
        If the LTV of a loan goes above the max LTV, it becomes undercollateralized and will be liquidated. In that
        case, the borrower's debt is paid off but they lose most of their collateral. In order to avoid liquidation, one
        can increase the collateral or reduce the debt.
      </>,
    ],
    loanRedemptionRisk: [
      "Redemption risk",
      <>
        Users paying the lowest interest rate can get redeemed, if the price of {BOLD_TOKEN_SYMBOL} falls below $1. By raising your
        interest rate, you reduce this risk.
      </>,
    ],
    loanLtv: [
      "Loan-to-value ratio",
      <>
        The ratio between the amount of {BOLD_TOKEN_SYMBOL} borrowed and the deposited collateral (in USD).
      </>,
    ],
    loanMaxLtv: [
      "Maximum Loan-To-Value (LTV) Ratio",
      <>
        The maximum ratio between the USD value of a loan (in {BOLD_TOKEN_SYMBOL}) and the collateral backing it. The LTV will
        fluctuate as the price of the collateral changes. To decrease the LTV add more colateral or reduce debt.
      </>,
    ],
    loanLiquidationPrice: [
      "Liquidation price",
      <>The collateral price at which a loan can be liquidated.</>,
    ],
    ethPrice: (symbol: string) => [
      `${symbol} Price`,
      <>
        The current price of ETH, as reported by the oracle. The {symbol} price is used to calculate the Loan-To-Value (LTV)
        ratio of a loan.
      </>,
    ],
    interestRateBoldPerYear: [
      "Interest rate",
      <>
        The annualized interest amount in {BOLD_TOKEN_SYMBOL} for the selected interest rate. The accumulated interest is added to the
        loan.
      </>,
    ],
    interestRateAdjustment: [
      "Interest rate adjustment",
      <>
        The interest rate can be adjusted at any time. If it is adjusted within less than seven days of the last
        adjustment, there is a fee.
      </>,
    ],
    redeemedLoan: {
      heading: "Your collateral and debt are reduced by the same value.",
      body: (
        <>
          When {BOLD_TOKEN_SYMBOL} trades for under $1, anyone can redeem positions to get {BOLD_TOKEN_SYMBOL} back at $1. Positions with the lowest
          interest rate get redeemed first.
        </>
      ),
      footerLink: {
        href: "https://docs.liquity.org/v2-faq/redemptions-and-delegation",
        label: "Learn more",
      },
    },
  },

  // Redemption info box
  redemptionInfo: {
    title: "Redemptions in a nutshell",
    subtitle: (
      <>
        Redemptions help maintain {BOLD_TOKEN_SYMBOL}’s peg in a decentralized way. If a user is redeemed, their collateral and debt
        are reduced equally, resulting in no net loss.
      </>
    ),
    infoItems: [
      {
        icon: BOLD_TOKEN_SYMBOL,
        text: `Redemptions occur when ${BOLD_TOKEN_SYMBOL} drops below $1.`,
      },
      {
        icon: "redemption",
        text: "Redemptions first affect loans with the lowest interest rate.",
      },
      {
        icon: "interest",
        text: "Raising the interest rate reduces your redemption risk.",
      },
    ],
    learnMore: {
      text: "Learn more about redemptions",
      href: "https://docs.liquity.org/v2-faq/redemptions-and-delegation",
    },
  },

  interestRateField: {
    delegateModes: {
      manual: {
        label: "Manual",
        secondary: <>The interest rate is set manually and can be updated at any time.</>,
      },
      delegate: {
        label: "Delegated",
        secondary: <>The interest rate is set and updated by a third party of your choice. They may charge a fee.</>,
      },
      strategy: {
        label: "Automated (ICP)",
        secondary: (
          <>
            The interest rate is set and updated by an automated strategy running on the decentralized Internet Computer
            (ICP).
          </>
        ),
      },
    },

    icStrategyModal: {
      title: (
        <>
          Automated Strategies (<abbr title="Internet Computer">ICP</abbr>)
        </>
      ),
      intro: (
        <>
          These strategies are run on the Internet Computer (ICP). They are automated and decentralized. More strategies
          will be added over time.
        </>
      ),
    },

    delegatesModal: {
      title: "Set a delegate",
      intro: (
        <>
          The interest rate is set and updated by a third party of your choice. They may charge a fee.
        </>
      ),
    },
  },

  closeLoan: {
    claimOnly: (
      <>
        You are reclaiming your collateral and closing the position. The deposit will be returned to your wallet.
      </>
    ),
    repayWithBoldMessage: (
      <>
        You are repaying your debt and closing the position. The deposit will be returned to your wallet.
      </>
    ),
    repayWithCollateralMessage: (
      <>
        To close your position, a part of your collateral will be sold to pay back the debt. The rest of your collateral
        will be returned to your wallet.
      </>
    ),
    buttonRepayAndClose: "Repay & close",
    buttonReclaimAndClose: "Reclaim & close",
  },

  // Home screen
  home: {
    openPositionTitle: "Open your first position",
    myPositionsTitle: "My positions",
    actions: {
      borrow: {
        title: "Borrow",
        description: `Mint ${BOLD_TOKEN_SYMBOL} against your collateral at whatever interest rate you want`,
      },
      multiply: {
        title: "Multiply",
        description: "Increase your exposure to ETH and its staking yield with a single click",
      },
      earn: {
        title: `Earn with ${BOLD_TOKEN_SYMBOL}`,
        description: `Deposit ${BOLD_TOKEN_SYMBOL} to earn protocol revenues and liquidation proceeds`,
      },
      stake: {
        title: "Stake LQTY",
        description: "Direct protocol incentives with LQTY while earning from Liquity V1",
      },
    },
    statsBar: {
      label: "Protocol stats",
    },
    infoTooltips: {
      avgInterestRate: [
        "The current average interest rate being paid by ETH-backed positions.",
      ],
      spApr: [
        "Annual Percentage Rate",
        "The annual percentage rate being earned by each stability pool’s deposits over the past 7 days.",
      ],
      spTvl: [
        "Total Value Locked",
        `The total amount of ${BOLD_TOKEN_SYMBOL} deposited in each stability pool.`,
      ],
      borrowTvl: [
        "Total Value Locked",
        "The total amount of collateral deposited.",
      ],
    },
  },

  // Borrow screen
  borrowScreen: {
    headline: (tokensIcons: N, boldIcon: N) => (
      <>
        Borrow {boldIcon} {BOLD_TOKEN_SYMBOL} with {tokensIcons} ETH
      </>
    ),
    depositField: {
      label: "You deposit",
    },
    borrowField: {
      label: "You borrow",
    },
    liquidationPriceField: {
      label: "ETH liquidation price",
    },
    interestRateField: {
      label: "Interest rate",
    },
    action: "Next: Summary",
    infoTooltips: {
      interestRateSuggestions: [
        `Positions with lower interest rates are the first to be redeemed by ${BOLD_TOKEN_SYMBOL} holders.`,
      ],
    },
  },

  // Multiply screen
  leverageScreen: {
    headline: (tokensIcons: N) => (
      <>
        Multiply your exposure to {tokensIcons}
      </>
    ),
    depositField: {
      label: "You deposit",
    },
    liquidationPriceField: {
      label: "ETH liquidation price",
    },
    interestRateField: {
      label: "Interest rate",
    },
    action: "Next: Summary",
    infoTooltips: {
      leverageLevel: [
        "Multiply level",
        <>
          Choose the amplification of your exposure. Note that a higher level means higher liquidation risk. You are
          responsible for your own assessment of what a suitable level is.
        </>,
      ],
      interestRateSuggestions: [
        <>
          Positions with lower interest rates are the first to be redeemed by {BOLD_TOKEN_SYMBOL} holders.
        </>,
      ],
      exposure: [
        "Exposure",
        <>
          Your total exposure to the collateral asset after amplification.
        </>,
      ],
    },
  },

  // Earn home screen
  earnHome: {
    headline: (tokensIcons: N, boldIcon: N) => (
      <>
        Deposit {boldIcon} {BOLD_TOKEN_SYMBOL} to earn rewards {tokensIcons}
      </>
    ),
    subheading: (
      <>
        A {BOLD_TOKEN_SYMBOL} deposit in a stability pool earns rewards from the fees that users pay on their loans. Also, in case the
        system needs to liquidate positions, the {BOLD_TOKEN_SYMBOL} may be swapped to collateral.
      </>
    ),
    poolsColumns: {
      pool: "Pool",
      apr: "APR",
      myDepositAndRewards: "My Deposits and Rewards",
    },
    infoTooltips: {
      tvl: (collateral: N) => [
        <>Total {BOLD_TOKEN_SYMBOL} covering {collateral}-backed position liquidations</>,
      ],
    },
  },

  // Earn screen
  earnScreen: {
    backButton: "See all pools",
    headerPool: (pool: N) => <>{pool} pool</>,
    headerTvl: (tvl: N) => (
      <>
        <abbr title="Total Value Locked">TVL</abbr> {tvl}
      </>
    ),
    headerApr: () => (
      <>
        Current <abbr title="Annual percentage rate">APR</abbr>
      </>
    ),
    accountPosition: {
      depositLabel: "My deposit",
      shareLabel: "Pool share",
      rewardsLabel: "My rewards",
    },
    tabs: {
      deposit: "Deposit",
      claim: "Claim rewards",
    },
    depositPanel: {
      label: "Increase deposit",
      shareLabel: "Pool share",
      claimCheckbox: "Claim rewards",
      action: "Next: Summary",
    },
    withdrawPanel: {
      label: "Decrease deposit",
      claimCheckbox: "Claim rewards",
      action: "Next: Summary",
    },
    rewardsPanel: {
      boldRewardsLabel: "Your earnings from protocol revenue distributions to this stability pool",
      collRewardsLabel: "Your proceeds from liquidations conducted by this stability pool",
      totalUsdLabel: "Total in USD",
      expectedGasFeeLabel: "Expected gas fee",
      action: "Next: Summary",
    },
    infoTooltips: {
      tvl: (collateral: N) => [
        <>Total {BOLD_TOKEN_SYMBOL} covering {collateral}-backed position liquidations.</>,
      ],
      depositPoolShare: [
        `Percentage of your ${BOLD_TOKEN_SYMBOL} deposit compared to the total deposited in this stability pool.`,
      ],
      alsoClaimRewardsDeposit: [
        <>
          If checked, rewards are paid out as part of the update transaction.
        </>,
      ],
      alsoClaimRewardsWithdraw: [
        <>
          If checked, rewards are paid out as part of the update transaction.<br />
          Note: This needs to be checked to fully withdraw from the Stability Pool.
        </>,
      ],
      currentApr: [
        `Average annualized return for ${BOLD_TOKEN_SYMBOL} deposits over the past 7 days.`,
      ],
      rewardsEth: [
        "ETH rewards",
        "Your proceeds from liquidations conducted by this stability pool.",
      ],
      rewardsBold: [
        `${BOLD_TOKEN_SYMBOL} rewards`,
        "Your earnings from protocol revenue distributions to this stability pool.",
      ],
    },
  },

  // Stake screen
  stakeScreen: {
    headline: (lqtyIcon: N) => (
      <>
        <span>Stake</span>
        {lqtyIcon} <span>LQTY & get</span>
        <span>voting power</span>
      </>
    ),
    subheading: (
      <>
        By staking LQTY you can vote on incentives for Liquity V2, while still earning Liquity V1 fees.
      </>
    ),
    learnMore: ["https://docs.liquity.org/faq/staking", "Learn more"],
    accountDetails: {
      myDeposit: "My deposit",
      votingPower: "Voting power",
      votingPowerHelp: (
        <>
          Voting power is the percentage of the total staked LQTY that you own.
        </>
      ),
      unclaimed: "Unclaimed rewards",
    },
    tabs: {
      deposit: "Staking",
      rewards: "Rewards",
      voting: "Voting",
    },
    depositPanel: {
      label: "Deposit",
      shareLabel: "Pool share",
      rewardsLabel: "Available rewards",
      action: "Next: Summary",
    },
    rewardsPanel: {
      label: "You claim",
      details: (usdAmount: N, fee: N) => (
        <>
          ~${usdAmount} • Expected gas fee ~${fee}
        </>
      ),
      action: "Next: Summary",
    },
    votingPanel: {
      title: "Allocate your voting power",
      intro: (
        <>
          Direct incentives from Liquity V2 protocol revenues towards liquidity providers for {BOLD_TOKEN_SYMBOL}. Upvote from Thursday
          to Tuesday. Downvote all week. <Link href="https://docs.liquity.org/v2-faq/lqty-staking">Learn more</Link>
        </>
      ),
    },
    infoTooltips: {
      alsoClaimRewardsDeposit: [
        <>
          Rewards will be paid out as part of the update transaction.
        </>,
      ],
    },
  },
} as const;

function Link({
  href,
  children,
}: {
  href: string;
  children: N;
}) {
  const props = !href.startsWith("http") ? {} : {
    target: "_blank",
    rel: "noopener noreferrer",
  };
  return (
    <a href={href} {...props}>
      {children}
    </a>
  );
}
