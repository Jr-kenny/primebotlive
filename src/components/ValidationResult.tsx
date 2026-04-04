import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { CheckCircle2, AlertTriangle, XOctagon } from "lucide-react";

type ValidationStatus = "safe" | "caution" | "blocked";

interface ValidationResultProps {
  status: ValidationStatus;
  onExecute: () => void;
  onReevaluate: () => void;
}

const RESULTS: Record<ValidationStatus, {
  icon: typeof CheckCircle2;
  label: string;
  confidence: string;
  reasoning: string[];
  borderClass: string;
  iconClass: string;
  labelClass: string;
  bgClass: string;
}> = {
  safe: {
    icon: CheckCircle2,
    label: "SAFE TO EXECUTE",
    confidence: "97.3%",
    reasoning: [
      "Sufficient liquidity in WETH/USDC pool on Base Sepolia.",
      "Slippage within 0.3% tolerance. No sandwich risk detected.",
      "Gas estimate: 0.0004 ETH. Route optimized via single-hop.",
    ],
    borderClass: "border-safe/30",
    iconClass: "text-safe",
    labelClass: "text-safe",
    bgClass: "bg-safe/5",
  },
  caution: {
    icon: AlertTriangle,
    label: "PROCEED WITH CAUTION",
    confidence: "68.1%",
    reasoning: [
      "Low liquidity detected — potential slippage above 2%.",
      "Price impact may exceed acceptable threshold.",
      "Consider reducing position size or waiting for deeper liquidity.",
    ],
    borderClass: "border-caution/30",
    iconClass: "text-caution",
    labelClass: "text-caution",
    bgClass: "bg-caution/5",
  },
  blocked: {
    icon: XOctagon,
    label: "BLOCKED",
    confidence: "—",
    reasoning: [
      "Token contract flagged as honeypot on Base Sepolia.",
      "Execution blocked to protect funds.",
      "Do not interact with this contract.",
    ],
    borderClass: "border-destructive/30",
    iconClass: "text-destructive",
    labelClass: "text-destructive",
    bgClass: "bg-destructive/5",
  },
};

const ValidationResult = ({ status, onExecute, onReevaluate }: ValidationResultProps) => {
  const result = RESULTS[status];
  const Icon = result.icon;

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-2xl mx-auto px-6 py-16"
    >
      <div className={`border ${result.borderClass} rounded-md ${result.bgClass} p-6 space-y-6`}>
        {/* Header */}
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${result.iconClass}`} />
          <span className={`text-sm font-mono uppercase tracking-widest ${result.labelClass}`}>
            {result.label}
          </span>
          {result.confidence !== "—" && (
            <span className="ml-auto text-xs font-mono text-muted-foreground">
              Confidence: {result.confidence}
            </span>
          )}
        </div>

        {/* Reasoning */}
        <div className="space-y-1.5">
          {result.reasoning.map((line, i) => (
            <motion.p
              key={i}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2 + i * 0.15 }}
              className="text-sm font-mono text-muted-foreground"
            >
              {line}
            </motion.p>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3 pt-2">
          {status === "safe" && (
            <Button variant="execute" onClick={onExecute} className="px-6">
              Execute on Base Sepolia →
            </Button>
          )}
          <Button variant="muted" onClick={onReevaluate}>
            Re-evaluate
          </Button>
        </div>
      </div>
    </motion.section>
  );
};

export default ValidationResult;
