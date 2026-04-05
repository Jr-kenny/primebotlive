import https from "node:https";
import { randomBytes } from "node:crypto";

import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

import { erc20Abi } from "./abis.js";
import type { PrimeBotConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { SwapIntent } from "./intent.js";

const OPEN_GRADIENT_NETWORK_ID = 10_740;
const OPEN_GRADIENT_OPG_ASSET = "0x240b09731D96979f50B2C649C9CE10FcF9C7987F";
const PERMIT2_ADDRESS = "0x000000000022D473030F116dDEE9F6B43aC78BA3";
const X402_UPTO_PERMIT2_PROXY_ADDRESS = "0xBe08D629cc799E6C17200F454F68A61E017038C8";
const OPEN_GRADIENT_AUTH_BEARER =
  "Bearer 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
const MIN_OPG_APPROVAL_AMOUNT = 5_000_000_000_000_000_000n;
const TEE_CACHE_TTL_MS = 5 * 60 * 1_000;

const teeRegistryAbi = parseAbi([
  "function getActiveTEEs(uint8 teeType) view returns ((address owner,address paymentAddress,string endpoint,bytes publicKey,bytes tlsCertificate,bytes32 pcrHash,uint8 teeType,bool enabled,uint256 registeredAt,uint256 lastHeartbeatAt)[])",
]);

const TradeAnalysisSchema = z
  .object({
    route: z.string().min(1),
    expectedOut: z.string().min(1),
    risk: z.enum(["low", "medium", "high"]),
    reason: z.string().min(1),
  })
  .strict();

const GatewayResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string().nullable(),
            z.array(
              z.object({
                type: z.string(),
                text: z.string().optional(),
              }),
            ),
          ]),
        }),
      }),
    )
    .min(1),
});

type ActiveTee = {
  endpoint: string;
  tlsCertificate: `0x${string}`;
};

type PaymentRequired = {
  x402Version: number;
  resource?: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepts: PaymentRequirement[];
};

type PaymentRequirement = {
  scheme: string;
  network: string;
  asset: `0x${string}`;
  amount: string;
  payTo: `0x${string}`;
  maxTimeoutSeconds: number;
  extra?: Record<string, unknown>;
};

type HttpResponse = {
  status: number;
  headers: Headers;
  text(): Promise<string>;
  json(): Promise<unknown>;
};

export type TradeAnalysis = z.infer<typeof TradeAnalysisSchema>;

let teeCache:
  | {
      expiresAt: number;
      tee: ActiveTee;
    }
  | undefined;

export function validateTradeAnalysis(rawContent: string): TradeAnalysis {
  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(rawContent);
  } catch (error) {
    throw new AppError(502, "invalid_model_output", "OpenGradient returned non-JSON content.", {
      rawContent,
      cause: error instanceof Error ? error.message : "Unknown parse failure",
    });
  }

  const parsed = TradeAnalysisSchema.safeParse(parsedJson);

  if (!parsed.success) {
    throw new AppError(502, "invalid_model_output", "OpenGradient returned malformed analysis JSON.", parsed.error.flatten());
  }

  return parsed.data;
}

export async function analyzeTradeIntent(config: PrimeBotConfig, intent: SwapIntent) {
  const tee = await resolveActiveTee(config);
  const endpoint = resolveLlmEndpoint(config, tee);
  const requestBody = JSON.stringify({
    model: normalizeOpenGradientModel(config.openGradient.model),
    temperature: 0,
    max_tokens: 200,
    messages: [
      {
        role: "system",
        content: [
          "You are PrimeBot's TEE trade analysis engine.",
          "Return only JSON. No markdown. No code fences. No prose outside the JSON object.",
          'The JSON schema is exactly {"route":"string","expectedOut":"string","risk":"low|medium|high","reason":"string"}.',
          "Set route to a short machine-friendly route hint.",
          "Set risk to high for trades that look unsafe, ambiguous, or illiquid.",
          "expectedOut must be a short estimate string and can be approximate.",
        ].join(" "),
      },
      {
        role: "user",
        content: JSON.stringify({
          project: "PrimeBot",
          chain: "base-sepolia",
          intent,
          supportedRoutes: ["uniswap_v3_direct", "uniswap_v3_multihop", "uniswap_v2_direct", "uniswap_v2_multihop", "zeroex_aggregated", "lifi_aggregated"],
        }),
      },
    ],
  });

  let response = await teeRequest(tee, endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: OPEN_GRADIENT_AUTH_BEARER,
      "X-SETTLEMENT-TYPE": config.openGradient.settlementType,
    },
    body: requestBody,
  });

  if (response.status === 402) {
    const paymentRequired = parsePaymentRequired(response.headers);
    const accepted = selectPaymentRequirement(paymentRequired.accepts);
    await ensureOpgPermit2Approval(config, BigInt(accepted.amount));
    const paymentSignature = await createPaymentSignature(config, paymentRequired, accepted);

    response = await teeRequest(tee, endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: OPEN_GRADIENT_AUTH_BEARER,
        "X-SETTLEMENT-TYPE": config.openGradient.settlementType,
        "PAYMENT-SIGNATURE": paymentSignature,
      },
      body: requestBody,
    });
  }

  if (!response.status || response.status >= 500) {
    const errorText = await response.text();
    throw new AppError(502, "opengradient_request_failed", "OpenGradient request failed.", {
      status: response.status,
      body: errorText,
      endpoint,
    });
  }

  if (response.status !== 200) {
    const errorText = await response.text();
    throw new AppError(502, "opengradient_request_failed", "OpenGradient request failed.", {
      status: response.status,
      body: errorText,
      endpoint,
    });
  }

  const responseBody = GatewayResponseSchema.safeParse(await response.json());

  if (!responseBody.success) {
    throw new AppError(502, "invalid_opengradient_response", "OpenGradient returned an unexpected response body.", responseBody.error.flatten());
  }

  const message = responseBody.data.choices[0]?.message.content;
  const content = typeof message === "string" ? message.trim() : normalizeContentBlocks(message ?? null);

  if (!content) {
    throw new AppError(502, "empty_model_output", "OpenGradient returned an empty analysis.");
  }

  return validateTradeAnalysis(content);
}

function normalizeContentBlocks(
  blocks:
    | (readonly {
        type: string;
        text?: string;
      }[])
    | null,
) {
  if (!blocks) {
    return "";
  }

  return blocks
    .filter((block) => block.type === "text" && typeof block.text === "string")
    .map((block) => block.text?.trim() ?? "")
    .join(" ")
    .trim();
}

async function resolveActiveTee(config: PrimeBotConfig): Promise<ActiveTee> {
  const now = Date.now();
  if (teeCache && teeCache.expiresAt > now) {
    return teeCache.tee;
  }

  const registryClient = createPublicClient({
    transport: http(config.openGradient.rpcUrl),
  });
  const activeTees = await registryClient.readContract({
    address: config.openGradient.teeRegistryAddress,
    abi: teeRegistryAbi,
    functionName: "getActiveTEEs",
    args: [0],
  });

  if (!activeTees.length) {
    throw new AppError(502, "opengradient_unreachable", "No active OpenGradient LLM TEE endpoints were found.");
  }

  const tee = activeTees[Math.floor(Math.random() * activeTees.length)];
  if (!tee) {
    throw new AppError(502, "opengradient_unreachable", "No active OpenGradient LLM TEE endpoints were found.");
  }

  const selected: ActiveTee = {
    endpoint: tee.endpoint,
    tlsCertificate: tee.tlsCertificate,
  };

  teeCache = {
    tee: selected,
    expiresAt: now + TEE_CACHE_TTL_MS,
  };

  return selected;
}

function resolveLlmEndpoint(config: PrimeBotConfig, tee: ActiveTee) {
  const configuredUrl = config.openGradient.url;

  if (configuredUrl) {
    const parsed = new URL(configuredUrl);
    const isLegacyGateway = parsed.hostname === "llm.opengradient.ai";
    if (!isLegacyGateway) {
      return configuredUrl;
    }
  }

  return new URL("/v1/chat/completions", tee.endpoint).toString();
}

async function teeRequest(
  tee: ActiveTee,
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  },
): Promise<HttpResponse> {
  const request = new Request(url, init);
  const bodyBuffer = Buffer.from(await request.arrayBuffer());
  const headers = new Headers(request.headers);
  headers.set("Content-Length", bodyBuffer.length.toString());

  return await new Promise<HttpResponse>((resolve, reject) => {
    const parsed = new URL(request.url);
    const req = https.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: `${parsed.pathname}${parsed.search}`,
        method: request.method,
        headers: Object.fromEntries(headers.entries()),
        ca: derToPem(tee.tlsCertificate),
        checkServerIdentity: () => undefined,
      },
      async (response) => {
        const chunks: Buffer[] = [];
        for await (const chunk of response) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }

        const payload = Buffer.concat(chunks);
        const responseHeaders = new Headers();
        for (const [header, value] of Object.entries(response.headers)) {
          if (Array.isArray(value)) {
            responseHeaders.set(header, value.join(", "));
          } else if (typeof value === "string") {
            responseHeaders.set(header, value);
          }
        }

        resolve({
          status: response.statusCode ?? 500,
          headers: responseHeaders,
          text: async () => payload.toString("utf8"),
          json: async () => JSON.parse(payload.toString("utf8")) as unknown,
        });
      },
    );

    req.on("error", (error) => {
      reject(
        new AppError(502, "opengradient_unreachable", "OpenGradient is unreachable from this environment.", {
          endpoint: url,
          cause: error.message,
        }),
      );
    });

    req.write(bodyBuffer);
    req.end();
  });
}

function parsePaymentRequired(headers: Headers): PaymentRequired {
  const encoded = headers.get("PAYMENT-REQUIRED");

  if (!encoded) {
    throw new AppError(502, "invalid_opengradient_response", "OpenGradient did not return PAYMENT-REQUIRED details.");
  }

  try {
    return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")) as PaymentRequired;
  } catch (error) {
    throw new AppError(502, "invalid_opengradient_response", "OpenGradient returned an unreadable PAYMENT-REQUIRED header.", {
      cause: error instanceof Error ? error.message : "Unknown decode failure",
    });
  }
}

function selectPaymentRequirement(requirements: PaymentRequirement[]) {
  const accepted = requirements.find(
    (requirement) =>
      requirement.network === "eip155:84532" &&
      requirement.asset.toLowerCase() === OPEN_GRADIENT_OPG_ASSET.toLowerCase() &&
      requirement.scheme === "upto",
  );

  if (!accepted) {
    throw new AppError(502, "unsupported_payment_requirement", "OpenGradient did not offer a supported Base Sepolia OPG payment option.", {
      requirements,
    });
  }

  return accepted;
}

async function ensureOpgPermit2Approval(config: PrimeBotConfig, minimumAmount: bigint) {
  const approvalTarget = minimumAmount > MIN_OPG_APPROVAL_AMOUNT ? minimumAmount : MIN_OPG_APPROVAL_AMOUNT;
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });
  const allowance = await publicClient.readContract({
    address: OPEN_GRADIENT_OPG_ASSET,
    abi: erc20Abi,
    functionName: "allowance",
    args: [config.account.address, PERMIT2_ADDRESS],
  });

  if (allowance >= approvalTarget) {
    return;
  }

  const walletClient = createWalletClient({
    account: config.account,
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });
  const approvalHash = await walletClient.writeContract({
    account: config.account,
    chain: baseSepolia,
    address: OPEN_GRADIENT_OPG_ASSET,
    abi: erc20Abi,
    functionName: "approve",
    args: [PERMIT2_ADDRESS, approvalTarget],
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });

  if (receipt.status !== "success") {
    throw new AppError(502, "opengradient_payment_setup_failed", "Failed to approve OPG spending for OpenGradient.", {
      txHash: approvalHash,
    });
  }
}

async function createPaymentSignature(
  config: PrimeBotConfig,
  paymentRequired: PaymentRequired,
  accepted: PaymentRequirement,
) {
  const now = Math.floor(Date.now() / 1_000);
  const validAfter = (now - 600).toString();
  const deadline = (now + accepted.maxTimeoutSeconds).toString();
  const nonce = BigInt(`0x${randomBytes(32).toString("hex")}`).toString();
  const signature = await config.account.signTypedData({
    domain: {
      name: "Permit2",
      chainId: 84_532,
      verifyingContract: PERMIT2_ADDRESS,
    },
    types: {
      PermitWitnessTransferFrom: [
        { name: "permitted", type: "TokenPermissions" },
        { name: "spender", type: "address" },
        { name: "nonce", type: "uint256" },
        { name: "deadline", type: "uint256" },
        { name: "witness", type: "Witness" },
      ],
      TokenPermissions: [
        { name: "token", type: "address" },
        { name: "amount", type: "uint256" },
      ],
      Witness: [
        { name: "to", type: "address" },
        { name: "validAfter", type: "uint256" },
        { name: "extra", type: "bytes" },
      ],
    },
    primaryType: "PermitWitnessTransferFrom",
    message: {
      permitted: {
        token: accepted.asset,
        amount: BigInt(accepted.amount),
      },
      spender: X402_UPTO_PERMIT2_PROXY_ADDRESS,
      nonce: BigInt(nonce),
      deadline: BigInt(deadline),
      witness: {
        to: accepted.payTo,
        validAfter: BigInt(validAfter),
        extra: "0x",
      },
    },
  });

  const payload = {
    x402Version: 2,
    payload: {
      permit2Authorization: {
        permitted: {
          token: accepted.asset,
          amount: accepted.amount,
        },
        spender: X402_UPTO_PERMIT2_PROXY_ADDRESS,
        nonce,
        deadline,
        witness: {
          to: accepted.payTo,
          validAfter,
          extra: "0x",
        },
        from: config.account.address,
      },
      signature,
    },
    accepted,
    resource: paymentRequired.resource,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

function derToPem(certificate: `0x${string}`) {
  const base64 = Buffer.from(certificate.slice(2), "hex")
    .toString("base64")
    .match(/.{1,64}/g)
    ?.join("\n");

  if (!base64) {
    throw new AppError(502, "opengradient_unreachable", "OpenGradient returned an invalid TLS certificate.");
  }

  return `-----BEGIN CERTIFICATE-----\n${base64}\n-----END CERTIFICATE-----\n`;
}

function normalizeOpenGradientModel(model: string) {
  const segments = model.split("/");
  const selected = segments.at(-1)?.trim();

  if (!selected) {
    throw new AppError(500, "invalid_configuration", "OPENGRADIENT_MODEL is invalid.");
  }

  return selected;
}
