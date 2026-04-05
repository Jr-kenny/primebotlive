import { createPublicClient, http, type WalletClient } from "viem";
import { baseSepolia } from "viem/chains";

const API_BASE_URL =
  import.meta.env.VITE_PRIMEBOT_API_URL ??
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:8787"
    : "/api");
const BASE_RPC_URL = import.meta.env.VITE_BASE_RPC_URL ?? baseSepolia.rpcUrls.default.http[0];

let paymentConfigPromise: Promise<ExecutionPaymentConfig> | undefined;

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export type ValidationStatus = "safe" | "caution" | "blocked";
export type RoutePreference = "balanced" | "best_return" | "safer" | "lower_gas";

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

export type TradeAnalysis = {
  route: string;
  expectedOut: string;
  risk: "low" | "medium" | "high";
  reason: string;
};

export type SwapRoutingOption = {
  preference: RoutePreference;
  title: string;
  summary: string;
  route: string;
  expectedOut: string;
};

export type SwapRoutingSummary = {
  selectedPreference: RoutePreference;
  options: SwapRoutingOption[];
};

export type AnalyzeIntentResponse = {
  intent: ExecuteIntent;
  analysis: TradeAnalysis;
  routing?: SwapRoutingSummary;
};

export type ExecuteIntentResponse = {
  analysis: TradeAnalysis;
  routing?: SwapRoutingSummary;
  txHash?: `0x${string}`;
  txHashes?: `0x${string}`[];
};

type ExecutionTx = {
  to: `0x${string}`;
  data?: `0x${string}`;
  value: string;
};

type ExecutePlanResponse = {
  analysis: TradeAnalysis;
  routing?: SwapRoutingSummary;
  execution: {
    kind: "swap" | "transfer" | "bridge";
    chainId: number;
    txs: ExecutionTx[];
  };
};

type ExecutionPaymentConfig = {
  chainId: number;
  asset: "ETH";
  treasuryAddress: `0x${string}`;
  executionFeeWei: string;
};

export class PrimeBotApiError extends Error {
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, options?: { code?: string; details?: unknown }) {
    super(message);
    this.name = "PrimeBotApiError";
    this.code = options?.code;
    this.details = options?.details;
  }
}

export async function analyzeIntent(prompt: string, routePreference: RoutePreference = "balanced"): Promise<AnalyzeIntentResponse> {
  const response = await fetch(`${API_BASE_URL}/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prompt, routePreference }),
  });

  return parseJsonResponse<AnalyzeIntentResponse>(response);
}

export async function executeIntent(
  prompt: string,
  options: {
    account: `0x${string}`;
    walletClient: WalletClient;
    routePreference?: RoutePreference;
  },
): Promise<ExecuteIntentResponse> {
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(BASE_RPC_URL),
  });
  const { account, walletClient, routePreference = "balanced" } = options;
  const paymentConfig = await getExecutionPaymentConfig();

  if (paymentConfig.chainId !== baseSepolia.id) {
    throw new PrimeBotApiError(`PrimeBot payment config returned unsupported chainId ${paymentConfig.chainId}.`, {
      code: "unsupported_payment_chain",
      details: paymentConfig,
    });
  }

  const paymentTxHash = await walletClient.sendTransaction({
    account,
    chain: baseSepolia,
    to: paymentConfig.treasuryAddress,
    value: BigInt(paymentConfig.executionFeeWei),
  });

  await publicClient.waitForTransactionReceipt({
    hash: paymentTxHash,
  });

  const response = await fetch(`${API_BASE_URL}/execute`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      prompt,
      walletAddress: account,
      paymentTxHash,
      routePreference,
    }),
  });

  const plan = await parseJsonResponse<ExecutePlanResponse>(response);
  const txHashes: `0x${string}`[] = [];

  for (const tx of plan.execution.txs) {
    const txHash = await walletClient.sendTransaction({
      account,
      chain: baseSepolia,
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value),
    });

    txHashes.push(txHash);
  }

  if (txHashes.length === 1) {
    return {
      analysis: plan.analysis,
      routing: plan.routing,
      txHash: txHashes[0],
    };
  }

  return {
    analysis: plan.analysis,
    routing: plan.routing,
    txHashes,
  };
}

export function toValidationStatus(risk: TradeAnalysis["risk"]): ValidationStatus {
  if (risk === "high") {
    return "blocked";
  }

  if (risk === "medium") {
    return "caution";
  }

  return "safe";
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await safeJson<ApiErrorBody>(response);

    throw new PrimeBotApiError(
      errorBody?.error?.message ?? `PrimeBot request failed with status ${response.status}.`,
      {
        code: errorBody?.error?.code,
        details: errorBody?.error?.details,
      },
    );
  }

  return (await response.json()) as T;
}

async function safeJson<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

async function getExecutionPaymentConfig() {
  if (!paymentConfigPromise) {
    paymentConfigPromise = fetch(`${API_BASE_URL}/payment-config`).then((response) =>
      parseJsonResponse<ExecutionPaymentConfig>(response),
    );
  }

  return await paymentConfigPromise;
}
