import { encodeFunctionData, formatUnits, parseUnits } from "viem";

import { erc20Abi } from "./abis.js";
import type { PrimeBotConfig } from "./config.js";
import { AppError } from "./errors.js";
import type { TransferIntent } from "./intent.js";
import type { PreparedExecutionTx } from "./swap.js";

export type TransferAnalysis = {
  route: "native_transfer" | "erc20_transfer";
  expectedOut: string;
  risk: "low" | "medium";
  reason: string;
};

export type TransferExecutionPlan = {
  kind: "transfer";
  chainId: number;
  txs: PreparedExecutionTx[];
};

type TransferExecutionResult =
  | {
      analysis: TransferAnalysis;
      txHash: `0x${string}`;
    }
  | {
      analysis: TransferAnalysis;
      txHashes: `0x${string}`[];
    };

export async function executeTransfer(
  config: PrimeBotConfig,
  publicClient: any,
  walletClient: any,
  intent: TransferIntent,
): Promise<TransferExecutionResult> {
  const prepared = await prepareTransfer(config, publicClient, intent);

  const startingNonce = await publicClient.getTransactionCount({
    address: config.account.address,
    blockTag: "pending",
  });

  const txHashes: `0x${string}`[] = [];

  for (const [index, recipient] of intent.recipients.entries()) {
    if (prepared.token.isNative) {
      const txHash = await walletClient.sendTransaction({
        account: config.account,
        to: recipient,
        value: prepared.amountPerRecipient,
        nonce: startingNonce + index,
      });

      txHashes.push(txHash);
      continue;
    }

    const simulation = await publicClient.simulateContract({
      account: config.account.address,
      address: prepared.token.address,
      abi: erc20Abi,
      functionName: "transfer",
      args: [recipient, prepared.amountPerRecipient],
      nonce: startingNonce + index,
    });

    const txHash = await walletClient.writeContract({
      ...simulation.request,
      account: config.account,
      nonce: startingNonce + index,
    });

    txHashes.push(txHash);
  }

  const receipts = await Promise.all(
    txHashes.map((hash) => publicClient.waitForTransactionReceipt({ hash })),
  );

  const failedReceipt = receipts.find((receipt) => receipt.status !== "success");
  if (failedReceipt) {
    throw new AppError(502, "transfer_failed", "At least one transfer transaction did not succeed.", {
      txHashes,
      failedHash: failedReceipt.transactionHash,
      status: failedReceipt.status,
    });
  }

  const analysis = prepared.analysis;

  if (txHashes.length === 1) {
    const [txHash] = txHashes;

    if (!txHash) {
      throw new AppError(500, "internal_error", "Transfer execution did not produce a transaction hash.");
    }

    return {
      analysis,
      txHash,
    };
  }

  return {
    analysis,
    txHashes,
  };
}

export async function previewTransfer(
  config: PrimeBotConfig,
  publicClient: any,
  intent: TransferIntent,
): Promise<{ analysis: TransferAnalysis }> {
  const prepared = await prepareTransfer(config, publicClient, intent);

  return {
    analysis: prepared.analysis,
  };
}

export async function prepareTransferExecution(
  config: PrimeBotConfig,
  publicClient: any,
  intent: TransferIntent,
  walletAddress: `0x${string}`,
): Promise<{ analysis: TransferAnalysis; execution: TransferExecutionPlan }> {
  const prepared = await prepareTransfer(config, publicClient, intent, walletAddress);

  const txs: PreparedExecutionTx[] = intent.recipients.map((recipient) =>
    prepared.token.isNative
      ? {
          to: recipient,
          value: prepared.amountPerRecipient.toString(),
        }
      : {
          to: prepared.token.address,
          data: encodeFunctionData({
            abi: erc20Abi,
            functionName: "transfer",
            args: [recipient, prepared.amountPerRecipient],
          }),
          value: "0",
        },
  );

  return {
    analysis: prepared.analysis,
    execution: {
      kind: "transfer",
      chainId: 84532,
      txs,
    },
  };
}

async function prepareTransfer(
  config: PrimeBotConfig,
  publicClient: any,
  intent: TransferIntent,
  walletAddress: `0x${string}` = config.account.address,
) {
  const token = mustGetToken(config, intent.token);
  const amountPerRecipient = parseUnits(intent.amount, token.decimals);
  const totalAmount = amountPerRecipient * BigInt(intent.recipients.length);

  if (token.isNative) {
    const nativeBalance = await publicClient.getBalance({
      address: walletAddress,
    });

    if (nativeBalance < totalAmount) {
      throw new AppError(422, "insufficient_balance", "Insufficient ETH balance for the requested transfer batch.", {
        required: totalAmount.toString(),
        available: nativeBalance.toString(),
      });
    }
  } else {
    const tokenBalance = await publicClient.readContract({
      address: token.address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [walletAddress],
    });

    if (tokenBalance < totalAmount) {
      throw new AppError(422, "insufficient_balance", `Insufficient ${token.symbol} balance for the requested transfer batch.`, {
        required: totalAmount.toString(),
        available: tokenBalance.toString(),
      });
    }
  }

  return {
    token,
    amountPerRecipient,
    analysis: {
      route: token.isNative ? "native_transfer" : "erc20_transfer",
      expectedOut: `${formatUnits(amountPerRecipient, token.decimals)} ${token.symbol} to each of ${intent.recipients.length} wallet(s)`,
      risk: intent.recipients.length > 20 ? "medium" : "low",
      reason: token.isNative
        ? "Deterministic native ETH transfer with explicit wallet recipients."
        : `Deterministic ${token.symbol} ERC-20 transfer with explicit wallet recipients.`,
    } satisfies TransferAnalysis,
  };
}

function mustGetToken(config: PrimeBotConfig, symbol: string) {
  const token = config.tokens[symbol];

  if (!token) {
    throw new AppError(400, "unsupported_token", `Unsupported token: ${symbol}.`);
  }

  return token;
}
