"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { generatePrivateKey } from "viem/accounts";
import { createYellowSession, executeYellowTransfer } from "../server/session";

type Props = {
  userId: string;
  hasActiveSession: boolean;
  walletAddress: string;
};

export function YellowPanel({ userId, hasActiveSession, walletAddress }: Props) {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [allowance, setAllowance] = useState("10");

  const [destination, setDestination] = useState("");
  const [transferAmount, setTransferAmount] = useState("");

  async function handleStartSession() {
    setLoading(true);
    setError(null);

    try {
      setStatus("Creating session...");
      const sessionPrivateKey = generatePrivateKey();

      const result = await createYellowSession({
        userId,
        sessionPrivateKey,
        walletAddress,
        allowance,
      });

      if (!result.success) {
        throw new Error(result.error || "Session creation failed");
      }

      setStatus("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start session");
      setStatus("");
    } finally {
      setLoading(false);
    }
  }

  async function handleTransfer() {
    if (!destination || !transferAmount) {
      setError("Enter destination address and amount");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await executeYellowTransfer(userId, destination, transferAmount);

      if (!result.success) {
        throw new Error(result.error || "Transfer failed");
      }

      setDestination("");
      setTransferAmount("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Transfer failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 w-full">
      <h3 className="text-sm font-semibold text-zinc-500">Yellow Network</h3>

      {error && <p className="text-sm text-red-500">{error}</p>}
      {status && <p className="text-sm text-zinc-500">{status}</p>}

      {hasActiveSession ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-green-600">Session active</p>
          <input
            type="text"
            placeholder="Destination address (0x...)"
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm font-mono"
            disabled={loading}
          />
          <input
            type="text"
            placeholder="Amount (USDC)"
            value={transferAmount}
            onChange={(e) => setTransferAmount(e.target.value)}
            className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm"
            disabled={loading}
          />
          <button
            onClick={handleTransfer}
            disabled={loading || !destination || !transferAmount}
            className="px-6 py-3 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2 items-center">
            <input
              type="text"
              placeholder="Allowance (USDC)"
              value={allowance}
              onChange={(e) => setAllowance(e.target.value)}
              className="px-4 py-3 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm flex-1"
              disabled={loading}
            />
            <span className="text-xs text-zinc-500">USDC</span>
          </div>
          <button
            onClick={handleStartSession}
            disabled={loading || !allowance}
            className="px-6 py-3 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium disabled:opacity-50"
          >
            {loading ? status || "Starting..." : "Start Session"}
          </button>
        </div>
      )}
    </div>
  );
}
