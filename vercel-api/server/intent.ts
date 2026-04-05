import { z } from "zod";
import { isAddress } from "viem";

import { AppError } from "./errors.js";

const ExecuteRequestSchema = z.object({
  prompt: z.string().min(1, "Prompt is required."),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional(),
  paymentTxHash: z
    .string()
    .regex(/^0x[a-fA-F0-9]{64}$/)
    .optional(),
  routePreference: z.enum(["balanced", "best_return", "safer", "lower_gas"]).optional(),
});

const SWAP_PROMPT =
  /^swap\s+(?<amount>\d+(?:\.\d+)?)(?:\s*)(?<tokenIn>[a-zA-Z0-9$-]+)\s+(?:to|for)\s+(?<tokenOut>[a-zA-Z0-9$-]+)(?<recipientClause>\s+(?:(?:and|then)\s+)?send\s+to\s+.+)?$/i;
const TRANSFER_PROMPT =
  /^(?:transfer|send)\s+(?<amount>\d+(?:\.\d+)?)(?:\s*)(?<token>[a-zA-Z0-9$-]+)\s+to\s+(?<recipientClause>.+)$/i;
const BRIDGE_PROMPT =
  /^bridge\s+(?<amount>\d+(?:\.\d+)?)(?:\s*)(?<token>[a-zA-Z0-9$-]+)\s+to\s+(?<destination>.+?)(?:\s+for\s+(?<recipient>0x[a-fA-F0-9]{40}))?$/i;
const ADDRESS_PATTERN = /0x[a-fA-F0-9]{40}/g;

export type SwapIntent = {
  action: "swap";
  amount: string;
  tokenIn: string;
  tokenOut: string;
  recipient?: `0x${string}`;
  rawPrompt: string;
};

export type TransferIntent = {
  action: "transfer";
  amount: string;
  token: string;
  recipients: `0x${string}`[];
  rawPrompt: string;
};

export type BridgeIntent = {
  action: "bridge";
  amount: string;
  token: string;
  destinationChain: string;
  recipient?: `0x${string}`;
  rawPrompt: string;
};

export type ExecuteIntent = SwapIntent | TransferIntent | BridgeIntent;
export type ExecuteRequest = z.infer<typeof ExecuteRequestSchema>;

export function parseExecuteRequest(input: unknown) {
  const parsed = ExecuteRequestSchema.safeParse(input);

  if (!parsed.success) {
    throw new AppError(
      400,
      "invalid_request",
      "Request body must be { prompt: string, walletAddress?: string, paymentTxHash?: string, routePreference?: string }.",
      parsed.error.flatten(),
    );
  }

  return parsed.data;
}

export function parseExecuteIntent(prompt: string, supportedSymbols: readonly string[]): ExecuteIntent {
  const trimmedPrompt = prompt.trim();
  const transferMatch = TRANSFER_PROMPT.exec(trimmedPrompt);

  if (transferMatch?.groups) {
    return parseTransferIntent(trimmedPrompt, transferMatch.groups, supportedSymbols);
  }

  const bridgeMatch = BRIDGE_PROMPT.exec(trimmedPrompt);

  if (bridgeMatch?.groups) {
    return parseBridgeIntent(trimmedPrompt, bridgeMatch.groups, supportedSymbols);
  }

  const match = SWAP_PROMPT.exec(trimmedPrompt);

  if (!match?.groups) {
    throw new AppError(
      400,
      "invalid_prompt",
      'Prompt must follow swap, bridge, or transfer syntax, for example "swap 0.1 ETH to USDC", "bridge 0.01 ETH to sepolia", or "transfer 0.000001 ETH to 0x...".',
    );
  }

  return parseSwapIntent(trimmedPrompt, match.groups, supportedSymbols);
}

function parseBridgeIntent(
  trimmedPrompt: string,
  groups: Record<string, string | undefined>,
  supportedSymbols: readonly string[],
): BridgeIntent {
  const amount = groups.amount;
  const rawToken = groups.token;
  const destination = groups.destination;
  const recipient = groups.recipient;

  if (!amount || !rawToken || !destination) {
    throw new AppError(
      400,
      "invalid_prompt",
      'Prompt must follow "bridge <amount> <token> to <destination chain>" with an optional "for <wallet>".',
    );
  }

  const token = normalizeSymbol(rawToken);
  validateAmount(amount, "Bridge");

  const supported = new Set(supportedSymbols.map((symbol) => normalizeSymbol(symbol)));
  if (!supported.has(token)) {
    throw new AppError(400, "unsupported_token", `Unsupported bridge token: ${token}.`);
  }

  if (recipient && !isAddress(recipient)) {
    throw new AppError(400, "invalid_recipient", `Invalid bridge recipient: ${recipient}.`);
  }

  return {
    action: "bridge",
    amount,
    token,
    destinationChain: destination.trim(),
    recipient: recipient as `0x${string}` | undefined,
    rawPrompt: trimmedPrompt,
  };
}

function parseSwapIntent(
  trimmedPrompt: string,
  groups: Record<string, string | undefined>,
  supportedSymbols: readonly string[],
): SwapIntent {
  const amount = groups.amount;
  const rawTokenIn = groups.tokenIn;
  const rawTokenOut = groups.tokenOut;
  const recipientClause = groups.recipientClause;

  if (!amount || !rawTokenIn || !rawTokenOut) {
    throw new AppError(
      400,
      "invalid_prompt",
      'Prompt must follow "swap <amount> <tokenIn> to <tokenOut>" or "swap <amount> <tokenIn> for <tokenOut>".',
    );
  }

  const tokenIn = normalizeSymbol(rawTokenIn);
  const tokenOut = normalizeSymbol(rawTokenOut);
  validateAmount(amount, "Swap");
  validateSupportedSymbols(tokenIn, tokenOut, supportedSymbols);

  const recipients = recipientClause ? extractRecipients(recipientClause) : [];

  if (recipientClause && recipients.length !== 1) {
    throw new AppError(400, "invalid_recipient", "Swap intents with send instructions must include exactly one recipient wallet address.");
  }

  return {
    action: "swap",
    amount,
    tokenIn,
    tokenOut,
    recipient: recipients[0],
    rawPrompt: trimmedPrompt,
  };
}

function parseTransferIntent(
  trimmedPrompt: string,
  groups: Record<string, string | undefined>,
  supportedSymbols: readonly string[],
): TransferIntent {
  const amount = groups.amount;
  const rawToken = groups.token;
  const recipientClause = groups.recipientClause;

  if (!amount || !rawToken || !recipientClause) {
    throw new AppError(
      400,
      "invalid_prompt",
      'Prompt must follow "transfer <amount> <token> to <wallets...>" or "send <amount> <token> to <wallets...>".',
    );
  }

  const token = normalizeSymbol(rawToken);
  validateAmount(amount, "Transfer");

  const supported = new Set(supportedSymbols.map((symbol) => normalizeSymbol(symbol)));
  if (!supported.has(token)) {
    throw new AppError(400, "unsupported_token", `Unsupported transfer token: ${token}.`);
  }

  const recipients = extractRecipients(recipientClause);
  if (recipients.length === 0) {
    throw new AppError(400, "invalid_recipient", "Transfer prompts must include at least one wallet address.");
  }
  if (recipients.length > 100) {
    throw new AppError(400, "too_many_recipients", "Transfer prompts may include at most 100 recipient wallets.");
  }

  return {
    action: "transfer",
    amount,
    token,
    recipients,
    rawPrompt: trimmedPrompt,
  };
}

function validateAmount(amount: string, actionLabel: string) {
  if (Number.parseFloat(amount) <= 0) {
    throw new AppError(400, "invalid_amount", `${actionLabel} amount must be greater than zero.`);
  }
}

function validateSupportedSymbols(tokenIn: string, tokenOut: string, supportedSymbols: readonly string[]) {
  if (tokenIn === tokenOut) {
    throw new AppError(400, "invalid_pair", "tokenIn and tokenOut must be different assets.");
  }

  const supported = new Set(supportedSymbols.map((symbol) => normalizeSymbol(symbol)));

  if (!supported.has(tokenIn)) {
    throw new AppError(400, "unsupported_token", `Unsupported input token: ${tokenIn}.`);
  }

  if (!supported.has(tokenOut)) {
    throw new AppError(400, "unsupported_token", `Unsupported output token: ${tokenOut}.`);
  }
}

function extractRecipients(input: string): `0x${string}`[] {
  const matches = input.match(ADDRESS_PATTERN) ?? [];
  const recipients = [...new Set(matches.map((match) => match as `0x${string}`))];

  for (const recipient of recipients) {
    if (!isAddress(recipient)) {
      throw new AppError(400, "invalid_recipient", `Invalid wallet address: ${recipient}.`);
    }
  }

  return recipients;
}

function normalizeSymbol(symbol: string) {
  return symbol.replace(/^\$/, "").trim().toUpperCase();
}
