import { z } from "zod";

import type { PrimeBotConfig, TokenConfig } from "./config.js";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;
const ZEROEX_DEFAULT_GAS_ESTIMATE = 210_000n;

const ZeroExFillSchema = z.object({
  source: z.string().min(1),
  proportionBps: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const ZeroExResponseSchema = z.object({
  liquidityAvailable: z.boolean().optional(),
  buyAmount: z.string().regex(/^\d+$/),
  minBuyAmount: z.string().regex(/^\d+$/).optional(),
  allowanceTarget: z.string().regex(ADDRESS_REGEX).optional(),
  route: z
    .object({
      fills: z.array(ZeroExFillSchema).optional(),
      tokens: z.array(z.unknown()).optional(),
    })
    .optional(),
  issues: z
    .object({
      allowance: z
        .object({
          spender: z.string().regex(ADDRESS_REGEX),
          actual: z.string().regex(/^\d+$/).optional(),
        })
        .optional(),
      simulationIncomplete: z.boolean().optional(),
    })
    .optional(),
  transaction: z
    .object({
      to: z.string().regex(ADDRESS_REGEX),
      data: z.string().optional(),
      value: z.string().regex(/^\d+$/).default("0"),
      gas: z.string().regex(/^\d+$/).optional(),
    })
    .optional(),
});

type ZeroExExecutionTx = {
  to: `0x${string}`;
  data?: `0x${string}`;
  value: string;
};

export type ZeroExQuote = {
  amountOut: bigint;
  amountOutMinimum: bigint;
  gasEstimate: bigint;
  spender?: `0x${string}`;
  transaction?: ZeroExExecutionTx;
  sources: string[];
};

export async function fetchZeroExPrice(
  config: PrimeBotConfig,
  params: {
    sellToken: TokenConfig;
    buyToken: TokenConfig;
    sellAmount: bigint;
    taker: `0x${string}`;
    slippageBps: number;
  },
): Promise<ZeroExQuote | null> {
  return fetchZeroExRoute(config, "price", params);
}

export async function fetchZeroExQuote(
  config: PrimeBotConfig,
  params: {
    sellToken: TokenConfig;
    buyToken: TokenConfig;
    sellAmount: bigint;
    taker: `0x${string}`;
    slippageBps: number;
  },
): Promise<ZeroExQuote | null> {
  return fetchZeroExRoute(config, "quote", params);
}

async function fetchZeroExRoute(
  config: PrimeBotConfig,
  endpoint: "price" | "quote",
  params: {
    sellToken: TokenConfig;
    buyToken: TokenConfig;
    sellAmount: bigint;
    taker: `0x${string}`;
    slippageBps: number;
  },
): Promise<ZeroExQuote | null> {
  if (!config.zeroEx.enabled || !config.zeroEx.apiKey) {
    return null;
  }

  const url = new URL(`/swap/allowance-holder/${endpoint}`, config.zeroEx.apiUrl);
  url.searchParams.set("chainId", "84532");
  url.searchParams.set("sellToken", params.sellToken.address);
  url.searchParams.set("buyToken", params.buyToken.address);
  url.searchParams.set("sellAmount", params.sellAmount.toString());
  url.searchParams.set("taker", params.taker);
  url.searchParams.set("slippageBps", params.slippageBps.toString());

  const response = await fetch(url, {
    headers: {
      "0x-api-key": config.zeroEx.apiKey,
      "0x-version": "v2",
    },
  });

  if (response.status === 401 || response.status === 403 || response.status === 404) {
    return null;
  }

  if (response.status >= 500) {
    return null;
  }

  if (response.status >= 400) {
    const errorBody = await response.text();
    if (errorBody.toLowerCase().includes("insufficient liquidity")) {
      return null;
    }

    return null;
  }

  const parsed = ZeroExResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    return null;
  }

  if (parsed.data.liquidityAvailable === false) {
    return null;
  }

  const sources = Array.from(
    new Set(
      (parsed.data.route?.fills ?? [])
        .map((fill) => fill.source.trim())
        .filter(Boolean),
    ),
  );
  const transaction = parsed.data.transaction
    ? {
        to: parsed.data.transaction.to as `0x${string}`,
        data: parsed.data.transaction.data as `0x${string}` | undefined,
        value: parsed.data.transaction.value,
      }
    : undefined;

  return {
    amountOut: BigInt(parsed.data.buyAmount),
    amountOutMinimum: BigInt(parsed.data.minBuyAmount ?? parsed.data.buyAmount),
    gasEstimate: parsed.data.transaction?.gas ? BigInt(parsed.data.transaction.gas) : ZEROEX_DEFAULT_GAS_ESTIMATE,
    spender: (parsed.data.issues?.allowance?.spender ?? parsed.data.allowanceTarget) as `0x${string}` | undefined,
    transaction,
    sources,
  };
}
