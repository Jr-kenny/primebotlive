import { useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";

const INTENT_TYPES = ["Swap", "LP", "Yield", "Bridge"] as const;

interface IntentInputProps {
  onSubmit: (intent: string, type: string) => void;
}

const IntentInput = ({ onSubmit }: IntentInputProps) => {
  const [intent, setIntent] = useState("");
  const [selectedType, setSelectedType] = useState<string>("Swap");

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="w-full max-w-2xl mx-auto px-6 py-16 relative"
    >
      {/* Radial glow behind input */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

      <div className="relative z-10 space-y-6">
        <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest mb-2">
          Describe your intent
        </label>

        <textarea
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          placeholder="Swap 0.5 ETH for USDC on Base..."
          className="w-full h-32 bg-card border border-border rounded-md px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
        />

        {/* Intent type pills */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground mr-2">Type</span>
          {INTENT_TYPES.map((type) => (
            <button
              key={type}
              onClick={() => setSelectedType(type)}
              className={`px-3 py-1.5 rounded-md text-xs font-mono transition-all border ${
                selectedType === type
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-secondary border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Chain indicator */}
        <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
          <div className="w-3 h-3 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-accent" />
          </div>
          Base Sepolia
        </div>

        {/* Divider */}
        <div className="border-t border-border" />

        {/* Submit */}
        <div className="flex items-center justify-between">
          <div className="text-xs font-mono text-muted-foreground">
            Inference fee: <span className="text-foreground">$0.04</span>
            <span className="text-muted-foreground/60"> · Secured by x402</span>
          </div>
          <Button
            variant="hero"
            onClick={() => onSubmit(intent, selectedType)}
            disabled={!intent.trim()}
            className="px-6"
          >
            Pay to Think
          </Button>
        </div>
      </div>
    </motion.section>
  );
};

export default IntentInput;
