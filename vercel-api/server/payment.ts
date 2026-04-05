import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

import type { PrimeBotConfig } from "./config.js";
import { AppError } from "./errors.js";

type PaymentPublicClient = {
  getTransaction(args: {
    hash: `0x${string}`;
  }): Promise<{
    from: `0x${string}`;
    to: `0x${string}` | null;
    value: bigint;
  }>;
  getTransactionReceipt(args: {
    hash: `0x${string}`;
  }): Promise<{
    status: "success" | "reverted";
  }>;
};

type PaymentLedgerRecord = {
  txHash: `0x${string}`;
  walletAddress: `0x${string}`;
  consumedAt: string;
};

type PaymentLedgerState = {
  spent: Record<`0x${string}`, PaymentLedgerRecord>;
};

const EMPTY_LEDGER: PaymentLedgerState = {
  spent: {},
};

const pendingPaymentHashes = new Set<`0x${string}`>();

export async function verifyExecutionPayment(
  config: PrimeBotConfig,
  publicClient: PaymentPublicClient,
  input: {
    txHash: `0x${string}`;
    walletAddress: `0x${string}`;
  },
) {
  const normalizedTxHash = input.txHash.toLowerCase() as `0x${string}`;
  const normalizedWalletAddress = input.walletAddress.toLowerCase() as `0x${string}`;
  const normalizedTreasuryAddress = config.treasuryAddress.toLowerCase() as `0x${string}`;

  if (pendingPaymentHashes.has(normalizedTxHash)) {
    throw new AppError(409, "payment_in_use", "This payment transaction is already being processed.");
  }

  const ledger = await readLedger(config.paymentLedgerPath);
  if (ledger.spent[normalizedTxHash]) {
    throw new AppError(409, "payment_already_used", "This payment transaction has already been used.");
  }

  pendingPaymentHashes.add(normalizedTxHash);

  try {
    let transaction;
    let receipt;

    try {
      [transaction, receipt] = await Promise.all([
        publicClient.getTransaction({ hash: normalizedTxHash }),
        publicClient.getTransactionReceipt({ hash: normalizedTxHash }),
      ]);
    } catch (error) {
      throw new AppError(402, "payment_tx_not_found", "PrimeBot could not verify the submitted payment transaction.", {
        txHash: normalizedTxHash,
        cause: error instanceof Error ? error.message : "Unknown transaction lookup failure",
      });
    }

    const transactionTo = transaction.to?.toLowerCase() as `0x${string}` | undefined;
    const transactionFrom = transaction.from.toLowerCase() as `0x${string}`;

    if (receipt.status !== "success") {
      throw new AppError(402, "payment_not_settled", "Payment transaction has not succeeded onchain.", {
        txHash: normalizedTxHash,
      });
    }

    if (transactionFrom !== normalizedWalletAddress) {
      throw new AppError(402, "payment_sender_mismatch", "Payment transaction was not sent from the connected wallet.", {
        expected: input.walletAddress,
        actual: transaction.from,
      });
    }

    if (!transactionTo || transactionTo !== normalizedTreasuryAddress) {
      throw new AppError(402, "payment_recipient_mismatch", "Payment transaction was not sent to the PrimeBot treasury.", {
        expected: config.treasuryAddress,
        actual: transaction.to,
      });
    }

    if (transaction.value < config.executionFeeWei) {
      throw new AppError(402, "payment_value_too_low", "Payment transaction value is below the required execution fee.", {
        requiredWei: config.executionFeeWei.toString(),
        actualWei: transaction.value.toString(),
      });
    }

    ledger.spent[normalizedTxHash] = {
      txHash: normalizedTxHash,
      walletAddress: normalizedWalletAddress,
      consumedAt: new Date().toISOString(),
    };
    await writeLedger(config.paymentLedgerPath, ledger);

    return {
      txHash: normalizedTxHash,
      from: transaction.from,
      to: transaction.to,
      value: transaction.value.toString(),
    };
  } finally {
    pendingPaymentHashes.delete(normalizedTxHash);
  }
}

async function readLedger(ledgerPath: string) {
  const absolutePath = path.resolve(ledgerPath);

  try {
    const raw = await readFile(absolutePath, "utf8");
    const parsed = JSON.parse(raw) as PaymentLedgerState;

    return {
      spent: parsed.spent ?? {},
    } satisfies PaymentLedgerState;
  } catch (error) {
    if (isFileMissing(error)) {
      return {
        ...EMPTY_LEDGER,
      };
    }

    throw new AppError(500, "payment_ledger_unreadable", "PrimeBot could not read the payment ledger.", {
      path: absolutePath,
      cause: error instanceof Error ? error.message : "Unknown file read error",
    });
  }
}

async function writeLedger(ledgerPath: string, ledger: PaymentLedgerState) {
  const absolutePath = path.resolve(ledgerPath);
  const directoryPath = path.dirname(absolutePath);
  const tempPath = `${absolutePath}.tmp`;

  await mkdir(directoryPath, { recursive: true });
  await writeFile(tempPath, JSON.stringify(ledger, null, 2));
  await rename(tempPath, absolutePath);
}

function isFileMissing(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "ENOENT"
  );
}
