import { motion } from "framer-motion";
import { CheckCircle2, AlertTriangle, XOctagon, ExternalLink } from "lucide-react";

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
  {
    id: "1",
    intent: "Swap 0.5 ETH for USDC",
    type: "Swap",
    status: "safe",
    txHash: "0x8a4f...c3e1",
    timestamp: "2 min ago",
    fee: "$0.04",
  },
  {
    id: "2",
    intent: "Add liquidity to WETH/USDC pool",
    type: "LP",
    status: "caution",
    txHash: "0x3b2c...d7f9",
    timestamp: "18 min ago",
    fee: "$0.04",
  },
  {
    id: "3",
    intent: "Bridge 100 USDC to Optimism",
    type: "Bridge",
    status: "blocked",
    timestamp: "1 hr ago",
    fee: "$0.04",
  },
  {
    id: "4",
    intent: "Stake ETH in Aave v3 on Base",
    type: "Yield",
    status: "safe",
    txHash: "0x91ae...b402",
    timestamp: "3 hr ago",
    fee: "$0.04",
  },
];

const STATUS_CONFIG = {
  safe: { icon: CheckCircle2, label: "Safe", className: "text-safe" },
  caution: { icon: AlertTriangle, label: "Caution", className: "text-caution" },
  blocked: { icon: XOctagon, label: "Blocked", className: "text-destructive" },
};

const TransactionHistory = () => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 py-16"
    >
      <h2 className="font-serif text-2xl text-foreground mb-1">History</h2>
      <p className="text-xs font-mono text-muted-foreground mb-6">Recent agent decisions</p>

      <div className="space-y-2">
        {MOCK_TRANSACTIONS.map((tx, i) => {
          const config = STATUS_CONFIG[tx.status];
          const Icon = config.icon;

          return (
            <motion.div
              key={tx.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
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
                <a
                  href="#"
                  className="flex items-center gap-1 text-xs font-mono text-primary hover:text-primary/80 transition-colors shrink-0"
                >
                  {tx.txHash}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </motion.div>
          );
        })}
      </div>
    </motion.section>
  );
};

export default TransactionHistory;
