import { useState } from "react";
import { motion } from "framer-motion";

import TransactionHistory, { type HistoryTransaction } from "@/components/TransactionHistory";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const HELPER_CONFIG = [
  {
    id: "swap-to-usdc",
    label: "Swap USDC",
    title: "Build a USDC swap",
    description: "Create a direct prompt to swap any supported token into USDC.",
  },
  {
    id: "swap-from-eth",
    label: "Swap ETH",
    title: "Build an ETH-funded swap",
    description: "Create a prompt that swaps ETH into another supported token.",
  },
  {
    id: "send",
    label: "Send",
    title: "Build a transfer intent",
    description: "Create a send prompt for one wallet or many wallets at once.",
  },
  {
    id: "bridge",
    label: "Bridge",
    title: "Build a bridge intent",
    description: "Create a bridge prompt from Base Sepolia into another supported testnet.",
  },
] as const;

type HelperKind = (typeof HELPER_CONFIG)[number]["id"] | null;

type HelperDraft = {
  amount: string;
  tokenIn: string;
  tokenOut: string;
  recipients: string;
  destinationChain: string;
  recipient: string;
};

interface IntentInputProps {
  onSubmit: (intent: string, type: string) => void;
  transactions: HistoryTransaction[];
}

const EMPTY_DRAFT: HelperDraft = {
  amount: "",
  tokenIn: "ETH",
  tokenOut: "USDC",
  recipients: "",
  destinationChain: "Sepolia",
  recipient: "",
};

const IntentInput = ({ onSubmit, transactions }: IntentInputProps) => {
  const [intent, setIntent] = useState("");
  const [activeHelper, setActiveHelper] = useState<HelperKind>(null);
  const [helperDraft, setHelperDraft] = useState<HelperDraft>(EMPTY_DRAFT);

  const helperDefinition = HELPER_CONFIG.find((helper) => helper.id === activeHelper) ?? null;
  const helperPreview = activeHelper ? buildHelperPrompt(activeHelper, helperDraft) : "";

  const openHelper = (helper: Exclude<HelperKind, null>) => {
    setActiveHelper(helper);

    setHelperDraft({
      amount: "",
      tokenIn: "ETH",
      tokenOut: "USDC",
      recipients: "",
      destinationChain: "Sepolia",
      recipient: "",
    });
  };

  const applyHelperPrompt = () => {
    if (!activeHelper) {
      return;
    }

    const prompt = buildHelperPrompt(activeHelper, helperDraft);
    if (!prompt) {
      return;
    }

    setIntent(prompt);
    setActiveHelper(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-6 py-16">
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative"
      >
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-primary/3 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 space-y-6">
          <div className="space-y-3">
            <label className="block text-xs font-mono text-muted-foreground uppercase tracking-widest">
              Describe your intent
            </label>

            <div className="flex flex-wrap gap-2">
              {HELPER_CONFIG.map((helper) => (
                <button
                  key={helper.id}
                  type="button"
                  onClick={() => openHelper(helper.id)}
                  className="rounded-xl border border-border bg-card/70 px-4 py-2 text-xs font-mono text-muted-foreground transition-colors hover:border-primary/30 hover:bg-card hover:text-foreground"
                >
                  {helper.label}
                </button>
              ))}
            </div>
          </div>

          <textarea
            value={intent}
            onChange={(event) => setIntent(event.target.value)}
            placeholder="Swap 0.5 ETH for USDC on Base..."
            className="w-full h-32 bg-card border border-border rounded-md px-4 py-3 font-mono text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-all"
          />

          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground">
            <div className="w-3 h-3 rounded-full bg-accent/20 border border-accent/40 flex items-center justify-center">
              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
            </div>
            Base Sepolia
          </div>

          <div className="border-t border-border" />

          <div className="flex items-center justify-between">
            <div className="text-xs font-mono text-muted-foreground">
              Inference fee: <span className="text-foreground">$0.04</span>
              <span className="text-muted-foreground/60"> | Secured by x402</span>
            </div>
            <Button
              variant="hero"
              onClick={() => onSubmit(intent, inferIntentType(intent))}
              disabled={!intent.trim()}
              className="px-6"
            >
              Pay to Think
            </Button>
          </div>
        </div>
      </motion.section>

      <TransactionHistory transactions={transactions} />

      <Dialog open={activeHelper !== null} onOpenChange={(open) => !open && setActiveHelper(null)}>
        <DialogContent className="border-border bg-card sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl text-foreground">
              {helperDefinition?.title ?? "Build a prompt"}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-muted-foreground">
              {helperDefinition?.description ?? "Fill the fields and PrimeBot will compose the prompt for you."}
            </DialogDescription>
          </DialogHeader>

          {activeHelper === "swap-to-usdc" && (
            <div className="space-y-4">
              <Field label="Amount">
                <Input
                  value={helperDraft.amount}
                  onChange={(event) => setHelperDraft((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.1"
                />
              </Field>
              <Field label="Token in">
                <Input
                  value={helperDraft.tokenIn}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, tokenIn: event.target.value.toUpperCase() }))
                  }
                  placeholder="ETH"
                />
              </Field>
            </div>
          )}

          {activeHelper === "swap-from-eth" && (
            <div className="space-y-4">
              <Field label="Amount">
                <Input
                  value={helperDraft.amount}
                  onChange={(event) => setHelperDraft((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.1"
                />
              </Field>
              <Field label="Token out">
                <Input
                  value={helperDraft.tokenOut}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, tokenOut: event.target.value.toUpperCase() }))
                  }
                  placeholder="USDC"
                />
              </Field>
            </div>
          )}

          {activeHelper === "send" && (
            <div className="space-y-4">
              <Field label="Amount">
                <Input
                  value={helperDraft.amount}
                  onChange={(event) => setHelperDraft((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.0001"
                />
              </Field>
              <Field label="Token">
                <Input
                  value={helperDraft.tokenIn}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, tokenIn: event.target.value.toUpperCase() }))
                  }
                  placeholder="ETH"
                />
              </Field>
              <Field label="Recipients">
                <Input
                  value={helperDraft.recipients}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, recipients: event.target.value }))
                  }
                  placeholder="0xabc..., 0xdef..."
                />
              </Field>
            </div>
          )}

          {activeHelper === "bridge" && (
            <div className="space-y-4">
              <Field label="Amount">
                <Input
                  value={helperDraft.amount}
                  onChange={(event) => setHelperDraft((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0.002"
                />
              </Field>
              <Field label="Token">
                <Input
                  value={helperDraft.tokenIn}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, tokenIn: event.target.value.toUpperCase() }))
                  }
                  placeholder="ETH"
                />
              </Field>
              <Field label="Destination chain">
                <Input
                  value={helperDraft.destinationChain}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, destinationChain: event.target.value }))
                  }
                  placeholder="Sepolia"
                />
              </Field>
              <Field label="Recipient (optional)">
                <Input
                  value={helperDraft.recipient}
                  onChange={(event) =>
                    setHelperDraft((current) => ({ ...current, recipient: event.target.value.trim() }))
                  }
                  placeholder="0xabc..."
                />
              </Field>
            </div>
          )}

          <div className="rounded-md border border-border bg-background/70 px-3 py-3">
            <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">
              Prompt preview
            </p>
            <p className="font-mono text-sm text-foreground">
              {helperPreview || "Complete the fields to generate a valid intent."}
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setActiveHelper(null)}>
              Cancel
            </Button>
            <Button variant="hero" onClick={applyHelperPrompt} disabled={!helperPreview}>
              Use Prompt
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-xs font-mono uppercase tracking-[0.18em] text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function buildHelperPrompt(helper: Exclude<HelperKind, null>, draft: HelperDraft) {
  const amount = draft.amount.trim();

  if (!amount) {
    return "";
  }

  if (helper === "swap-to-usdc") {
    const tokenIn = draft.tokenIn.trim().toUpperCase();
    return tokenIn ? `swap ${amount} ${tokenIn} to USDC` : "";
  }

  if (helper === "swap-from-eth") {
    const tokenOut = draft.tokenOut.trim().toUpperCase();
    return tokenOut ? `swap ${amount} ETH to ${tokenOut}` : "";
  }

  if (helper === "bridge") {
    const token = draft.tokenIn.trim().toUpperCase();
    const destinationChain = draft.destinationChain.trim();
    const recipient = draft.recipient.trim();

    if (!token || !destinationChain) {
      return "";
    }

    return recipient
      ? `bridge ${amount} ${token} to ${destinationChain} for ${recipient}`
      : `bridge ${amount} ${token} to ${destinationChain}`;
  }

  const token = draft.tokenIn.trim().toUpperCase();
  const recipients = draft.recipients
    .split(",")
    .map((recipient) => recipient.trim())
    .filter(Boolean)
    .join(", ");

  if (!token || !recipients) {
    return "";
  }

  return `send ${amount} ${token} to ${recipients}`;
}

function inferIntentType(intent: string) {
  const normalized = intent.trim().toLowerCase();

  if (normalized.startsWith("send ") || normalized.startsWith("transfer ")) {
    return "Send";
  }

  if (normalized.startsWith("bridge ")) {
    return "Bridge";
  }

  return "Swap";
}

export default IntentInput;
