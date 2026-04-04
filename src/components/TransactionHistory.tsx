import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle2, AlertTriangle, XOctagon, ExternalLink, X } from "lucide-react";

interface Transaction {
  id: string;
  intent: string;
  type: string;
  status: "safe" | "caution" | "blocked";
  txHash?: string;
  timestamp: string;
  fee: string;
}

const MOCK_TRANSACTIONS: Transaction[] = [
  { id: "1", intent: "Swap 0.5 ETH for USDC", type: "Swap", status: "safe", txHash: "0x8a4f...c3e1", timestamp: "2 min ago", fee: "$0.04" },
  { id: "2", intent: "Add liquidity to WETH/USDC pool", type: "LP", status: "caution", txHash: "0x3b2c...d7f9", timestamp: "18 min ago", fee: "$0.04" },
  { id: "3", intent: "Bridge 100 USDC to Optimism", type: "Bridge", status: "blocked", timestamp: "1 hr ago", fee: "$0.04" },
  { id: "4", intent: "Stake ETH in Aave v3 on Base", type: "Yield", status: "safe", txHash: "0x91ae...b402", timestamp: "3 hr ago", fee: "$0.04" },
  { id: "5", intent: "Swap 200 USDC for DAI", type: "Swap", status: "safe", txHash: "0x55cd...a1b3", timestamp: "5 hr ago", fee: "$0.04" },
  { id: "6", intent: "Provide WBTC/ETH liquidity", type: "LP", status: "caution", txHash: "0x12ef...9d44", timestamp: "8 hr ago", fee: "$0.04" },
  { id: "7", intent: "Yield farm on Compound Base", type: "Yield", status: "safe", txHash: "0xab01...fe72", timestamp: "12 hr ago", fee: "$0.04" },
  { id: "8", intent: "Bridge 500 USDT to Arbitrum", type: "Bridge", status: "blocked", timestamp: "1 day ago", fee: "$0.04" },
  { id: "9", intent: "Swap 1 ETH for WBTC", type: "Swap", status: "safe", txHash: "0x77fa...3c90", timestamp: "1 day ago", fee: "$0.04" },
  { id: "10", intent: "Stake USDC in Morpho vault", type: "Yield", status: "safe", txHash: "0xde34...8b11", timestamp: "2 days ago", fee: "$0.04" },
  { id: "11", intent: "Add ETH/USDC concentrated LP", type: "LP", status: "caution", txHash: "0x44bc...e5a2", timestamp: "3 days ago", fee: "$0.04" },
  { id: "12", intent: "Swap 0.1 ETH for LINK", type: "Swap", status: "safe", txHash: "0x99f1...7d03", timestamp: "4 days ago", fee: "$0.04" },
];

const STATUS_CONFIG = {
  safe: { icon: CheckCircle2, label: "Safe", className: "text-safe" },
  caution: { icon: AlertTriangle, label: "Caution", className: "text-caution" },
  blocked: { icon: XOctagon, label: "Blocked", className: "text-destructive" },
};

const TxRow = ({ tx, index }: { tx: Transaction; index: number }) => {
  const config = STATUS_CONFIG[tx.status];
  const Icon = config.icon;

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
          <span className="text-xs font-mono text-muted-foreground">{tx.timestamp}</span>
        </div>
      </div>
      {tx.txHash && (
        <a href="#" className="flex items-center gap-1 text-xs font-mono text-primary hover:text-primary/80 transition-colors shrink-0">
          {tx.txHash}
          <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </motion.div>
  );
};

const TransactionHistory = () => {
  const [showAll, setShowAll] = useState(false);
  const preview = MOCK_TRANSACTIONS.slice(0, 5);

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

        <div className="space-y-2">
          {preview.map((tx, i) => (
            <TxRow key={tx.id} tx={tx} index={i} />
          ))}
        </div>

        {MOCK_TRANSACTIONS.length > 5 && (
          <button
            onClick={() => setShowAll(true)}
            className="mt-4 w-full py-2.5 text-xs font-mono text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-card/50 transition-colors"
          >
            See all {MOCK_TRANSACTIONS.length} transactions →
          </button>
        )}
      </motion.section>

      {/* Floating overlay panel */}
      <AnimatePresence>
        {showAll && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setShowAll(false)}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
            />

            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.3, ease: "easeOut" }}
              className="fixed inset-x-4 top-[10%] bottom-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full md:max-w-2xl z-50 flex flex-col rounded-lg border border-border bg-card shadow-2xl overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
                <div>
                  <h3 className="font-serif text-lg text-foreground">Transaction History</h3>
                  <p className="text-xs font-mono text-muted-foreground">{MOCK_TRANSACTIONS.length} decisions</p>
                </div>
                <button
                  onClick={() => setShowAll(false)}
                  className="p-2 rounded-md hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Scrollable list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {MOCK_TRANSACTIONS.map((tx, i) => (
                  <TxRow key={tx.id} tx={tx} index={i} />
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};

export default TransactionHistory;
