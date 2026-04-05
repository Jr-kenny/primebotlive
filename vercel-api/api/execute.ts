import { analyzeTradeIntent } from "../server/opengradient.js";
import { prepareBridgeExecution } from "../server/bridge.js";
import { prepareSwapExecution } from "../server/swap.js";
import { prepareTransferExecution } from "../server/transfer.js";
import { AppError } from "../server/errors.js";
import { parseExecuteIntent, parseExecuteRequest } from "../server/intent.js";
import { verifyExecutionPayment } from "../server/payment.js";
import { getConfig, getPublicClient, handleError, json, options, readJson } from "./_shared.js";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const config = getConfig();
    const publicClient = getPublicClient();
    const { prompt, walletAddress, paymentTxHash, routePreference } = parseExecuteRequest(await readJson<unknown>(request));

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

    return json(result);
  } catch (error) {
    return handleError(error);
  }
}

export const OPTIONS = options;
