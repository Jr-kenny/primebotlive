import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const REASONING_LINES = [
  "→ Parsing intent...",
  "→ Resolving token addresses on Base Sepolia...",
  "→ Fetching on-chain context...",
  "→ Querying liquidity pools...",
  "→ Running risk model...",
  "→ Checking slippage tolerance...",
  "→ Validating against current liquidity...",
  "→ Cross-referencing price feeds...",
  "→ Computing optimal execution path...",
  "→ Finalizing risk assessment...",
];

interface ThinkingStateProps {
  onComplete: (result: "safe" | "caution" | "blocked") => void;
}

const ThinkingState = ({ onComplete }: ThinkingStateProps) => {
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const lineInterval = setInterval(() => {
      setVisibleLines((prev) => {
        if (prev >= REASONING_LINES.length) {
          clearInterval(lineInterval);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(progressInterval);
          return 100;
        }
        return prev + 1.5;
      });
    }, 80);

    const completeTimeout = setTimeout(() => {
      onComplete("safe");
    }, 7000);

    return () => {
      clearInterval(lineInterval);
      clearInterval(progressInterval);
      clearTimeout(completeTimeout);
    };
  }, [onComplete]);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto px-6 py-16 relative"
    >
      {/* Darkened ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/3 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 space-y-8">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-primary" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </div>
          <span className="text-xs font-mono uppercase tracking-widest text-primary">
            Agent Reasoning
          </span>
        </div>

        {/* Progress bar */}
        <div className="h-px bg-border relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: `${Math.min(progress, 100)}%` }}
            transition={{ duration: 0.1 }}
          />
        </div>

        {/* Reasoning trace */}
        <div className="bg-card/50 border border-border rounded-md p-5 min-h-[280px] font-mono text-sm space-y-1">
          <AnimatePresence>
            {REASONING_LINES.slice(0, visibleLines).map((line, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3 }}
                className={`${
                  i === visibleLines - 1 ? "text-primary" : "text-muted-foreground/70"
                }`}
              >
                {line}
                {i === visibleLines - 1 && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="ml-1"
                  >
                    █
                  </motion.span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="text-xs font-mono text-muted-foreground text-center">
          {Math.min(Math.round(progress), 100)}% · Inference in progress
        </div>
      </div>
    </motion.section>
  );
};

export default ThinkingState;
