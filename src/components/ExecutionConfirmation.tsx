import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink } from "lucide-react";

const MOCK_TX = {
  hash: "0x8a4f...c3e1",
  fullHash: "0x8a4f2b6c9d1e3f5a7b8c0d2e4f6a8b0c2d4e6f8a4f2b6c9d1e3f5a7bc3e1",
  from: "0x742d...35Cc",
  to: "0xDef1...C0DE",
  amount: "0.5 ETH → 1,247.83 USDC",
  gas: "0.0004 ETH",
};

const ExecutionConfirmation = () => {
  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 py-16"
    >
      <div className="border border-safe/20 rounded-md bg-safe/5 p-6 space-y-6">
        {/* Success header */}
        <div className="flex items-center gap-3">
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, delay: 0.2 }}
          >
            <CheckCircle2 className="w-5 h-5 text-safe" />
          </motion.div>
          <span className="text-sm font-mono uppercase tracking-widest text-safe">
            Transaction Submitted
          </span>
        </div>

        {/* Details */}
        <div className="space-y-3 text-sm font-mono">
          {[
            ["From", MOCK_TX.from],
            ["To", MOCK_TX.to],
            ["Amount", MOCK_TX.amount],
            ["Gas", MOCK_TX.gas],
          ].map(([label, value]) => (
            <div key={label} className="flex justify-between">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-foreground">{value}</span>
            </div>
          ))}

          <div className="border-t border-border pt-3 flex justify-between items-center">
            <span className="text-muted-foreground">Tx Hash</span>
            <a
              href={`https://sepolia.basescan.org/tx/${MOCK_TX.fullHash}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
            >
              {MOCK_TX.hash}
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </div>
    </motion.section>
  );
};

export default ExecutionConfirmation;
