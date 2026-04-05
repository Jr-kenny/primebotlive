import { motion } from "framer-motion";
import { AlertTriangle, CheckCircle2, Loader2, XOctagon } from "lucide-react";

import { Button } from "@/components/ui/button";
import type {
  RoutePreference,
  SwapRoutingSummary,
  TradeAnalysis,
  ValidationStatus,
} from "@/lib/primebot-api";

interface ValidationResultProps {
  status: ValidationStatus;
  analysis: TradeAnalysis | null;
  routing?: SwapRoutingSummary;
  routePreference: RoutePreference;
  onSelectRoutePreference: (preference: RoutePreference) => void;
  onExecute: () => void;
  onReevaluate: () => void;
  isExecuting?: boolean;
}

const RESULTS: Record<
  ValidationStatus,
  {
    icon: typeof CheckCircle2;
    label: string;
    borderClass: string;
    iconClass: string;
    labelClass: string;
    bgClass: string;
  }
> = {
  safe: {
    icon: CheckCircle2,
    label: "SAFE TO EXECUTE",
    borderClass: "border-safe/30",
    iconClass: "text-safe",
    labelClass: "text-safe",
    bgClass: "bg-safe/5",
  },
  caution: {
    icon: AlertTriangle,
    label: "PROCEED WITH CAUTION",
    borderClass: "border-caution/30",
    iconClass: "text-caution",
    labelClass: "text-caution",
    bgClass: "bg-caution/5",
  },
  blocked: {
    icon: XOctagon,
    label: "BLOCKED",
    borderClass: "border-destructive/30",
    iconClass: "text-destructive",
    labelClass: "text-destructive",
    bgClass: "bg-destructive/5",
  },
};

const ValidationResult = ({
  status,
  analysis,
  routing,
  routePreference,
  onSelectRoutePreference,
  onExecute,
  onReevaluate,
  isExecuting = false,
}: ValidationResultProps) => {
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
        <div className="flex items-center gap-3">
          <Icon className={`w-5 h-5 ${result.iconClass}`} />
          <span className={`text-sm font-mono uppercase tracking-widest ${result.labelClass}`}>
            {result.label}
          </span>
          {analysis && (
            <span className="ml-auto text-xs font-mono text-muted-foreground">
              Risk: {analysis.risk.toUpperCase()}
            </span>
          )}
        </div>

        {analysis && (
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-base text-foreground leading-relaxed">{analysis.reason}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <SummaryCard label="Expected outcome" value={analysis.expectedOut} />
                <SummaryCard label="Current route" value={readableRouteLabel(analysis.route)} />
              </div>
            </div>

            {routing && routing.options.length > 0 && (
              <div className="space-y-3 rounded-md border border-border bg-background/60 p-4">
                <div>
                  <p className="text-sm font-medium text-foreground">What matters most to you?</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    PrimeBot can re-rank the route before execution.
                  </p>
                </div>

                <div className="grid gap-2">
                  {routing.options.map((option) => (
                    <button
                      key={option.preference}
                      type="button"
                      onClick={() => onSelectRoutePreference(option.preference)}
                      disabled={isExecuting}
                      className={`rounded-md border px-4 py-3 text-left transition-colors ${
                        option.preference === routePreference
                          ? "border-primary/40 bg-primary/10"
                          : "border-border bg-card/50 hover:bg-card"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-medium text-foreground">{option.title}</span>
                        <span className="text-xs font-mono text-muted-foreground">{option.expectedOut}</span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{option.summary}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {!analysis && (
          <p className="text-sm text-muted-foreground">No analysis is available for this request.</p>
        )}

        <div className="flex items-center gap-3 pt-2">
          {status !== "blocked" && (
            <Button variant="execute" onClick={onExecute} className="px-6" disabled={isExecuting}>
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Updating...
                </>
              ) : (
                "Execute on Base Sepolia ->"
              )}
            </Button>
          )}
          <Button variant="muted" onClick={onReevaluate} disabled={isExecuting}>
            Re-evaluate
          </Button>
        </div>
      </div>
    </motion.section>
  );
};

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-background/70 px-4 py-3">
      <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm text-foreground">{value}</p>
    </div>
  );
}

function readableRouteLabel(route: string) {
  if (route === "uniswap_v3_direct") {
    return "Uniswap V3 direct route";
  }

  if (route === "uniswap_v3_multihop") {
    return "Uniswap V3 multihop route";
  }

  if (route === "uniswap_v2_direct") {
    return "Uniswap V2 direct route";
  }

  if (route === "uniswap_v2_multihop") {
    return "Uniswap V2 multihop route";
  }

  if (route === "lifi_aggregated") {
    return "LI.FI aggregated route";
  }

  if (route === "zeroex_aggregated") {
    return "0x aggregated route";
  }

  if (route === "across_bridge") {
    return "Across bridge";
  }

  return route;
}

export default ValidationResult;
