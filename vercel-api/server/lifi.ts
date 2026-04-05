import { z } from "zod";

import type { PrimeBotConfig, TokenConfig } from "./config.js";

const ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

const LiFiQuoteSchema = z.object({
  tool: z.string().min(1),
  toolDetails: z
    .object({
      key: z.string().min(1).optional(),
      name: z.string().min(1).optional(),
    })
    .optional(),
  estimate: z.object({
    toAmount: z.string().regex(/^\d+$/),
    toAmountMin: z.string().regex(/^\d+$/),
    approvalAddress: z.string().optional(),
    gasCosts: z
      .array(
        z.object({
          estimate: z.string().regex(/^\d+$/).optional(),
          limit: z.string().regex(/^\d+$/).optional(),
        }),
      )
      .optional(),
  }),
  includedSteps: z
    .array(
      z.object({
        tool: z.string().optional(),
        toolDetails: z
          .object({
            key: z.string().optional(),
            name: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  transactionRequest: z.object({
    to: z.string().regex(ADDRESS_REGEX),
    data: z.string().optional(),
    value: z.string().regex(/^\d+$/).default("0"),
    gasLimit: z.string().regex(/^\d+$/).optional(),
  }),
});

export type LiFiQuote = {
  amountOut: bigint;
  amountOutMinimum: bigint;
  gasEstimate: bigint;
  spender?: `0x${string}`;
  transaction: {
    to: `0x${string}`;
    data?: `0x${string}`;
    value: string;
  };
  sources: string[];
};

export async function fetchLiFiSameChainQuote(
  config: PrimeBotConfig,
  params: {
    sellToken: TokenConfig;
    buyToken: TokenConfig;
    sellAmount: bigint;
    taker: `0x${string}`;
    recipient?: `0x${string}`;
    slippageBps: number;
  },
): Promise<LiFiQuote | null> {
  if (!config.liFi.enabled) {
    return null;
  }

  const url = new URL("/quote", config.liFi.apiUrl);
  url.searchParams.set("fromChain", "84532");
  url.searchParams.set("toChain", "84532");
  url.searchParams.set("fromToken", params.sellToken.isNative ? "0x0000000000000000000000000000000000000000" : params.sellToken.address);
  url.searchParams.set("toToken", params.buyToken.address);
  url.searchParams.set("fromAmount", params.sellAmount.toString());
  url.searchParams.set("fromAddress", params.taker);
  url.searchParams.set("toAddress", params.recipient ?? params.taker);
  url.searchParams.set("slippage", (params.slippageBps / 10_000).toString());
  url.searchParams.set("integrator", config.liFi.integrator);
  url.searchParams.set("allowBridges", "false");
  url.searchParams.set("allowDestinationCall", "false");

  const response = await fetch(url);

  if (response.status === 404 || response.status === 400) {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  const parsed = LiFiQuoteSchema.safeParse(await response.json());
  if (!parsed.success) {
    return null;
  }

  const gasEstimate =
    parsed.data.transactionRequest.gasLimit
      ? BigInt(parsed.data.transactionRequest.gasLimit)
      : parsed.data.estimate.gasCosts?.[0]?.estimate
        ? BigInt(parsed.data.estimate.gasCosts[0].estimate)
        : 0n;
  const sources = Array.from(
    new Set(
      [
        parsed.data.toolDetails?.name,
        parsed.data.tool,
        ...(parsed.data.includedSteps ?? []).flatMap((step) => [step.toolDetails?.name, step.tool]),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
  const approvalAddress = parsed.data.estimate.approvalAddress;

  return {
    amountOut: BigInt(parsed.data.estimate.toAmount),
    amountOutMinimum: BigInt(parsed.data.estimate.toAmountMin),
    gasEstimate,
    spender: approvalAddress && approvalAddress !== "0x0000000000000000000000000000000000000000"
      ? (approvalAddress as `0x${string}`)
      : undefined,
    transaction: {
      to: parsed.data.transactionRequest.to as `0x${string}`,
      data: parsed.data.transactionRequest.data as `0x${string}` | undefined,
      value: parsed.data.transactionRequest.value,
    },
    sources,
  };
}
