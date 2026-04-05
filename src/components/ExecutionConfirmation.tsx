import { motion } from "framer-motion";
import { CheckCircle2, ExternalLink } from "lucide-react";

import type { ExecuteIntentResponse } from "@/lib/primebot-api";

interface ExecutionConfirmationProps {
  prompt: string;
  result: ExecuteIntentResponse | null;
}

const ExecutionConfirmation = ({ prompt, result }: ExecutionConfirmationProps) => {
  const hashes = result?.txHashes ?? (result?.txHash ? [result.txHash] : []);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 py-16"
    >
      <div className="border border-safe/20 rounded-md bg-safe/5 p-6 space-y-6">
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

        <div className="space-y-3 text-sm font-mono">
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Intent</span>
            <span className="text-foreground text-right">{prompt}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Route</span>
            <span className="text-foreground text-right">{readableRouteLabel(result?.analysis.route)}</span>
          </div>
          <div className="flex justify-between gap-6">
            <span className="text-muted-foreground">Expected</span>
            <span className="text-foreground text-right">{result?.analysis.expectedOut ?? "n/a"}</span>
          </div>

          <div className="border-t border-border pt-3 space-y-3">
            {hashes.map((hash, index) => (
              <div key={hash} className="flex justify-between items-center gap-6">
                <span className="text-muted-foreground">
                  {hashes.length === 1 ? "Tx Hash" : `Tx Hash ${index + 1}`}
                </span>
                <a
                  href={`https://sepolia.basescan.org/tx/${hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 text-primary hover:text-primary/80 transition-colors"
                >
                  {shortenHash(hash)}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
};

function shortenHash(hash: string) {
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function readableRouteLabel(route?: string) {
  if (!route) {
    return "n/a";
  }

  if (route === "across_bridge") {
    return "Across bridge";
  }

  return route;
}

export default ExecutionConfirmation;
