import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, ExternalLink, X, XOctagon } from "lucide-react";

import type { ValidationStatus } from "@/lib/primebot-api";

export interface HistoryTransaction {
  id: string;
  intent: string;
  type: string;
  status: ValidationStatus;
  txHashes: string[];
  timestamp: string;
  fee: string;
}

interface TransactionHistoryProps {
  transactions: HistoryTransaction[];
}

const STATUS_CONFIG = {
  safe: { icon: CheckCircle2, className: "text-safe" },
  caution: { icon: AlertTriangle, className: "text-caution" },
  blocked: { icon: XOctagon, className: "text-destructive" },
};

const TxRow = ({ tx, index }: { tx: HistoryTransaction; index: number }) => {
  const config = STATUS_CONFIG[tx.status];
  const Icon = config.icon;
  const primaryHash = tx.txHashes[0];

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex items-center gap-4 p-4 rounded-md border border-border bg-card/50 hover:bg-card transition-colors"
    >
      <Icon className={`w-4 h-4 shrink-0 ${config.className}`} />
      <div className="flex-1 min-w-0">
        <p className="text-sm text-foreground truncate">{tx.intent}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-xs font-mono text-muted-foreground">{tx.type}</span>
          <span className="text-border">·</span>
          <span className="text-xs font-mono text-muted-foreground">{tx.fee}</span>
          <span className="text-border">·</span>
          <span className="text-xs font-mono text-muted-foreground">{formatTimestamp(tx.timestamp)}</span>
        </div>
      </div>
      {primaryHash && (
        <a
          href={`https://sepolia.basescan.org/tx/${primaryHash}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-xs font-mono text-primary hover:text-primary/80 transition-colors shrink-0"
        >
          {shortenHash(primaryHash)}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </motion.div>
  );
};

const TransactionHistory = ({ transactions }: TransactionHistoryProps) => {
  const [showAll, setShowAll] = useState(false);
  const preview = transactions.slice(0, 5);

  return (
    <>
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-2xl mx-auto px-6 py-16"
      >
        <h2 className="font-serif text-2xl text-foreground mb-1">History</h2>
        <p className="text-xs font-mono text-muted-foreground mb-6">Recent agent decisions</p>

        {transactions.length === 0 ? (
          <div className="border border-border rounded-md bg-card/40 px-4 py-8 text-center text-sm font-mono text-muted-foreground">
            No live transactions yet.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {preview.map((tx, index) => (
                <TxRow key={tx.id} tx={tx} index={index} />
              ))}
            </div>

            {transactions.length > 5 && (
              <button
                onClick={() => setShowAll(true)}
                className="mt-4 w-full py-2.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-card/50 transition-colors"
              >
                See all {transactions.length} transactions {"->"}
              </button>
            )}
          </>
        )}
      </motion.section>

      <AnimatePresence>
        {showAll && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAll(false)}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            />

            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-x-4 top-[10%] bottom-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50 flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div>
                  <h3 className="font-serif text-lg text-foreground">Transaction History</h3>
                  <p className="text-xs font-mono text-muted-foreground">{transactions.length} decisions</p>
                </div>
                <button
                  onClick={() => setShowAll(false)}
                  className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {transactions.map((tx, index) => (
                  <TxRow key={tx.id} tx={tx} index={index} />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

function shortenHash(hash: string) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatTimestamp(value: string) {
  const timestamp = new Date(value).getTime();
  const diffMs = Date.now() - timestamp;
  const diffMinutes = Math.max(1, Math.floor(diffMs / 60_000));

  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day ago`;
}

export default TransactionHistory;
