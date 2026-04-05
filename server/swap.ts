import { encodeFunctionData, encodePacked, formatUnits, parseUnits } from "viem";

import {
  erc20Abi,
  quoterV2Abi,
  swapRouterAbi,
  uniswapV2FactoryAbi,
  uniswapV2RouterAbi,
  uniswapV3FactoryAbi,
  wethAbi,
} from "./abis.js";
import type { PrimeBotConfig, TokenConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { SwapIntent } from "./intent.js";
import type { TradeAnalysis } from "./opengradient.js";
import { fetchLiFiSameChainQuote } from "./lifi.js";
import { fetchZeroExPrice, fetchZeroExQuote } from "./zeroex.js";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const COMPETITIVE_ROUTE_BPS = 9_975n;
const V2_BASE_GAS = 145_000n;
const V2_EXTRA_HOP_GAS = 45_000n;

export type RoutePreference = "balanced" | "best_return" | "safer" | "lower_gas";

export type SwapRouteOption = {
  preference: RoutePreference;
  title: string;
  summary: string;
  route: string;
  expectedOut: string;
};

export type SwapRoutingSummary = {
  selectedPreference: RoutePreference;
  options: SwapRouteOption[];
};

type PreparedSwap = {
  tokenIn: TokenConfig;
  tokenOut: TokenConfig;
  normalizedTokenIn: TokenConfig;
  amountIn: bigint;
  route: RouteCandidate;
  routePreference: RoutePreference;
  routing: SwapRoutingSummary;
};

type RouteCandidate = {
  id: string;
  venue: "uniswap_v2" | "uniswap_v3" | "zeroex" | "lifi";
  routeType: "direct" | "multihop" | "aggregated";
  pathTokens: TokenConfig[];
  pathSymbols: string[];
  feeTiers: number[] | undefined;
  amountOut: bigint;
  amountOutMinimum: bigint;
  gasEstimate: bigint;
  slippageBps: number;
  spender?: `0x${string}`;
  quoteTx?: PreparedExecutionTx;
  sourceBreakdown?: string[];
};

export type PreparedExecutionTx = {
  to: `0x${string}`;
  data?: `0x${string}`;
  value: string;
};

export type SwapExecutionPlan = {
  kind: "swap";
  chainId: number;
  txs: PreparedExecutionTx[];
};

export async function executeSwap(
  config: PrimeBotConfig,
  publicClient: any,
  walletClient: any,
  intent: SwapIntent,
  analysis: TradeAnalysis,
): Promise<{ analysis: TradeAnalysis; txHash: `0x${string}` }> {
  if (intent.action !== "swap") {
    throw new AppError(400, "unsupported_action", `Unsupported action: ${intent.action}.`);
  }

  const prepared = await prepareSwap(config, publicClient, intent, config.account.address);
  const txs = await buildSwapExecutionTransactions(config, publicClient, prepared, config.account.address);
  let lastTxHash: `0x${string}` | undefined;

  for (const tx of txs) {
    const simulation = await publicClient.simulateTransaction({
      account: config.account.address,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });

    const txHash = await walletClient.sendTransaction({
      ...simulation.request,
      account: config.account,
      chain: simulation.request.chain ?? simulation.chain,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

    if (receipt.status !== "success") {
      throw new AppError(502, "swap_failed", "Swap transaction was submitted but did not succeed.", {
        txHash,
        status: receipt.status,
      });
    }

    lastTxHash = txHash;
  }

  if (!lastTxHash) {
    throw new AppError(500, "empty_execution_plan", "Swap execution did not produce any transactions.");
  }

  return {
    analysis: finalizeSwapAnalysis(analysis, prepared),
    txHash: lastTxHash,
  };
}

export async function previewSwap(
  config: PrimeBotConfig,
  publicClient: any,
  intent: SwapIntent,
  analysis: TradeAnalysis,
  routePreference: RoutePreference = "balanced",
): Promise<{ analysis: TradeAnalysis; routing: SwapRoutingSummary }> {
  const prepared = await prepareSwap(config, publicClient, intent, undefined, routePreference);

  return {
    analysis: finalizeSwapAnalysis(analysis, prepared),
    routing: prepared.routing,
  };
}

export async function prepareSwapExecution(
  config: PrimeBotConfig,
  publicClient: any,
  intent: SwapIntent,
  analysis: TradeAnalysis,
  walletAddress: `0x${string}`,
  routePreference: RoutePreference = "balanced",
): Promise<{ analysis: TradeAnalysis; execution: SwapExecutionPlan; routing: SwapRoutingSummary }> {
  const prepared = await prepareSwap(config, publicClient, intent, walletAddress, routePreference);
  const txs = await buildSwapExecutionTransactions(config, publicClient, prepared, walletAddress);

  return {
    analysis: finalizeSwapAnalysis(analysis, prepared),
    routing: prepared.routing,
    execution: {
      kind: "swap",
      chainId: 84532,
      txs,
    },
  };
}

async function prepareSwap(
  config: PrimeBotConfig,
  publicClient: any,
  intent: SwapIntent,
  executionWalletAddress?: `0x${string}`,
  routePreference: RoutePreference = "balanced",
): Promise<PreparedSwap> {
  if (intent.tokenOut === "ETH") {
    throw new AppError(400, "unsupported_token", "Swapping into native ETH is not enabled in this backend. Use WETH instead.");
  }

  const tokenIn = mustGetToken(config, intent.tokenIn);
  const tokenOut = mustGetToken(config, intent.tokenOut);
  const normalizedTokenIn = tokenIn.isNative ? mustGetToken(config, "WETH") : tokenIn;
  const amountIn = parseUnits(intent.amount, normalizedTokenIn.decimals);
  const routing = await findBestRoute(config, publicClient, normalizedTokenIn, tokenOut, amountIn, {
    allowAggregators: !intent.recipient,
    executionWalletAddress,
    routePreference,
  });

  return {
    tokenIn,
    tokenOut,
    normalizedTokenIn,
    amountIn,
    route: routing.selected,
    routePreference,
    routing: routing.summary,
  };
}

function finalizeSwapAnalysis(analysis: TradeAnalysis, prepared: PreparedSwap): TradeAnalysis {
  const normalizedAnalysis = normalizeQuotedTradeRisk(analysis, prepared);
  const routeSummary = describeRoute(prepared.route);

  return {
    ...normalizedAnalysis,
    route: routeSummary.routeLabel,
    expectedOut: `${formatUnits(prepared.route.amountOut, prepared.tokenOut.decimals)} ${prepared.tokenOut.symbol}`,
    reason: buildPlainLanguageReason(normalizedAnalysis, prepared),
  };
}

function normalizeQuotedTradeRisk(analysis: TradeAnalysis, prepared: PreparedSwap): TradeAnalysis {
  if (analysis.risk !== "high") {
    return analysis;
  }

  const normalizedReason = analysis.reason.toLowerCase();
  const isQuoteBackedConcern =
    prepared.route.amountOut > 0n &&
    ["testnet", "liquidity", "slippage", "illiquid"].some((term) => normalizedReason.includes(term));

  if (isQuoteBackedConcern) {
    return {
      ...analysis,
      risk: "medium",
      reason: `${analysis.reason} Reclassified to medium because PrimeBot found a live ${describeRoute(prepared.route).humanLabel}.`,
    };
  }

  throw new AppError(422, "unsafe_analysis", "OpenGradient marked this trade as high risk.", analysis);
}

async function findBestRoute(
  config: PrimeBotConfig,
  publicClient: any,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  options: {
    allowAggregators: boolean;
    executionWalletAddress?: `0x${string}`;
    routePreference: RoutePreference;
  },
) {
  const intermediaries = buildIntermediateTokens(config, tokenIn, tokenOut);
  const candidateGroups = await Promise.all([
    buildV3DirectCandidates(config, publicClient, tokenIn, tokenOut, amountIn),
    buildV3MultihopCandidates(config, publicClient, tokenIn, tokenOut, amountIn, intermediaries),
    buildV2DirectCandidate(config, publicClient, tokenIn, tokenOut, amountIn),
    buildV2MultihopCandidates(config, publicClient, tokenIn, tokenOut, amountIn, intermediaries),
    buildZeroExCandidates(config, tokenIn, tokenOut, amountIn, options),
    buildLiFiCandidates(config, tokenIn, tokenOut, amountIn, options),
  ]);
  const candidates: RouteCandidate[] = candidateGroups.flat().filter((candidate): candidate is RouteCandidate => candidate !== null);

  if (candidates.length === 0) {
    throw new AppError(422, "no_liquidity", `No supported route was found for ${tokenIn.symbol}/${tokenOut.symbol} on Base Sepolia.`);
  }

  const bestGross = candidates.reduce((best, candidate) => (candidate.amountOut > best ? candidate.amountOut : best), 0n);
  const competitiveFloor = (bestGross * COMPETITIVE_ROUTE_BPS) / 10_000n;
  const competitiveRoutes = candidates.filter((candidate) => candidate.amountOut >= competitiveFloor);
  const selected = selectRouteForPreference(candidates, competitiveRoutes, options.routePreference);

  if (!selected) {
    throw new AppError(422, "no_liquidity", `No supported route was found for ${tokenIn.symbol}/${tokenOut.symbol} on Base Sepolia.`);
  }

  return {
    selected,
    summary: buildRoutingSummary(tokenOut, candidates, competitiveRoutes, options.routePreference),
  };
}

function compareRoutes(left: RouteCandidate, right: RouteCandidate) {
  const leftSafety = computeSafetyPenalty(left);
  const rightSafety = computeSafetyPenalty(right);

  if (leftSafety !== rightSafety) {
    return leftSafety - rightSafety;
  }

  if (left.gasEstimate !== right.gasEstimate) {
    return left.gasEstimate < right.gasEstimate ? -1 : 1;
  }

  if (left.amountOut !== right.amountOut) {
    return left.amountOut > right.amountOut ? -1 : 1;
  }

  return left.id.localeCompare(right.id);
}

function selectRouteForPreference(
  candidates: RouteCandidate[],
  competitiveRoutes: RouteCandidate[],
  preference: RoutePreference,
) {
  const pool = competitiveRoutes.length > 0 ? competitiveRoutes : candidates;

  if (preference === "best_return") {
    return [...candidates].sort((left, right) => {
      if (left.amountOut !== right.amountOut) {
        return left.amountOut > right.amountOut ? -1 : 1;
      }
      return compareRoutes(left, right);
    })[0];
  }

  if (preference === "lower_gas") {
    return [...pool].sort((left, right) => {
      if (left.gasEstimate !== right.gasEstimate) {
        return left.gasEstimate < right.gasEstimate ? -1 : 1;
      }
      return compareRoutes(left, right);
    })[0];
  }

  if (preference === "safer") {
    return [...pool].sort(compareRoutes)[0];
  }

  return [...pool].sort(compareRoutes)[0];
}

function computeSafetyPenalty(route: RouteCandidate) {
  if (route.venue === "zeroex") {
    return 12 + (route.sourceBreakdown?.length ?? 1) * 2;
  }

  if (route.venue === "lifi") {
    return 14 + (route.sourceBreakdown?.length ?? 1) * 2;
  }

  return route.pathTokens.length * 10 + (route.venue === "uniswap_v2" ? 5 : 0);
}

function buildRoutingSummary(
  tokenOut: TokenConfig,
  candidates: RouteCandidate[],
  competitiveRoutes: RouteCandidate[],
  selectedPreference: RoutePreference,
): SwapRoutingSummary {
  const preferences: RoutePreference[] = ["balanced", "best_return", "safer", "lower_gas"];

  return {
    selectedPreference,
    options: preferences
      .map((preference) => {
        const route = selectRouteForPreference(candidates, competitiveRoutes, preference);
        if (!route) {
          return null;
        }

        const routeDescription = describeRoute(route);

        return {
          preference,
          title: getPreferenceTitle(preference),
          summary: getPreferenceSummary(preference, routeDescription.humanLabel),
          route: routeDescription.routeLabel,
          expectedOut: `${formatUnits(route.amountOut, tokenOut.decimals)} ${tokenOut.symbol}`,
        } satisfies SwapRouteOption;
      })
      .filter((option): option is SwapRouteOption => option !== null),
  };
}

function getPreferenceTitle(preference: RoutePreference) {
  if (preference === "best_return") {
    return "Best return";
  }

  if (preference === "safer") {
    return "Safer route";
  }

  if (preference === "lower_gas") {
    return "Lower gas";
  }

  return "PrimeBot pick";
}

function getPreferenceSummary(preference: RoutePreference, routeLabel: string) {
  if (preference === "best_return") {
    return `Favors the route with the strongest quoted output right now: ${routeLabel}.`;
  }

  if (preference === "safer") {
    return `Favors the route with fewer moving parts and more conservative execution: ${routeLabel}.`;
  }

  if (preference === "lower_gas") {
    return `Favors the route expected to cost less gas to execute: ${routeLabel}.`;
  }

  return `Balances output, gas, and route safety across the available options: ${routeLabel}.`;
}

async function buildV3DirectCandidates(
  config: PrimeBotConfig,
  publicClient: any,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
) {
  const quotes = await Promise.all(
    config.uniswap.feeTiers.map(async (feeTier) => {
      const poolAddress = await getV3Pool(publicClient, config, tokenIn, tokenOut, feeTier);
      if (!poolAddress) {
        return null;
      }

      const quoteResult = await safelyReadQuote(async () =>
        (await publicClient.readContract({
          address: config.uniswap.quoterV2Address,
          abi: quoterV2Abi,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn: tokenIn.address,
              tokenOut: tokenOut.address,
              amountIn,
              fee: feeTier,
              sqrtPriceLimitX96: 0n,
            },
          ],
        })) as readonly [bigint, bigint, number, bigint],
      );

      if (!quoteResult) {
        return null;
      }

      return buildCandidate({
        venue: "uniswap_v3",
        routeType: "direct",
        pathTokens: [tokenIn, tokenOut],
        feeTiers: [feeTier],
        amountOut: quoteResult[0],
        gasEstimate: quoteResult[3],
        defaultSlippageBps: config.uniswap.defaultSlippageBps,
      });
    }),
  );

  return quotes.filter(isRouteCandidate);
}

async function buildV3MultihopCandidates(
  config: PrimeBotConfig,
  publicClient: any,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  intermediaries: TokenConfig[],
) {
  const candidates = await Promise.all(
    intermediaries.flatMap((intermediate) =>
      config.uniswap.feeTiers.flatMap((feeA) =>
        config.uniswap.feeTiers.map(async (feeB) => {
          const [poolA, poolB] = await Promise.all([
            getV3Pool(publicClient, config, tokenIn, intermediate, feeA),
            getV3Pool(publicClient, config, intermediate, tokenOut, feeB),
          ]);

          if (!poolA || !poolB) {
            return null;
          }

          const path = encodeV3Path(
            [tokenIn.address, intermediate.address, tokenOut.address],
            [feeA, feeB],
          );
          const quoteResult = await safelyReadQuote(async () =>
            (await publicClient.readContract({
              address: config.uniswap.quoterV2Address,
              abi: quoterV2Abi,
              functionName: "quoteExactInput",
              args: [path, amountIn],
            })) as readonly [bigint, readonly bigint[], readonly number[], bigint],
          );

          if (!quoteResult) {
            return null;
          }

          return buildCandidate({
            venue: "uniswap_v3",
            routeType: "multihop",
            pathTokens: [tokenIn, intermediate, tokenOut],
            feeTiers: [feeA, feeB],
            amountOut: quoteResult[0],
            gasEstimate: quoteResult[3],
            defaultSlippageBps: config.uniswap.defaultSlippageBps,
          });
        }),
      ),
    ),
  );

  return candidates.filter(isRouteCandidate);
}

async function buildV2DirectCandidate(
  config: PrimeBotConfig,
  publicClient: any,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
) {
  const pathTokens = [tokenIn, tokenOut];
  if (!(await hasV2Path(config, publicClient, pathTokens))) {
    return [];
  }

  const amountsOut = await safelyReadQuote(async () =>
    (await publicClient.readContract({
      address: config.uniswap.v2RouterAddress,
      abi: uniswapV2RouterAbi,
      functionName: "getAmountsOut",
      args: [amountIn, pathTokens.map((token) => token.address)],
    })) as readonly bigint[],
  );

  if (!amountsOut) {
    return [];
  }

  return [
    buildCandidate({
      venue: "uniswap_v2",
      routeType: "direct",
      pathTokens,
      amountOut: amountsOut.at(-1) ?? 0n,
      gasEstimate: V2_BASE_GAS,
      defaultSlippageBps: config.uniswap.defaultSlippageBps,
    }),
  ];
}

async function buildV2MultihopCandidates(
  config: PrimeBotConfig,
  publicClient: any,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  intermediaries: TokenConfig[],
) {
  const candidates = await Promise.all(
    intermediaries.map(async (intermediate) => {
      const pathTokens = [tokenIn, intermediate, tokenOut];
      if (!(await hasV2Path(config, publicClient, pathTokens))) {
        return null;
      }

      const amountsOut = await safelyReadQuote(async () =>
        (await publicClient.readContract({
          address: config.uniswap.v2RouterAddress,
          abi: uniswapV2RouterAbi,
          functionName: "getAmountsOut",
          args: [amountIn, pathTokens.map((token) => token.address)],
        })) as readonly bigint[],
      );

      if (!amountsOut) {
        return null;
      }

      return buildCandidate({
        venue: "uniswap_v2",
        routeType: "multihop",
        pathTokens,
        amountOut: amountsOut.at(-1) ?? 0n,
        gasEstimate: V2_BASE_GAS + V2_EXTRA_HOP_GAS,
        defaultSlippageBps: config.uniswap.defaultSlippageBps,
      });
    }),
  );

  return candidates.filter(isRouteCandidate);
}

async function buildZeroExCandidates(
  config: PrimeBotConfig,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  options: {
    allowAggregators: boolean;
    executionWalletAddress?: `0x${string}`;
  },
) {
  if (!options.allowAggregators || !config.zeroEx.enabled) {
    return [];
  }

  const taker = options.executionWalletAddress ?? config.treasuryAddress;
  const quote = options.executionWalletAddress
    ? await fetchZeroExQuote(config, {
        sellToken: tokenIn,
        buyToken: tokenOut,
        sellAmount: amountIn,
        taker,
        slippageBps: config.uniswap.defaultSlippageBps,
      })
    : await fetchZeroExPrice(config, {
        sellToken: tokenIn,
        buyToken: tokenOut,
        sellAmount: amountIn,
        taker,
        slippageBps: config.uniswap.defaultSlippageBps,
      });

  if (!quote) {
    return [];
  }

  return [
    buildCandidate({
      venue: "zeroex",
      routeType: "aggregated",
      pathTokens: [tokenIn, tokenOut],
      amountOut: quote.amountOut,
      amountOutMinimum: quote.amountOutMinimum,
      gasEstimate: quote.gasEstimate,
      defaultSlippageBps: config.uniswap.defaultSlippageBps,
      spender: quote.spender,
      quoteTx: quote.transaction,
      sourceBreakdown: quote.sources,
    }),
  ];
}

async function buildLiFiCandidates(
  config: PrimeBotConfig,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
  amountIn: bigint,
  options: {
    allowAggregators: boolean;
    executionWalletAddress?: `0x${string}`;
  },
) {
  if (!options.allowAggregators || !config.liFi.enabled) {
    return [];
  }

  const taker = options.executionWalletAddress ?? config.treasuryAddress;
  const quote = await fetchLiFiSameChainQuote(config, {
    sellToken: tokenIn,
    buyToken: tokenOut,
    sellAmount: amountIn,
    taker,
    slippageBps: config.uniswap.defaultSlippageBps,
  });

  if (!quote) {
    return [];
  }

  return [
    buildCandidate({
      venue: "lifi",
      routeType: "aggregated",
      pathTokens: [tokenIn, tokenOut],
      amountOut: quote.amountOut,
      amountOutMinimum: quote.amountOutMinimum,
      gasEstimate: quote.gasEstimate,
      defaultSlippageBps: config.uniswap.defaultSlippageBps,
      spender: quote.spender,
      quoteTx: quote.transaction,
      sourceBreakdown: quote.sources,
    }),
  ];
}

async function hasV2Path(
  config: PrimeBotConfig,
  publicClient: any,
  pathTokens: TokenConfig[],
) {
  const checks = await Promise.all(
    pathTokens.slice(0, -1).map((token, index) =>
      publicClient.readContract({
        address: config.uniswap.v2FactoryAddress,
        abi: uniswapV2FactoryAbi,
        functionName: "getPair",
        args: [token.address, pathTokens[index + 1]!.address],
      }),
    ),
  );

  return checks.every((pairAddress) => pairAddress && pairAddress !== ZERO_ADDRESS);
}

async function getV3Pool(
  publicClient: any,
  config: PrimeBotConfig,
  tokenA: TokenConfig,
  tokenB: TokenConfig,
  feeTier: number,
) {
  const poolAddress = await safelyReadQuote(async () =>
    publicClient.readContract({
      address: config.uniswap.factoryAddress,
      abi: uniswapV3FactoryAbi,
      functionName: "getPool",
      args: [tokenA.address, tokenB.address, feeTier],
    }),
  );

  if (!poolAddress || poolAddress === ZERO_ADDRESS) {
    return null;
  }

  return poolAddress as `0x${string}`;
}

function buildCandidate(input: {
  venue: RouteCandidate["venue"];
  routeType: RouteCandidate["routeType"];
  pathTokens: TokenConfig[];
  amountOut: bigint;
  gasEstimate: bigint;
  defaultSlippageBps: number;
  amountOutMinimum?: bigint;
  feeTiers?: number[];
  spender?: `0x${string}`;
  quoteTx?: PreparedExecutionTx;
  sourceBreakdown?: string[];
}): RouteCandidate {
  const hopCount = input.pathTokens.length - 1;
  const slippageBps =
    input.defaultSlippageBps +
    Math.max(0, hopCount - 1) * 25 +
    (input.venue === "uniswap_v2" ? 15 : 0);
  const amountOutMinimum = input.amountOutMinimum ?? (input.amountOut * BigInt(10_000 - slippageBps)) / 10_000n;

  return {
    id: `${input.venue}:${input.routeType}:${input.pathTokens.map((token) => token.symbol).join("->")}${input.feeTiers ? `:${input.feeTiers.join("-")}` : ""}`,
    venue: input.venue,
    routeType: input.routeType,
    pathTokens: input.pathTokens,
    pathSymbols: input.pathTokens.map((token) => token.symbol),
    feeTiers: input.feeTiers,
    amountOut: input.amountOut,
    amountOutMinimum,
    gasEstimate: input.gasEstimate,
    slippageBps,
    spender: input.spender,
    quoteTx: input.quoteTx,
    sourceBreakdown: input.sourceBreakdown,
  };
}

function isRouteCandidate(candidate: RouteCandidate | null): candidate is RouteCandidate {
  return candidate !== null;
}

async function buildSwapExecutionTransactions(
  config: PrimeBotConfig,
  publicClient: any,
  prepared: PreparedSwap,
  walletAddress: `0x${string}`,
) {
  if (prepared.route.venue === "zeroex" || prepared.route.venue === "lifi") {
    const txs: PreparedExecutionTx[] = [];

    if (prepared.route.venue === "zeroex" && prepared.tokenIn.isNative) {
      txs.push({
        to: prepared.normalizedTokenIn.address,
        data: encodeFunctionData({
          abi: wethAbi,
          functionName: "deposit",
          args: [],
        }),
        value: prepared.amountIn.toString(),
      });
    }

    if (prepared.route.spender) {
      const allowance = await publicClient.readContract({
        address: prepared.normalizedTokenIn.address,
        abi: erc20Abi,
        functionName: "allowance",
        args: [walletAddress, prepared.route.spender],
      });

      if (allowance < prepared.amountIn) {
        txs.push({
          to: prepared.normalizedTokenIn.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [prepared.route.spender, prepared.amountIn],
          }),
          value: "0",
        });
      }
    }

    if (!prepared.route.quoteTx) {
      throw new AppError(500, "missing_route_quote", `Selected ${prepared.route.venue} route is missing executable transaction data.`);
    }

    txs.push(prepared.route.quoteTx);
    return txs;
  }

  const txs: PreparedExecutionTx[] = [];
  const spender = getRouteSpender(config, prepared.route);

  if (!prepared.tokenIn.isNative) {
    const allowance = await publicClient.readContract({
      address: prepared.normalizedTokenIn.address,
      abi: erc20Abi,
      functionName: "allowance",
      args: [walletAddress, spender],
    });

    if (allowance < prepared.amountIn) {
      txs.push({
        to: prepared.normalizedTokenIn.address,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender, prepared.amountIn],
        }),
        value: "0",
      });
    }
  }

  txs.push(buildSwapExecutionTx(config, prepared, walletAddress));
  return txs;
}

function buildSwapExecutionTx(
  config: PrimeBotConfig,
  prepared: PreparedSwap,
  recipient: `0x${string}`,
): PreparedExecutionTx {
  if (prepared.route.venue === "uniswap_v3") {
    if (prepared.route.routeType === "direct") {
      return {
        to: config.uniswap.swapRouterAddress,
        data: encodeFunctionData({
          abi: swapRouterAbi,
          functionName: "exactInputSingle",
          args: [
            {
              tokenIn: prepared.normalizedTokenIn.address,
              tokenOut: prepared.tokenOut.address,
              fee: prepared.route.feeTiers?.[0] ?? 0,
              recipient,
              amountIn: prepared.amountIn,
              amountOutMinimum: prepared.route.amountOutMinimum,
              sqrtPriceLimitX96: 0n,
            },
          ],
        }),
        value: prepared.tokenIn.isNative ? prepared.amountIn.toString() : "0",
      };
    }

    return {
      to: config.uniswap.swapRouterAddress,
      data: encodeFunctionData({
        abi: swapRouterAbi,
        functionName: "exactInput",
        args: [
          {
            path: encodeV3Path(
              prepared.route.pathTokens.map((token) => token.address),
              prepared.route.feeTiers ?? [],
            ),
            recipient,
            amountIn: prepared.amountIn,
            amountOutMinimum: prepared.route.amountOutMinimum,
          },
        ],
      }),
      value: prepared.tokenIn.isNative ? prepared.amountIn.toString() : "0",
    };
  }

  const deadline = BigInt(Math.floor(Date.now() / 1_000) + config.uniswap.executionDeadlineSeconds);
  const path = prepared.route.pathTokens.map((token) => token.address);

  if (prepared.tokenIn.isNative) {
    return {
      to: config.uniswap.v2RouterAddress,
      data: encodeFunctionData({
        abi: uniswapV2RouterAbi,
        functionName: "swapExactETHForTokens",
        args: [prepared.route.amountOutMinimum, path, recipient, deadline],
      }),
      value: prepared.amountIn.toString(),
    };
  }

  return {
    to: config.uniswap.v2RouterAddress,
    data: encodeFunctionData({
      abi: uniswapV2RouterAbi,
      functionName: "swapExactTokensForTokens",
      args: [prepared.amountIn, prepared.route.amountOutMinimum, path, recipient, deadline],
    }),
    value: "0",
  };
}

function describeRoute(route: RouteCandidate) {
  if (route.venue === "zeroex" || route.venue === "lifi") {
    const sources = route.sourceBreakdown?.length ? route.sourceBreakdown.join(", ") : "aggregated liquidity";

    return {
      routeLabel: `${route.venue}_aggregated`,
      humanLabel: `${route.venue === "zeroex" ? "0x" : "LI.FI"} aggregated route ${route.pathSymbols.join(" -> ")} via ${sources}`,
    };
  }

  const venueLabel = route.venue === "uniswap_v3" ? "Uniswap V3" : "Uniswap V2";
  const pathLabel = route.pathSymbols.join(" -> ");
  const feeLabel = route.feeTiers?.length ? ` at fee tiers ${route.feeTiers.join("/")}` : "";

  return {
    routeLabel: `${route.venue}_${route.routeType}`,
    humanLabel: `${venueLabel} ${route.routeType} route ${pathLabel}${feeLabel}`,
  };
}

function buildPlainLanguageReason(analysis: TradeAnalysis, prepared: PreparedSwap) {
  const routeSummary = describeRoute(prepared.route);
  const preferenceTitle = getPreferenceTitle(prepared.routePreference);
  const smallTradeWarning = isSmallTrade(prepared)
    ? "This is a very small trade, so price swings or thin testnet liquidity can still move the final result."
    : "";

  if (analysis.risk === "high") {
    return "PrimeBot thinks this trade is too risky or too uncertain to execute safely right now.";
  }

  const lead =
    analysis.risk === "medium"
      ? "PrimeBot found a working route, but this trade still needs extra caution."
      : "PrimeBot found a route that looks reasonable for this trade.";

  const routeLine = `${preferenceTitle} currently points to ${routeSummary.humanLabel}.`;
  const outputLine = `The current quoted outcome is about ${formatUnits(prepared.route.amountOut, prepared.tokenOut.decimals)} ${prepared.tokenOut.symbol}.`;

  return [lead, routeLine, outputLine, smallTradeWarning].filter(Boolean).join(" ");
}

function isSmallTrade(prepared: PreparedSwap) {
  if ((prepared.tokenIn.symbol === "ETH" || prepared.tokenIn.symbol === "WETH") && prepared.amountIn < parseUnits("0.001", 18)) {
    return true;
  }

  const expectedOut = Number.parseFloat(formatUnits(prepared.route.amountOut, prepared.tokenOut.decimals));
  return Number.isFinite(expectedOut) && expectedOut > 0 && expectedOut < 1;
}

function buildIntermediateTokens(
  config: PrimeBotConfig,
  tokenIn: TokenConfig,
  tokenOut: TokenConfig,
) {
  const seen = new Set<string>([tokenIn.address.toLowerCase(), tokenOut.address.toLowerCase()]);
  const intermediaries: TokenConfig[] = [];
  const priority = ["USDC", "USDT", "DAI", "EURC", "WETH", "CBETH", "CBBTC"];

  for (const symbol of priority) {
    const token = config.tokens[symbol];
    if (!token || token.isNative) {
      continue;
    }

    const normalizedAddress = token.address.toLowerCase();
    if (seen.has(normalizedAddress)) {
      continue;
    }

    seen.add(normalizedAddress);
    intermediaries.push(token);
  }

  for (const token of Object.values(config.tokens)) {
    if (token.isNative) {
      continue;
    }

    const normalizedAddress = token.address.toLowerCase();
    if (seen.has(normalizedAddress)) {
      continue;
    }

    seen.add(normalizedAddress);
    intermediaries.push(token);
  }

  return intermediaries;
}

function encodeV3Path(addresses: `0x${string}`[], fees: number[]) {
  if (addresses.length !== fees.length + 1) {
    throw new AppError(500, "invalid_route", "Uniswap V3 path encoding received mismatched tokens and fees.");
  }

  const packedTypes: ("address" | "uint24")[] = [];
  const packedValues: (`0x${string}` | number)[] = [];

  for (let index = 0; index < addresses.length; index += 1) {
    packedTypes.push("address");
    packedValues.push(addresses[index]!);

    if (index < fees.length) {
      packedTypes.push("uint24");
      packedValues.push(fees[index]!);
    }
  }

  return encodePacked(packedTypes, packedValues);
}

function getRouteSpender(config: PrimeBotConfig, route: RouteCandidate) {
  if (route.venue === "uniswap_v3") {
    return config.uniswap.swapRouterAddress;
  }

  return config.uniswap.v2RouterAddress;
}

async function safelyReadQuote<T>(reader: () => Promise<T>): Promise<T | null> {
  try {
    return await reader();
  } catch {
    return null;
  }
}

function mustGetToken(config: PrimeBotConfig, symbol: string) {
  const token = config.tokens[symbol];

  if (!token) {
    throw new AppError(400, "unsupported_token", `Unsupported token: ${symbol}.`);
  }

  return token;
}
