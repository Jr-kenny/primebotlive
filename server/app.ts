import cors from "cors";
import express from "express";
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";

import { prepareBridgeExecution, previewBridge } from "./bridge.js";
import type { PrimeBotConfig } from "./config.js";
import { AppError, toErrorResponse } from "./errors.js";
import { parseExecuteIntent, parseExecuteRequest } from "./intent.js";
import { analyzeTradeIntent } from "./opengradient.js";
import { verifyExecutionPayment } from "./payment.js";
import { prepareSwapExecution, previewSwap } from "./swap.js";
import { prepareTransferExecution, previewTransfer } from "./transfer.js";

export function createApp(config: PrimeBotConfig) {
  const app = express();
  const publicClient = createPublicClient({
    chain: baseSepolia,
    transport: http(config.baseRpcUrl),
  });

  app.use(
    cors({
      origin: true,
      credentials: false,
      allowedHeaders: [
        "Content-Type",
        "Authorization",
      ],
    }),
  );
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.json({
      ok: true,
      chainId: baseSepolia.id,
      supportedTokens: Object.keys(config.tokens),
      supportedVenues: [
        "uniswap_v3",
        "uniswap_v2",
        ...(config.across.enabled ? ["across"] : []),
        ...(config.liFi.enabled ? ["lifi"] : []),
        ...(config.zeroEx.enabled ? ["zeroex"] : []),
      ],
    });
  });

  app.get("/payment-config", (_request, response) => {
    response.json({
      chainId: baseSepolia.id,
      asset: "ETH",
      treasuryAddress: config.treasuryAddress,
      executionFeeWei: config.executionFeeWei.toString(),
    });
  });

  app.post("/analyze", async (request, response) => {
    try {
      const { prompt, routePreference } = parseExecuteRequest(request.body);
      const intent = parseExecuteIntent(prompt, Object.keys(config.tokens));
      const result =
        intent.action === "swap"
          ? await previewSwap(
              config,
              publicClient,
              intent,
              await analyzeTradeIntent(config, intent),
              routePreference,
            )
          : intent.action === "bridge"
            ? await previewBridge(config, intent)
            : await previewTransfer(config, publicClient, intent);

      response.json({
        intent,
        ...result,
      });
    } catch (error) {
      const failure = toErrorResponse(error);
      response.status(failure.statusCode).json(failure.body);
    }
  });

  app.post("/execute", async (request, response) => {
    try {
      const { prompt, walletAddress, paymentTxHash, routePreference } = parseExecuteRequest(request.body);
      if (!walletAddress) {
        throw new AppError(400, "missing_wallet_address", "walletAddress is required for execution.");
      }
      if (!paymentTxHash) {
        throw new AppError(402, "missing_payment_tx_hash", "paymentTxHash is required for execution.");
      }
      const executionWalletAddress = walletAddress as `0x${string}`;
      await verifyExecutionPayment(config, publicClient, {
        txHash: paymentTxHash as `0x${string}`,
        walletAddress: executionWalletAddress,
      });
      const intent = parseExecuteIntent(prompt, Object.keys(config.tokens));
      const result =
        intent.action === "swap"
          ? await prepareSwapExecution(
              config,
              publicClient,
              intent,
              await analyzeTradeIntent(config, intent),
              executionWalletAddress,
              routePreference,
            )
          : intent.action === "bridge"
            ? await prepareBridgeExecution(config, intent, executionWalletAddress)
            : await prepareTransferExecution(config, publicClient, intent, executionWalletAddress);

      response.json(result);
    } catch (error) {
      const failure = toErrorResponse(error);
      response.status(failure.statusCode).json(failure.body);
    }
  });

  app.use((_request, response) => {
    response.status(404).json({
      error: {
        code: "not_found",
        message: "Route not found.",
      },
    });
  });

  return app;
}
