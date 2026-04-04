import { useState, useCallback } from "react";
import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import IntentInput from "@/components/IntentInput";
import ThinkingState from "@/components/ThinkingState";
import ValidationResult from "@/components/ValidationResult";
import ExecutionConfirmation from "@/components/ExecutionConfirmation";
import Footer from "@/components/Footer";

type AppState = "hero" | "input" | "thinking" | "result" | "executed";

const Index = () => {
  const [state, setState] = useState<AppState>("hero");
  const [validationStatus, setValidationStatus] = useState<"safe" | "caution" | "blocked">("safe");

  const handleStartSession = () => setState("input");

  const handleSubmitIntent = () => setState("thinking");

  const handleThinkingComplete = useCallback((result: "safe" | "caution" | "blocked") => {
    setValidationStatus(result);
    setState("result");
  }, []);

  const handleExecute = () => setState("executed");

  const handleReevaluate = () => setState("input");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        {state === "hero" && <Hero onStartSession={handleStartSession} />}
        {state === "input" && <IntentInput onSubmit={handleSubmitIntent} />}
        {state === "thinking" && <ThinkingState onComplete={handleThinkingComplete} />}
        {state === "result" && (
          <ValidationResult
            status={validationStatus}
            onExecute={handleExecute}
            onReevaluate={handleReevaluate}
          />
        )}
        {state === "executed" && <ExecutionConfirmation />}
      </main>
      <Footer />
    </div>
  );
};

export default Index;
