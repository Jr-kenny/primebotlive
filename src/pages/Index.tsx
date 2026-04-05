import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { useAccount, useSwitchChain, useWalletClient } from "wagmi";
import { baseSepolia } from "viem/chains";

import ExecutionConfirmation from "@/components/ExecutionConfirmation";
import Footer from "@/components/Footer";
import Hero from "@/components/Hero";
import IntentInput from "@/components/IntentInput";
import Navbar from "@/components/Navbar";
import ThinkingState from "@/components/ThinkingState";
import { type HistoryTransaction } from "@/components/TransactionHistory";
import ValidationResult from "@/components/ValidationResult";
import {
  analyzeIntent,
  executeIntent,
  type AnalyzeIntentResponse,
  type ExecuteIntentResponse,
  type RoutePreference,
  type ValidationStatus,
  toValidationStatus,
  PrimeBotApiError,
} from "@/lib/primebot-api";

type AppState = "hero" | "input" | "thinking" | "result" | "executed";

const STATE_BACK_MAP: Record<AppState, AppState | null> = {
  hero: null,
  input: "hero",
  thinking: null,
  result: "input",
  executed: "hero",
};

const HISTORY_STORAGE_KEY = "primebot-history";

const Index = () => {
  const [state, setState] = useState<AppState>("hero");
  const [validationStatus, setValidationStatus] = useState<ValidationStatus>("safe");
  const [currentPrompt, setCurrentPrompt] = useState("");
  const [currentType, setCurrentType] = useState("Swap");
  const [analysisResult, setAnalysisResult] = useState<AnalyzeIntentResponse | null>(null);
  const [executionResult, setExecutionResult] = useState<ExecuteIntentResponse | null>(null);
  const [routePreference, setRoutePreference] = useState<RoutePreference>("balanced");
  const [isExecuting, setIsExecuting] = useState(false);
  const [isRefreshingRoute, setIsRefreshingRoute] = useState(false);
  const [history, setHistory] = useState<HistoryTransaction[]>([]);
  const { address, chainId, isConnected } = useAccount();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

  useEffect(() => {
    try {
      const rawHistory = window.localStorage.getItem(HISTORY_STORAGE_KEY);
      if (!rawHistory) {
        return;
      }

      const parsed = JSON.parse(rawHistory) as HistoryTransaction[];
      setHistory(parsed);
    } catch {
      window.localStorage.removeItem(HISTORY_STORAGE_KEY);
    }
  }, []);

  const persistHistory = useCallback((nextHistory: HistoryTransaction[]) => {
    setHistory(nextHistory);
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(nextHistory));
  }, []);

  const handleStartSession = () => setState("input");

  const handleSubmitIntent = useCallback(async (intent: string, type: string) => {
    setCurrentPrompt(intent);
    setCurrentType(type);
    setRoutePreference("balanced");
    setExecutionResult(null);
    setState("thinking");

    try {
      const nextAnalysis = await analyzeIntent(intent, "balanced");
      setAnalysisResult(nextAnalysis);
      setValidationStatus(toValidationStatus(nextAnalysis.analysis.risk));
      setState("result");
    } catch (error) {
      setState("input");
      toast.error(toUserMessage(error, "PrimeBot could not analyze this intent."));
    }
  }, []);

  const handleExecute = useCallback(async () => {
    if (!currentPrompt) {
      return;
    }

    if (!isConnected || !address || !walletClient) {
      toast.error("Connect a wallet with Reown before executing.");
      return;
    }

    setIsExecuting(true);

    try {
      if (chainId !== baseSepolia.id) {
        await switchChainAsync({ chainId: baseSepolia.id });
      }

      const result = await executeIntent(currentPrompt, {
        account: address,
        walletClient,
        routePreference,
      });
      setExecutionResult(result);
      setState("executed");

      const txHashes = result.txHashes ?? (result.txHash ? [result.txHash] : []);
      const nextHistory: HistoryTransaction[] = [
        {
          id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          intent: currentPrompt,
          type: currentType,
          status: toValidationStatus(result.analysis.risk),
          txHashes,
          timestamp: new Date().toISOString(),
          fee: "$0.04",
        },
        ...history,
      ];

      persistHistory(nextHistory.slice(0, 50));
    } catch (error) {
      toast.error(toUserMessage(error, "PrimeBot could not execute this intent."));
    } finally {
      setIsExecuting(false);
    }
  }, [address, chainId, currentPrompt, currentType, history, isConnected, persistHistory, routePreference, switchChainAsync, walletClient]);

  const handleReevaluate = useCallback(() => {
    setState("input");
  }, []);

  const handleRoutePreferenceChange = useCallback(async (nextPreference: RoutePreference) => {
    if (!currentPrompt || !analysisResult || analysisResult.intent.action !== "swap" || nextPreference === routePreference) {
      return;
    }

    setIsRefreshingRoute(true);

    try {
      const nextAnalysis = await analyzeIntent(currentPrompt, nextPreference);
      setAnalysisResult(nextAnalysis);
      setValidationStatus(toValidationStatus(nextAnalysis.analysis.risk));
      setRoutePreference(nextPreference);
    } catch (error) {
      toast.error(toUserMessage(error, "PrimeBot could not refresh the route choice."));
    } finally {
      setIsRefreshingRoute(false);
    }
  }, [analysisResult, currentPrompt, routePreference]);

  const backTarget = STATE_BACK_MAP[state];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar showBack={!!backTarget} onBack={backTarget ? () => setState(backTarget) : undefined} />
      <main className="flex-1 pt-16">
        {state === "hero" && <Hero onStartSession={handleStartSession} />}
        {state === "input" && <IntentInput onSubmit={handleSubmitIntent} transactions={history} />}
        {state === "thinking" && <ThinkingState />}
        {state === "result" && (
          <ValidationResult
            status={validationStatus}
            analysis={analysisResult?.analysis ?? null}
            routing={analysisResult?.routing}
            routePreference={routePreference}
            onSelectRoutePreference={handleRoutePreferenceChange}
            onExecute={handleExecute}
            onReevaluate={handleReevaluate}
            isExecuting={isExecuting || isRefreshingRoute}
          />
        )}
        {state === "executed" && (
          <ExecutionConfirmation prompt={currentPrompt} result={executionResult} />
        )}
      </main>
      <Footer />
    </div>
  );
};

function toUserMessage(error: unknown, fallback: string) {
  if (error instanceof PrimeBotApiError) {
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

export default Index;
