import { config as loadDotenv } from "dotenv";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { z } from "zod";

loadDotenv();

const EnvSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  BASE_RPC_URL: z.string().url().default(baseSepolia.rpcUrls.default.http[0] ?? "https://sepolia.base.org"),
  PRIMEBOT_PRIVATE_KEY: z.string().regex(/^0x[a-fA-F0-9]{64}$/, "PRIMEBOT_PRIVATE_KEY must be a 32-byte hex string."),
  TREASURY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  EXECUTION_FEE_WEI: z
    .string()
    .regex(/^\d+$/, "EXECUTION_FEE_WEI must be an integer string in wei.")
    .default("100000000000000"),
  PAYMENT_LEDGER_PATH: z.string().optional().or(z.literal("")),
  OPENGRADIENT_URL: z.string().url().optional().or(z.literal("")),
  OPENGRADIENT_RPC_URL: z.string().url().default("https://ogevmdevnet.opengradient.ai"),
  OPENGRADIENT_TEE_REGISTRY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x4e72238852f3c918f4E4e57AeC9280dDB0c80248"),
  OPENGRADIENT_MODEL: z.string().min(1).default("openai/gpt-4.1-2025-04-14"),
  OPENGRADIENT_SETTLEMENT_TYPE: z.enum(["private", "individual", "batch"]).default("individual"),
  ZEROX_API_URL: z.string().url().default("https://api.0x.org"),
  ZEROX_API_KEY: z.string().optional().or(z.literal("")),
  LIFI_API_URL: z.string().url().default("https://li.quest/v1"),
  LIFI_INTEGRATOR: z.string().min(1).default("PrimeBot"),
  ACROSS_API_URL: z.string().url().default("https://testnet.across.to/api"),
  ACROSS_INTEGRATOR_ID: z
    .string()
    .regex(/^0x[a-fA-F0-9]{4}$/)
    .optional()
    .or(z.literal("")),
  UNISWAP_V3_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24"),
  UNISWAP_V3_QUOTER_V2_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0xC5290058841028F1614F3A6F0F5816cAd0df5E27"),
  UNISWAP_V3_SWAP_ROUTER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x94cC0AaC535CCDB3C01d6787D6413C739ae12bc4"),
  UNISWAP_V2_FACTORY_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x7Ae58f10f7849cA6F5fB71b7f45CB416c9204b1e"),
  UNISWAP_V2_ROUTER_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x1689E7B1F10000AE47eBfE339a4f69dECd19F602"),
  UNISWAP_V3_FEE_TIERS: z.string().default("500,3000,10000"),
  DEFAULT_SLIPPAGE_BPS: z.coerce.number().int().min(1).max(5_000).default(100),
  EXECUTION_DEADLINE_SECONDS: z.coerce.number().int().min(30).max(86_400).default(300),
  BASE_SEPOLIA_WETH_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x4200000000000000000000000000000000000006"),
  BASE_SEPOLIA_USDC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).default("0x036CbD53842c5426634e7929541eC2318f3dCF7e"),
  BASE_SEPOLIA_USDT_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  BASE_SEPOLIA_USDT_DECIMALS: z.coerce.number().int().min(0).max(255).default(6),
  BASE_SEPOLIA_DAI_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  BASE_SEPOLIA_DAI_DECIMALS: z.coerce.number().int().min(0).max(255).default(18),
  BASE_SEPOLIA_EURC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  BASE_SEPOLIA_EURC_DECIMALS: z.coerce.number().int().min(0).max(255).default(6),
  BASE_SEPOLIA_CBBTC_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  BASE_SEPOLIA_CBBTC_DECIMALS: z.coerce.number().int().min(0).max(255).default(8),
  BASE_SEPOLIA_CBETH_ADDRESS: z.string().regex(/^0x[a-fA-F0-9]{40}$/).optional().or(z.literal("")),
  BASE_SEPOLIA_CBETH_DECIMALS: z.coerce.number().int().min(0).max(255).default(18),
  BASE_SEPOLIA_EXTRA_TOKENS_JSON: z.string().optional().or(z.literal("")),
});

export type TokenConfig = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  isNative?: boolean;
};

export type PrimeBotConfig = {
  port: number;
  baseRpcUrl: string;
  account: ReturnType<typeof privateKeyToAccount>;
  treasuryAddress: `0x${string}`;
  executionFeeWei: bigint;
  paymentLedgerPath: string;
  openGradient: {
    url?: string;
    rpcUrl: string;
    teeRegistryAddress: `0x${string}`;
    model: string;
    settlementType: "private" | "individual" | "batch";
  };
  zeroEx: {
    apiUrl: string;
    apiKey?: string;
    enabled: boolean;
  };
  liFi: {
    apiUrl: string;
    integrator: string;
    enabled: boolean;
  };
  across: {
    apiUrl: string;
    integratorId?: string;
    enabled: boolean;
  };
  uniswap: {
    factoryAddress: `0x${string}`;
    quoterV2Address: `0x${string}`;
    swapRouterAddress: `0x${string}`;
    v2FactoryAddress: `0x${string}`;
    v2RouterAddress: `0x${string}`;
    feeTiers: number[];
    defaultSlippageBps: number;
    executionDeadlineSeconds: number;
  };
  tokens: Record<string, TokenConfig>;
};

const ExtraTokenSchema = z.object({
  symbol: z.string().min(1),
  address: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  decimals: z.number().int().min(0).max(255),
  isNative: z.boolean().optional(),
});

function registerToken(tokens: Record<string, TokenConfig>, token: TokenConfig) {
  tokens[token.symbol.toUpperCase()] = {
    ...token,
    symbol: token.symbol.toUpperCase(),
  };
}

function parseExtraTokens(raw: string | undefined): TokenConfig[] {
  if (!raw) {
    return [];
  }

  let parsedJson: unknown;

  try {
    parsedJson = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Invalid BASE_SEPOLIA_EXTRA_TOKENS_JSON: ${error instanceof Error ? error.message : "Unknown parse failure"}`);
  }

  const parsed = z.array(ExtraTokenSchema).safeParse(parsedJson);

  if (!parsed.success) {
    throw new Error(`Invalid BASE_SEPOLIA_EXTRA_TOKENS_JSON: ${parsed.error.message}`);
  }

  return parsed.data.map((token) => ({
    symbol: token.symbol.toUpperCase(),
    address: token.address as `0x${string}`,
    decimals: token.decimals,
    isNative: token.isNative,
  }));
}

export function loadConfig(): PrimeBotConfig {
  const parsed = EnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }

  const env = parsed.data;
  const account = privateKeyToAccount(env.PRIMEBOT_PRIVATE_KEY as `0x${string}`);
  const treasuryAddress = (env.TREASURY_ADDRESS || account.address) as `0x${string}`;
  const paymentLedgerPath = env.PAYMENT_LEDGER_PATH || ".primebot-payment-ledger.json";

  const tokens: Record<string, TokenConfig> = {
    ETH: {
      symbol: "ETH",
      address: env.BASE_SEPOLIA_WETH_ADDRESS as `0x${string}`,
      decimals: 18,
      isNative: true,
    },
    WETH: {
      symbol: "WETH",
      address: env.BASE_SEPOLIA_WETH_ADDRESS as `0x${string}`,
      decimals: 18,
    },
    USDC: {
      symbol: "USDC",
      address: env.BASE_SEPOLIA_USDC_ADDRESS as `0x${string}`,
      decimals: 6,
    },
  };

  if (env.BASE_SEPOLIA_USDT_ADDRESS) {
    registerToken(tokens, {
      symbol: "USDT",
      address: env.BASE_SEPOLIA_USDT_ADDRESS as `0x${string}`,
      decimals: env.BASE_SEPOLIA_USDT_DECIMALS,
    });
  }

  if (env.BASE_SEPOLIA_DAI_ADDRESS) {
    registerToken(tokens, {
      symbol: "DAI",
      address: env.BASE_SEPOLIA_DAI_ADDRESS as `0x${string}`,
      decimals: env.BASE_SEPOLIA_DAI_DECIMALS,
    });
  }

  if (env.BASE_SEPOLIA_EURC_ADDRESS) {
    registerToken(tokens, {
      symbol: "EURC",
      address: env.BASE_SEPOLIA_EURC_ADDRESS as `0x${string}`,
      decimals: env.BASE_SEPOLIA_EURC_DECIMALS,
    });
  }

  if (env.BASE_SEPOLIA_CBBTC_ADDRESS) {
    registerToken(tokens, {
      symbol: "CBBTC",
      address: env.BASE_SEPOLIA_CBBTC_ADDRESS as `0x${string}`,
      decimals: env.BASE_SEPOLIA_CBBTC_DECIMALS,
    });
  }

  if (env.BASE_SEPOLIA_CBETH_ADDRESS) {
    registerToken(tokens, {
      symbol: "CBETH",
      address: env.BASE_SEPOLIA_CBETH_ADDRESS as `0x${string}`,
      decimals: env.BASE_SEPOLIA_CBETH_DECIMALS,
    });
  }

  for (const token of parseExtraTokens(env.BASE_SEPOLIA_EXTRA_TOKENS_JSON)) {
    registerToken(tokens, token);
  }

  return {
    port: env.PORT,
    baseRpcUrl: env.BASE_RPC_URL,
    account,
    treasuryAddress,
    executionFeeWei: BigInt(env.EXECUTION_FEE_WEI),
    paymentLedgerPath,
    openGradient: {
      url: env.OPENGRADIENT_URL || undefined,
      rpcUrl: env.OPENGRADIENT_RPC_URL,
      teeRegistryAddress: env.OPENGRADIENT_TEE_REGISTRY_ADDRESS as `0x${string}`,
      model: env.OPENGRADIENT_MODEL,
      settlementType: env.OPENGRADIENT_SETTLEMENT_TYPE,
    },
    zeroEx: {
      apiUrl: env.ZEROX_API_URL,
      apiKey: env.ZEROX_API_KEY || undefined,
      enabled: Boolean(env.ZEROX_API_KEY),
    },
    liFi: {
      apiUrl: env.LIFI_API_URL,
      integrator: env.LIFI_INTEGRATOR,
      enabled: true,
    },
    across: {
      apiUrl: env.ACROSS_API_URL,
      integratorId: env.ACROSS_INTEGRATOR_ID || undefined,
      enabled: true,
    },
    uniswap: {
      factoryAddress: env.UNISWAP_V3_FACTORY_ADDRESS as `0x${string}`,
      quoterV2Address: env.UNISWAP_V3_QUOTER_V2_ADDRESS as `0x${string}`,
      swapRouterAddress: env.UNISWAP_V3_SWAP_ROUTER_ADDRESS as `0x${string}`,
      v2FactoryAddress: env.UNISWAP_V2_FACTORY_ADDRESS as `0x${string}`,
      v2RouterAddress: env.UNISWAP_V2_ROUTER_ADDRESS as `0x${string}`,
      feeTiers: env.UNISWAP_V3_FEE_TIERS.split(",")
        .map((value) => Number.parseInt(value.trim(), 10))
        .filter((value) => Number.isFinite(value) && value > 0),
      defaultSlippageBps: env.DEFAULT_SLIPPAGE_BPS,
      executionDeadlineSeconds: env.EXECUTION_DEADLINE_SECONDS,
    },
    tokens,
  };
}
