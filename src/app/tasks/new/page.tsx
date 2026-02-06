"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { UsdcAmount } from "@/components/usdc-amount";
import { TagPill } from "@/components/tag-pill";
import { Button } from "@/modules/shared/components/ui/button";
import { Separator } from "@/modules/shared/components/ui/separator";
import { wrapFetchWithPayment, x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";

const QUICK_AMOUNTS = ["1", "5", "10", "25"];
const DEADLINE_OPTIONS = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
];

const NETWORK_MODE = process.env.NEXT_PUBLIC_NETWORK_MODE || "testnet";
const x402Network =
  NETWORK_MODE === "production" ? "eip155:8453" : "eip155:11155111";

export default function CreateTaskPage() {
  const router = useRouter();
  const { authenticated, login, getToken, getWalletClient, wallets } =
    useAuth();

  const [description, setDescription] = useState("");
  const [amount, setAmount] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [hasDeadline, setHasDeadline] = useState(false);
  const [deadlineHours, setDeadlineHours] = useState<number | null>(null);
  const [multiWorker, setMultiWorker] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountNum = parseFloat(amount) || 0;

  const handleCreate = async () => {
    if (!amount || amountNum <= 0 || !description.trim()) return;
    setCreating(true);
    setError(null);

    try {
      const body = JSON.stringify({
        description: description.trim(),
        tags: tags.length > 0 ? tags : undefined,
        deadline_hours: hasDeadline && deadlineHours ? deadlineHours : undefined,
        competition_mode: multiWorker,
      });

      if (NETWORK_MODE === "testnet") {
        const token = await getToken();
        const res = await fetch(
          `/api/tasks?amount=${encodeURIComponent(amount)}`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${token}`,
              "Content-Type": "application/json",
            },
            body,
          },
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create task");
        }
        const data = await res.json();
        router.push(`/tasks/${data.task_id}`);
      } else {
        const wallet = wallets[0];
        if (!wallet) throw new Error("No wallet connected");
        const walletClient = await getWalletClient();
        const signer = {
          address: wallet.address as `0x${string}`,
          signTypedData: (message: {
            domain: Record<string, unknown>;
            types: Record<string, unknown>;
            primaryType: string;
            message: Record<string, unknown>;
          }) =>
            walletClient.signTypedData({
              account: wallet.address as `0x${string}`,
              ...message,
            } as never),
        };
        const client = new x402Client();
        client.register(x402Network, new ExactEvmScheme(signer));
        const fetchWithPay = wrapFetchWithPayment(fetch, client);
        const res = await fetchWithPay(
          `/api/tasks?amount=${encodeURIComponent(amount)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body,
          },
        );
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create task");
        }
        const data = await res.json();
        router.push(`/tasks/${data.task_id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  if (!authenticated) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-6">
        <p className="mb-4 text-sm text-muted-foreground">
          Log in to create a task.
        </p>
        <Button onClick={login}>Log In</Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[560px] px-6 py-10">
      <Link
        href="/tasks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to tasks
      </Link>

      <h1 className="text-2xl font-semibold tracking-tight">Post a Task</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Describe what you need a human to do.
      </p>

      {/* Section 1: Description */}
      <div className="mt-8">
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          What do you need?
        </label>
        <div className="mt-2 overflow-hidden rounded-md bg-zinc-900">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what you need a human to do..."
            rows={4}
            className="w-full resize-none bg-transparent px-4 py-3 text-sm text-white placeholder:text-zinc-500 outline-none"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Be specific. Include location, timing, and what counts as proof.
        </p>
        <div className="mt-3">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tags (up to 3)
          </label>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {tags.map((tag) => (
              <TagPill
                key={tag}
                tag={tag}
                removable
                onRemove={() => setTags(tags.filter((t) => t !== tag))}
              />
            ))}
            {tags.length < 3 && (
              <input
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    (e.key === "Enter" || e.key === ",") &&
                    tagInput.trim()
                  ) {
                    e.preventDefault();
                    const newTag = tagInput.trim().toLowerCase();
                    if (!tags.includes(newTag)) {
                      setTags([...tags, newTag]);
                    }
                    setTagInput("");
                  }
                }}
                placeholder={tags.length === 0 ? "e.g. research, nyc, urgent" : "Add tag..."}
                className="rounded-full border border-border bg-background px-3 py-1 text-xs outline-none placeholder:text-muted-foreground focus:border-foreground/30"
              />
            )}
          </div>
        </div>
      </div>

      <Separator className="my-8" />

      {/* Section 2: Reward */}
      <div>
        <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
          Reward
        </label>
        <div className="mt-3 flex items-center justify-center">
          <span className="text-4xl font-bold text-muted-foreground/40">$</span>
          <input
            type="number"
            step="0.01"
            min="0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-40 bg-transparent text-center text-4xl font-bold tabular-nums outline-none placeholder:text-muted-foreground/30"
          />
          <span className="text-sm text-muted-foreground ml-1">USDC</span>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2">
          {QUICK_AMOUNTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => setAmount(q)}
              className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                amount === q
                  ? "border-foreground bg-foreground text-background"
                  : "border-border text-muted-foreground hover:border-foreground/30"
              }`}
            >
              ${q}
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-xs text-muted-foreground">
          This amount will be held in escrow until the task is complete.
        </p>
      </div>

      <Separator className="my-8" />

      {/* Section 3: Deadline */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Deadline
          </label>
          <button
            type="button"
            onClick={() => {
              setHasDeadline(!hasDeadline);
              if (hasDeadline) setDeadlineHours(null);
            }}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              hasDeadline ? "bg-foreground" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                hasDeadline ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>
        {hasDeadline && (
          <div className="mt-3 flex flex-wrap gap-2">
            {DEADLINE_OPTIONS.map((opt) => (
              <button
                key={opt.hours}
                type="button"
                onClick={() => setDeadlineHours(opt.hours)}
                className={`rounded-md border px-3 py-1 text-xs font-medium transition-colors ${
                  deadlineHours === opt.hours
                    ? "border-foreground bg-foreground text-background"
                    : "border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <Separator className="my-8" />

      {/* Section 4: Competition settings */}
      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Allow multiple submissions
          </label>
          <button
            type="button"
            onClick={() => setMultiWorker(!multiWorker)}
            className={`relative h-5 w-9 rounded-full transition-colors ${
              multiWorker ? "bg-foreground" : "bg-border"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                multiWorker ? "translate-x-4" : ""
              }`}
            />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          {multiWorker
            ? "Multiple workers can submit. You pick the best one."
            : "First worker to accept gets the exclusive job."}
        </p>
      </div>

      <Separator className="my-8" />

      {/* Section 5: Review & Post */}
      {amountNum > 0 && description.trim() && (
        <div className="rounded-md border border-border bg-card p-4 mb-4">
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
            Summary
          </p>
          <p className="text-sm line-clamp-2 mb-2">{description}</p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <UsdcAmount amount={amount} size="sm" />
            {tags.length > 0 && <span>{tags.join(", ")}</span>}
            {hasDeadline && deadlineHours && <span>{deadlineHours}h deadline</span>}
            <span>{multiWorker ? "Multi-worker" : "Single-worker"}</span>
          </div>
        </div>
      )}

      <Button
        className="w-full"
        size="lg"
        onClick={handleCreate}
        disabled={creating || amountNum <= 0 || !description.trim()}
      >
        {creating
          ? "Creating..."
          : `Post Task — $${amountNum.toFixed(2)} USDC`}
      </Button>
      <p className="mt-2 text-center text-xs text-muted-foreground">
        You&rsquo;ll be charged ${amountNum.toFixed(2)} USDC from your Yellow
        balance.
      </p>

      {error && (
        <div className="mt-4 rounded-md border border-destructive/20 bg-destructive/5 p-3">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
    </div>
  );
}
