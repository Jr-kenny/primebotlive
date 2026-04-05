import { formatUnits, parseUnits } from "viem";
import { z } from "zod";

import type { PrimeBotConfig, TokenConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { BridgeIntent } from "./intent.js";
import type { TradeAnalysis } from "./opengradient.js";
import type { PreparedExecutionTx } from "./swap.js";

const BASE_SEPOLIA_CHAIN_ID = 84_532;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ROUTE_CACHE_TTL_MS = 5 * 60 * 1_000;
const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const AcrossAvailableRouteSchema = z.object({
  originChainId: z.number().int(),
  originToken: z.string().min(1),
  destinationChainId: z.number().int(),
  destinationToken: z.string(),
  originTokenSymbol: z.string().min(1),
  destinationTokenSymbol: z.string().min(1),
  isNative: z.boolean(),
});

const AcrossQuoteTokenSchema = z.object({
  chainId: z.number().int(),
  address: z.string(),
  decimals: z.number().int().min(0).max(255),
  symbol: z.string().min(1),
});

const AcrossExecutionTxSchema = z.object({
  chainId: z.number().int(),
  to: z.string().regex(ADDRESS_REGEX),
  data: z.string().optional(),
  value: z.string().regex(/^\d+$/).optional().default("0"),
});

const AcrossQuoteSchema = z.object({
  checks: z.object({
    balance: z
      .object({
        token: z.string(),
        actual: z.string().regex(/^\d+$/),
        expected: z.string().regex(/^\d+$/),
      })
      .optional(),
  }),
  approvalTxns: z.array(AcrossExecutionTxSchema).optional().default([]),
  expectedOutputAmount: z.string().regex(/^\d+$/),
  expectedFillTime: z.number().int().nonnegative().optional().default(0),
  quoteExpiryTimestamp: z.number().int().optional(),
  swapTx: AcrossExecutionTxSchema.optional(),
  inputToken: AcrossQuoteTokenSchema,
  outputToken: AcrossQuoteTokenSchema,
  fees: z
    .object({
      total: z
        .object({
          amount: z.string().regex(/^-?\d+$/),
          pct: z.string().regex(/^-?\d+$/).optional(),
        })
        .optional(),
      originGas: z
        .object({
          amount: z.string().regex(/^-?\d+$/).optional(),
        })
        .optional(),
    })
    .optional(),
});

type AcrossAvailableRoute = z.infer<typeof AcrossAvailableRouteSchema>;
type AcrossQuote = z.infer<typeof AcrossQuoteSchema>;

type BridgeDestination = {
  chainId: number;
  displayName: string;
  aliases: string[];
};

type BridgeExecutionPlan = {
  kind: "bridge";
  chainId: number;
  txs: PreparedExecutionTx[];
};

type PreparedBridge = {
  token: TokenConfig;
  destination: BridgeDestination;
  route: AcrossAvailableRoute;
  quote: AcrossQuote;
  amountIn: bigint;
};

const DESTINATIONS: BridgeDestination[] = [
  {
    chainId: 11155111,
    displayName: "Sepolia",
    aliases: ["sepolia", "ethereum sepolia", "eth sepolia"],
  },
  {
    chainId: 421614,
    displayName: "Arbitrum Sepolia",
    aliases: ["arbitrum sepolia", "arb sepolia", "arbitrum"],
  },
  {
    chainId: 11155420,
    displayName: "Optimism Sepolia",
    aliases: ["optimism sepolia", "op sepolia", "optimism"],
  },
  {
    chainId: 80002,
    displayName: "Polygon Amoy",
    aliases: ["polygon amoy", "amoy", "polygon"],
  },
  {
    chainId: 919,
    displayName: "Mode Sepolia",
    aliases: ["mode sepolia", "mode"],
  },
  {
    chainId: 1301,
    displayName: "Unichain Sepolia",
    aliases: ["unichain sepolia", "unichain"],
  },
  {
    chainId: 168587773,
    displayName: "Blast Sepolia",
    aliases: ["blast sepolia", "blast"],
  },
  {
    chainId: 4202,
    displayName: "Lisk Sepolia",
    aliases: ["lisk sepolia", "lisk"],
  },
  {
    chainId: 37111,
    displayName: "Lens Sepolia",
    aliases: ["lens sepolia", "lens"],
  },
];

let routeCache:
  | {
      expiresAt: number;
      routes: AcrossAvailableRoute[];
    }
  | undefined;

export async function previewBridge(
  config: PrimeBotConfig,
  intent: BridgeIntent,
): Promise<{ analysis: TradeAnalysis }> {
  const prepared = await prepareBridge(config, intent);

  return {
    analysis: buildBridgeAnalysis(prepared),
  };
}

export async function prepareBridgeExecution(
  config: PrimeBotConfig,
  intent: BridgeIntent,
  walletAddress: `0x${string}`,
): Promise<{ analysis: TradeAnalysis; execution: BridgeExecutionPlan }> {
  const prepared = await prepareBridge(config, intent, walletAddress);
  const txs: PreparedExecutionTx[] = [
    ...prepared.quote.approvalTxns.map((tx) => ({
      to: tx.to as `0x${string}`,
      data: tx.data as `0x${string}` | undefined,
      value: tx.value,
    })),
    {
      to: prepared.quote.swapTx!.to as `0x${string}`,
      data: prepared.quote.swapTx!.data as `0x${string}` | undefined,
      value: prepared.quote.swapTx!.value,
    },
  ];

  return {
    analysis: buildBridgeAnalysis(prepared),
    execution: {
      kind: "bridge",
      chainId: BASE_SEPOLIA_CHAIN_ID,
      txs,
    },
  };
}

async function prepareBridge(
  config: PrimeBotConfig,
  intent: BridgeIntent,
  walletAddress?: `0x${string}`,
): Promise<PreparedBridge> {
  const token = mustGetToken(config, intent.token);
  const destination = resolveDestination(intent.destinationChain);
  const routes = await getAvailableRoutes(config);
  const route = selectRoute(routes, token, destination);
  const amountIn = parseUnits(intent.amount, token.decimals);
  const depositor = walletAddress ?? config.account.address;
  const recipient = intent.recipient ?? depositor;
  const quote = await fetchAcrossQuote(config, {
    amountIn,
    destination,
    route,
    token,
    depositor,
    recipient,
  });

  if (!quote.swapTx) {
    throw new AppError(502, "bridge_quote_failed", "Across did not return executable bridge calldata.");
  }

  if (walletAddress && quote.checks.balance) {
    const actualBalance = BigInt(quote.checks.balance.actual);
    const requiredBalance = BigInt(quote.checks.balance.expected);

    if (actualBalance < requiredBalance) {
      throw new AppError(
        422,
        "insufficient_balance",
        `Insufficient ${token.symbol} balance for this bridge.`,
        {
          required: requiredBalance.toString(),
          available: actualBalance.toString(),
        },
      );
    }
  }

  return {
    token,
    destination,
    route,
    quote,
    amountIn,
  };
}

async function fetchAcrossQuote(
  config: PrimeBotConfig,
  params: {
    token: TokenConfig;
    route: AcrossAvailableRoute;
    destination: BridgeDestination;
    amountIn: bigint;
    depositor: `0x${string}`;
    recipient: `0x${string}`;
  },
): Promise<AcrossQuote> {
  const url = buildAcrossUrl(config.across.apiUrl, "swap/approval");
  url.searchParams.set("tradeType", "exactInput");
  url.searchParams.set("amount", params.amountIn.toString());
  url.searchParams.set("inputToken", params.token.isNative ? ZERO_ADDRESS : params.route.originToken);
  url.searchParams.set(
    "outputToken",
    params.token.isNative && params.route.isNative ? ZERO_ADDRESS : params.route.destinationToken,
  );
  url.searchParams.set("originChainId", BASE_SEPOLIA_CHAIN_ID.toString());
  url.searchParams.set("destinationChainId", params.destination.chainId.toString());
  url.searchParams.set("depositor", params.depositor);
  url.searchParams.set("recipient", params.recipient);

  if (config.across.integratorId) {
    url.searchParams.set("integratorId", config.across.integratorId);
  }

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const failure = await safeJson(response);
    const code = typeof failure?.code === "string" ? failure.code : "bridge_quote_failed";
    const message =
      typeof failure?.message === "string"
        ? failure.message
        : "Across bridge quote request failed.";
    throw new AppError(response.status === 400 ? 422 : 502, code.toLowerCase(), message, failure);
  }

  const parsed = AcrossQuoteSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new AppError(502, "invalid_bridge_quote", "Across returned an unexpected bridge quote.", parsed.error.flatten());
  }

  return parsed.data;
}

function buildBridgeAnalysis(prepared: PreparedBridge): TradeAnalysis {
  const outputAmount = BigInt(prepared.quote.expectedOutputAmount);
  const feeAmount = prepared.quote.fees?.total?.amount ? BigInt(prepared.quote.fees.total.amount) : 0n;
  const feePct = parseFeePct(prepared.quote.fees?.total?.pct);
  const fillTimeSeconds = prepared.quote.expectedFillTime ?? 0;
  const risk = determineRisk(feePct, fillTimeSeconds);
  const outputSymbol = prepared.token.symbol;
  const expectedOut = `${formatUnits(outputAmount, prepared.quote.outputToken.decimals)} ${outputSymbol} on ${prepared.destination.displayName}`;

  return {
    route: "across_bridge",
    expectedOut,
    risk,
    reason: buildReason({
      prepared,
      expectedOut,
      feeAmount,
      feePct,
      fillTimeSeconds,
      risk,
    }),
  };
}

function buildReason(input: {
  prepared: PreparedBridge;
  expectedOut: string;
  feeAmount: bigint;
  feePct: number;
  fillTimeSeconds: number;
  risk: TradeAnalysis["risk"];
}) {
  const { prepared, expectedOut, feeAmount, feePct, fillTimeSeconds, risk } = input;
  const amountIn = `${formatUnits(prepared.amountIn, prepared.token.decimals)} ${prepared.token.symbol}`;
  const feeText = feeAmount > 0n ? `${formatUnits(feeAmount, prepared.quote.inputToken.decimals)} ${prepared.token.symbol}` : `0 ${prepared.token.symbol}`;
  const speedText =
    fillTimeSeconds <= 0
      ? "Across did not publish a fill time estimate yet."
      : `Across expects the destination fill in about ${fillTimeSeconds} seconds.`;

  if (risk === "high") {
    return `PrimeBot found a live Across bridge from Base Sepolia to ${prepared.destination.displayName}, but this bridge is expensive for the size you entered. Sending ${amountIn} is currently quoted to land about ${expectedOut}. Estimated bridge costs are about ${feeText}, which is roughly ${feePct.toFixed(1)}% of what you are sending. ${speedText}`;
  }

  if (risk === "medium") {
    return `PrimeBot found a live Across bridge from Base Sepolia to ${prepared.destination.displayName}. Sending ${amountIn} is currently quoted to land about ${expectedOut}. Estimated bridge costs are about ${feeText}, roughly ${feePct.toFixed(1)}% of the transfer size. ${speedText}`;
  }

  return `PrimeBot found a live Across bridge from Base Sepolia to ${prepared.destination.displayName}. Sending ${amountIn} is currently quoted to land about ${expectedOut}. Estimated bridge costs are about ${feeText}, around ${feePct.toFixed(1)}% of the transfer size. ${speedText}`;
}

function determineRisk(feePct: number, fillTimeSeconds: number): TradeAnalysis["risk"] {
  if (feePct >= 25) {
    return "high";
  }

  if (feePct >= 8 || fillTimeSeconds > 120) {
    return "medium";
  }

  return "low";
}

function parseFeePct(rawPct: string | undefined) {
  if (!rawPct) {
    return 0;
  }

  return Number(BigInt(rawPct)) / 1e16;
}

async function getAvailableRoutes(config: PrimeBotConfig): Promise<AcrossAvailableRoute[]> {
  const now = Date.now();
  if (routeCache && routeCache.expiresAt > now) {
    return routeCache.routes;
  }

  const response = await fetch(buildAcrossUrl(config.across.apiUrl, "available-routes"), {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new AppError(502, "across_unreachable", "Across route discovery failed.", {
      status: response.status,
      body: await response.text(),
    });
  }

  const parsed = z.array(AcrossAvailableRouteSchema).safeParse(await response.json());
  if (!parsed.success) {
    throw new AppError(502, "invalid_across_routes", "Across returned an unexpected route list.", parsed.error.flatten());
  }

  const routes = parsed.data.filter((route) => route.originChainId === BASE_SEPOLIA_CHAIN_ID);
  routeCache = {
    routes,
    expiresAt: now + ROUTE_CACHE_TTL_MS,
  };

  return routes;
}

function buildAcrossUrl(baseUrl: string, path: string) {
  return new URL(path.replace(/^\//, ""), baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`);
}

function selectRoute(
  routes: AcrossAvailableRoute[],
  token: TokenConfig,
  destination: BridgeDestination,
) {
  const requestedSymbol = token.symbol.toUpperCase();
  const wantedNative = Boolean(token.isNative);

  const route = routes.find(
    (candidate) =>
      candidate.destinationChainId === destination.chainId &&
      candidate.originTokenSymbol.toUpperCase() === requestedSymbol &&
      candidate.destinationTokenSymbol.toUpperCase() === requestedSymbol &&
      candidate.isNative === wantedNative,
  );

  if (!route) {
    throw new AppError(
      422,
      "unsupported_bridge_route",
      `PrimeBot could not find a live bridge route for ${token.symbol} from Base Sepolia to ${destination.displayName}.`,
    );
  }

  return route;
}

function resolveDestination(input: string) {
  const normalized = normalizeChainName(input);
  const destination = DESTINATIONS.find((candidate) =>
    candidate.aliases.some((alias) => normalizeChainName(alias) === normalized),
  );

  if (!destination) {
    throw new AppError(
      400,
      "unsupported_destination",
      `Unsupported bridge destination: ${input}. Try Sepolia, Arbitrum Sepolia, Optimism Sepolia, Polygon Amoy, Mode Sepolia, Unichain Sepolia, Blast Sepolia, Lisk Sepolia, or Lens Sepolia.`,
    );
  }

  return destination;
}

function normalizeChainName(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function mustGetToken(config: PrimeBotConfig, symbol: string) {
  const token = config.tokens[symbol];

  if (!token) {
    throw new AppError(400, "unsupported_token", `Unsupported token: ${symbol}.`);
  }

  return token;
}

async function safeJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}
