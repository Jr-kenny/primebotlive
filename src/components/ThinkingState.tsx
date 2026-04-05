import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const REASONING_LINES = [
  "-> Parsing intent...",
  "-> Resolving assets on Base Sepolia...",
  "-> Reading current liquidity and balances...",
  "-> Validating routing constraints...",
  "-> Preparing risk assessment...",
  "-> Finalizing execution preview...",
];

const ThinkingState = () => {
  const [visibleLines, setVisibleLines] = useState(0);
  const [progress, setProgress] = useState(8);

  useEffect(() => {
    const lineInterval = window.setInterval(() => {
      setVisibleLines((previous) => (previous + 1) % (REASONING_LINES.length + 1));
    }, 700);

    const progressInterval = window.setInterval(() => {
      setProgress((previous) => (previous >= 92 ? 92 : previous + 3));
    }, 180);

    return () => {
      window.clearInterval(lineInterval);
      window.clearInterval(progressInterval);
    };
  }, []);

  const renderedLines =
    visibleLines === 0 ? REASONING_LINES.slice(0, 1) : REASONING_LINES.slice(0, visibleLines);

  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="w-full max-w-2xl mx-auto px-6 py-16 relative"
    >
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary/3 rounded-full blur-[140px]" />
      </div>

      <div className="relative z-10 space-y-8">
        <div className="flex items-center gap-3">
          <div className="relative flex h-3 w-3">
            <span className="animate-pulse-glow absolute inline-flex h-full w-full rounded-full bg-primary" />
            <span className="relative inline-flex rounded-full h-3 w-3 bg-primary" />
          </div>
          <span className="text-xs font-mono uppercase tracking-widest text-primary">
            Agent Reasoning
          </span>
        </div>

        <div className="h-px bg-border relative overflow-hidden">
          <motion.div
            className="absolute inset-y-0 left-0 bg-primary"
            initial={{ width: "8%" }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>

        <div className="bg-card/50 border border-border rounded-md p-5 min-h-[280px] font-mono text-sm space-y-1">
          <AnimatePresence mode="popLayout">
            {renderedLines.map((line, index) => (
              <motion.div
                key={`${line}-${index}`}
                initial={{ opacity: 0, x: -5 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25 }}
                className={index === renderedLines.length - 1 ? "text-primary" : "text-muted-foreground/70"}
              >
                {line}
                {index === renderedLines.length - 1 && (
                  <motion.span
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    className="ml-1"
                  >
                    |
                  </motion.span>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <div className="text-xs font-mono text-muted-foreground text-center">
          {Math.round(progress)}% · Inference in progress
        </div>
      </div>
    </motion.section>
  );
};

export default ThinkingState;
