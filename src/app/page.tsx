"use client";

import { useCallback, useEffect, useState } from "react";
import { usePrivy, useWallets } from "@privy-io/react-auth";
import { createWalletClient, custom } from "viem";
import { sepolia, base } from "viem/chains";
import { wrapFetchWithPayment } from "@x402/fetch";
import { x402Client } from "@x402/fetch";
import { ExactEvmScheme } from "@x402/evm";

const NETWORK_MODE = process.env.NEXT_PUBLIC_NETWORK_MODE || "testnet";
const chain = NETWORK_MODE === "production" ? base : sepolia;
const x402Network = NETWORK_MODE === "production" ? "eip155:8453" : "eip155:11155111";

type Task = {
  id: string;
  amount: string;
  status: string;
  description: string | null;
  creatorId: string;
  acceptorId: string | null;
  appSessionId: string | null;
  evidenceNotes: string | null;
  disputeReason: string | null;
  resolution: string | null;
  createdAt: string;
  acceptedAt: string | null;
  submittedAt: string | null;
  completedAt: string | null;
  creatorWallet: string | null;
  acceptorWallet: string | null;
};

type UserData = {
  user_id: string;
  wallet_address: string;
  privy_wallet_id: string | null;
  balance: string;
  yellow_balance: string;
  api_key: string;
  is_new: boolean;
  tasks: Task[];
};

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 shrink-0"
      title="Copy"
    >
      {copied ? (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
      )}
    </button>
  );
}

function truncAddr(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function formatTime(ts: string | null) {
  if (!ts) return null;
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  in_progress: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400",
  submitted: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  disputed: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
  completed: "bg-green-500/10 text-green-600 dark:text-green-400",
  cancelled: "bg-zinc-500/10 text-zinc-500",
};

export default function Home() {
  const { ready, authenticated, login, logout, getAccessToken } = usePrivy();
  const { wallets } = useWallets();
  const [user, setUser] = useState<UserData | null>(null);
  const [openTasks, setOpenTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tab, setTab] = useState<"my" | "open" | "all">("my");

  // Create task form
  const [createAmount, setCreateAmount] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [creating, setCreating] = useState(false);

  // Withdraw form
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);

  const getToken = useCallback(async () => {
    return await getAccessToken();
  }, [getAccessToken]);

  const fetchUser = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to load user");
      }
      setUser(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }, [getToken]);

  const fetchOpenTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks?status=open");
      if (res.ok) {
        const data = await res.json();
        setOpenTasks(data.tasks || []);
      }
    } catch {
      // ignore
    }
  }, []);

  const fetchAllTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/tasks");
      if (res.ok) {
        const data = await res.json();
        setAllTasks(data.tasks || []);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    if (authenticated) {
      fetchUser();
      fetchOpenTasks();
    } else {
      setUser(null);
      setOpenTasks([]);
      setAllTasks([]);
    }
  }, [authenticated, fetchUser, fetchOpenTasks]);

  const refreshAll = useCallback(async () => {
    await Promise.all([fetchUser(), fetchOpenTasks(), fetchAllTasks()]);
  }, [fetchUser, fetchOpenTasks, fetchAllTasks]);

  const doAction = useCallback(
    async (taskId: string, action: string, body?: object) => {
      setActionLoading(`${taskId}-${action}`);
      setError(null);
      try {
        const token = await getToken();
        const res = await fetch(`/api/tasks/${taskId}/${action}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `${action} failed`);
        }
        await refreshAll();
      } catch (err) {
        setError(err instanceof Error ? err.message : `${action} failed`);
      } finally {
        setActionLoading(null);
      }
    },
    [getToken, refreshAll],
  );

  const handleCreateTask = async () => {
    if (!createAmount || parseFloat(createAmount) <= 0) return;
    setCreating(true);
    setError(null);
    try {
      if (NETWORK_MODE === "testnet") {
        // Testnet: simple authenticated request — server handles everything
        // using the user's Privy server wallet and Yellow faucet balance.
        const token = await getToken();
        const res = await fetch(`/api/tasks?amount=${encodeURIComponent(createAmount)}`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            description: createDesc || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create task");
        }
      } else {
        // Production: x402 payment flow — user's browser wallet signs the payment
        const wallet = wallets[0];
        if (!wallet) throw new Error("No wallet connected");

        await wallet.switchChain(chain.id);
        const provider = await wallet.getEthereumProvider();

        const walletClient = createWalletClient({
          account: wallet.address as `0x${string}`,
          chain,
          transport: custom(provider),
        });

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

        const res = await fetchWithPay(`/api/tasks?amount=${encodeURIComponent(createAmount)}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            description: createDesc || undefined,
          }),
        });
        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to create task");
        }
      }

      setCreateAmount("");
      setCreateDesc("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    } finally {
      setCreating(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || !withdrawAddr) return;
    setWithdrawing(true);
    setError(null);
    try {
      const token = await getToken();
      const res = await fetch("/api/users/withdraw", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: withdrawAmount,
          destination_address: withdrawAddr,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Withdraw failed");
      }
      setWithdrawAmount("");
      setWithdrawAddr("");
      await refreshAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Withdraw failed");
    } finally {
      setWithdrawing(false);
    }
  };

  const handleAccept = (taskId: string) => doAction(taskId, "accept");
  const handleCancel = (taskId: string) => doAction(taskId, "cancel");
  const handleSubmit = (taskId: string) => {
    const notes = prompt("Evidence notes:");
    if (notes !== null) doAction(taskId, "submit", { notes });
  };
  const handleApprove = (taskId: string) => doAction(taskId, "approve");
  const handleDispute = (taskId: string) => {
    const reason = prompt("Dispute reason:");
    if (reason) doAction(taskId, "dispute", { reason });
  };

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-sm text-zinc-500">Loading...</p>
      </div>
    );
  }

  function renderTaskActions(task: Task) {
    if (!user) return null;
    const isCreator = task.creatorId === user.user_id;
    const isAcceptor = task.acceptorId === user.user_id;
    const isLoading = (action: string) => actionLoading === `${task.id}-${action}`;

    return (
      <div className="flex gap-2 mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
        {task.status === "open" && !isCreator && (
          <button
            onClick={() => handleAccept(task.id)}
            disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
          >
            {isLoading("accept") ? "..." : "Accept"}
          </button>
        )}
        {task.status === "open" && isCreator && (
          <button
            onClick={() => handleCancel(task.id)}
            disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-zinc-600 text-white disabled:opacity-50 hover:bg-zinc-700"
          >
            {isLoading("cancel") ? "..." : "Cancel"}
          </button>
        )}
        {task.status === "in_progress" && isAcceptor && (
          <button
            onClick={() => handleSubmit(task.id)}
            disabled={!!actionLoading}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-purple-600 text-white disabled:opacity-50 hover:bg-purple-700"
          >
            {isLoading("submit") ? "..." : "Submit Work"}
          </button>
        )}
        {task.status === "submitted" && isCreator && (
          <>
            <button
              onClick={() => handleApprove(task.id)}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white disabled:opacity-50 hover:bg-green-700"
            >
              {isLoading("approve") ? "..." : "Approve"}
            </button>
            <button
              onClick={() => handleDispute(task.id)}
              disabled={!!actionLoading}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white disabled:opacity-50 hover:bg-red-700"
            >
              {isLoading("dispute") ? "..." : "Dispute"}
            </button>
          </>
        )}
      </div>
    );
  }

  function getEscrowStatus(task: Task) {
    const hasSession = !!task.appSessionId;
    switch (task.status) {
      case "open":
        return hasSession
          ? { label: "Escrowed (creator + platform)", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" }
          : { label: "No session", color: "text-zinc-400", bg: "bg-zinc-100 dark:bg-zinc-800" };
      case "in_progress":
        return { label: "Escrowed (creator + worker + platform)", color: "text-yellow-600 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-900/20" };
      case "submitted":
        return { label: "Escrowed, pending review", color: "text-purple-600 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-900/20" };
      case "disputed":
        return { label: "Escrowed, under dispute", color: "text-orange-600 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-900/20" };
      case "completed":
        return {
          label: task.resolution === "acceptor_wins" ? "Released to worker" : "Returned to creator",
          color: "text-green-600 dark:text-green-400",
          bg: "bg-green-50 dark:bg-green-900/20",
        };
      case "cancelled":
        return { label: "Session closed, funds returned", color: "text-zinc-400", bg: "bg-zinc-100 dark:bg-zinc-800" };
      default:
        return { label: "Unknown", color: "text-zinc-400", bg: "bg-zinc-100 dark:bg-zinc-800" };
    }
  }

  function renderTask(task: Task) {
    const isCreator = user && task.creatorId === user.user_id;
    const isAcceptor = user && task.acceptorId === user.user_id;
    const escrow = getEscrowStatus(task);
    const amount = parseFloat(task.amount).toFixed(2);

    // Build timeline events
    const timeline: { label: string; time: string | null; color: string }[] = [
      { label: "Created", time: task.createdAt, color: "bg-blue-500" },
    ];
    if (task.acceptedAt) timeline.push({ label: "Accepted", time: task.acceptedAt, color: "bg-yellow-500" });
    if (task.submittedAt) timeline.push({ label: "Submitted", time: task.submittedAt, color: "bg-purple-500" });
    if (task.status === "disputed") timeline.push({ label: "Disputed", time: task.completedAt, color: "bg-orange-500" });
    if (task.completedAt && task.status === "completed") timeline.push({ label: "Completed", time: task.completedAt, color: "bg-green-500" });
    if (task.status === "cancelled") timeline.push({ label: "Cancelled", time: task.completedAt, color: "bg-zinc-400" });

    return (
      <div
        key={task.id}
        className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-zinc-400">{task.id.slice(0, 8)}</span>
            <span className={`text-[10px] font-semibold uppercase px-2 py-0.5 rounded-full ${STATUS_COLORS[task.status] || "text-zinc-500"}`}>
              {task.status.replace("_", " ")}
            </span>
          </div>
          <div className="text-right">
            <span className="text-lg font-bold">${amount}</span>
            <span className="text-xs text-zinc-400 ml-1">USDC</span>
          </div>
        </div>

        <div className="p-4 space-y-3">
          {/* Description */}
          {task.description && (
            <p className="text-sm text-zinc-600 dark:text-zinc-300">{task.description}</p>
          )}

          {/* Escrow / Yellow Status */}
          <div className={`flex items-center justify-between p-2.5 rounded-md ${escrow.bg}`}>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-0.5">Yellow Escrow</p>
              <p className={`text-xs font-medium ${escrow.color}`}>{escrow.label}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold">${amount}</p>
              {task.appSessionId && (
                <p className="text-[10px] font-mono text-zinc-400 mt-0.5">
                  session: {task.appSessionId.slice(0, 10)}...
                </p>
              )}
            </div>
          </div>

          {/* Participants */}
          <div className="grid grid-cols-2 gap-2">
            <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-900/50">
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">Creator</p>
              {task.creatorWallet ? (
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-mono ${isCreator ? "text-blue-500 font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}>
                    {truncAddr(task.creatorWallet)}
                  </span>
                  {isCreator && <span className="text-[10px] text-blue-400">(you)</span>}
                </div>
              ) : (
                <span className="text-xs text-zinc-400">-</span>
              )}
            </div>
            <div className="p-2.5 rounded-md bg-zinc-50 dark:bg-zinc-900/50">
              <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">Worker</p>
              {task.acceptorWallet ? (
                <div className="flex items-center gap-1">
                  <span className={`text-xs font-mono ${isAcceptor ? "text-blue-500 font-semibold" : "text-zinc-600 dark:text-zinc-300"}`}>
                    {truncAddr(task.acceptorWallet)}
                  </span>
                  {isAcceptor && <span className="text-[10px] text-blue-400">(you)</span>}
                </div>
              ) : (
                <span className="text-xs text-zinc-400 italic">Awaiting worker</span>
              )}
            </div>
          </div>

          {/* Evidence / Dispute / Resolution */}
          {task.evidenceNotes && (
            <div className="p-2.5 rounded-md bg-purple-50 dark:bg-purple-900/20">
              <p className="text-[10px] uppercase tracking-wide text-purple-500 mb-1">Evidence Submitted</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{task.evidenceNotes}</p>
            </div>
          )}
          {task.disputeReason && (
            <div className="p-2.5 rounded-md bg-red-50 dark:bg-red-900/20">
              <p className="text-[10px] uppercase tracking-wide text-red-500 mb-1">Dispute Reason</p>
              <p className="text-xs text-zinc-600 dark:text-zinc-300">{task.disputeReason}</p>
            </div>
          )}
          {task.resolution && (
            <div className="p-2.5 rounded-md bg-green-50 dark:bg-green-900/20">
              <p className="text-[10px] uppercase tracking-wide text-green-500 mb-1">Resolution</p>
              <p className="text-xs font-medium text-green-600 dark:text-green-400">
                {task.resolution === "acceptor_wins" ? "Worker wins — funds released" : "Creator wins — funds returned"}
              </p>
            </div>
          )}

          {/* Timeline */}
          <div className="flex items-center gap-0 mt-1">
            {timeline.map((event, i) => (
              <div key={event.label} className="flex items-center">
                {i > 0 && <div className="w-6 h-px bg-zinc-300 dark:bg-zinc-700" />}
                <div className="flex flex-col items-center">
                  <div className={`w-2 h-2 rounded-full ${event.color}`} />
                  <span className="text-[9px] text-zinc-400 mt-0.5 whitespace-nowrap">{event.label}</span>
                  {event.time && (
                    <span className="text-[8px] text-zinc-400">{formatTime(event.time)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Actions */}
          {renderTaskActions(task)}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 dark:bg-black">
      <main className="flex flex-col gap-6 p-6 w-full max-w-xl">
        <h1 className="text-2xl font-semibold text-center">Just</h1>

        {!authenticated ? (
          <div className="flex flex-col items-center gap-4 py-12">
            <p className="text-sm text-zinc-500">Task marketplace with Yellow Network escrow</p>
            <button
              onClick={login}
              className="px-6 py-3 rounded-lg bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-sm font-medium hover:opacity-90"
            >
              Log In
            </button>
          </div>
        ) : loading ? (
          <p className="text-sm text-zinc-500 text-center py-8">Loading user...</p>
        ) : error && !user ? (
          <div className="flex flex-col gap-3 items-center py-8">
            <p className="text-sm text-red-500">{error}</p>
            <button
              onClick={() => { setError(null); fetchUser(); }}
              className="text-sm text-zinc-500 hover:text-zinc-700"
            >
              Retry
            </button>
          </div>
        ) : user ? (
          <div className="flex flex-col gap-6 w-full">
            {/* User Info Card */}
            <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-mono text-zinc-600 dark:text-zinc-300">
                    {truncAddr(user.wallet_address)}
                  </span>
                  <CopyButton text={user.wallet_address} />
                </div>
                <button
                  onClick={logout}
                  className="text-xs text-zinc-400 hover:text-zinc-600"
                >
                  Log Out
                </button>
              </div>
              <div className="grid grid-cols-4 gap-3">
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">Wallet USDC</p>
                  <p className="text-lg font-semibold">${parseFloat(user.balance).toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">Yellow Balance</p>
                  <p className="text-lg font-semibold">${parseFloat(user.yellow_balance).toFixed(2)}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">Tasks</p>
                  <p className="text-lg font-semibold">{user.tasks.length}</p>
                </div>
                <div className="text-center">
                  <p className="text-[10px] uppercase tracking-wide text-zinc-400 mb-1">API Key</p>
                  <div className="flex items-center justify-center gap-1">
                    <p className="text-xs font-mono truncate max-w-[80px]">{user.api_key}</p>
                    <CopyButton text={user.api_key} />
                  </div>
                </div>
              </div>
            </div>

            {/* Create Task */}
            <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold mb-3">Create Task</h2>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount (USDC)"
                    value={createAmount}
                    onChange={(e) => setCreateAmount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
                  />
                  <button
                    onClick={handleCreateTask}
                    disabled={creating || !createAmount}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-blue-600 text-white disabled:opacity-50 hover:bg-blue-700"
                  >
                    {creating ? "..." : "Create"}
                  </button>
                </div>
                <textarea
                  placeholder="Description (optional)"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  rows={2}
                  className="px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent resize-none"
                />
              </div>
            </div>

            {/* Withdraw */}
            <div className="p-4 rounded-lg border border-zinc-200 dark:border-zinc-800">
              <h2 className="text-sm font-semibold mb-3">Withdraw to USDC</h2>
              <div className="flex flex-col gap-2">
                <div className="flex gap-2">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="Amount (USDC)"
                    value={withdrawAmount}
                    onChange={(e) => setWithdrawAmount(e.target.value)}
                    className="flex-1 px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent"
                  />
                  <button
                    onClick={handleWithdraw}
                    disabled={withdrawing || !withdrawAmount || !withdrawAddr}
                    className="px-4 py-2 text-sm font-medium rounded-md bg-orange-600 text-white disabled:opacity-50 hover:bg-orange-700"
                  >
                    {withdrawing ? "..." : "Withdraw"}
                  </button>
                </div>
                <input
                  type="text"
                  placeholder="Destination address (0x...)"
                  value={withdrawAddr}
                  onChange={(e) => setWithdrawAddr(e.target.value)}
                  className="px-3 py-2 text-sm rounded-md border border-zinc-300 dark:border-zinc-700 bg-transparent font-mono text-xs"
                />
                {user && !withdrawAddr && (
                  <button
                    onClick={() => setWithdrawAddr(user.wallet_address)}
                    className="text-xs text-blue-500 hover:text-blue-600 text-left"
                  >
                    Use my wallet ({truncAddr(user.wallet_address)})
                  </button>
                )}
              </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-zinc-200 dark:border-zinc-800">
              {(["my", "open", "all"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => {
                    setTab(t);
                    if (t === "open") fetchOpenTasks();
                    if (t === "all") fetchAllTasks();
                  }}
                  className={`px-4 py-2 text-sm ${
                    tab === t
                      ? "border-b-2 border-zinc-900 dark:border-white font-medium"
                      : "text-zinc-500"
                  }`}
                >
                  {t === "my" ? "My Tasks" : t === "open" ? "Open Tasks" : "All Tasks"}
                </button>
              ))}
            </div>

            {/* Task list */}
            <div className="flex flex-col gap-3">
              {tab === "my" ? (
                user.tasks.length > 0 ? (
                  user.tasks.map(renderTask)
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-6">
                    No tasks yet. Create one above.
                  </p>
                )
              ) : tab === "open" ? (
                openTasks.length > 0 ? (
                  openTasks.map(renderTask)
                ) : (
                  <p className="text-sm text-zinc-500 text-center py-6">
                    No open tasks available.
                  </p>
                )
              ) : allTasks.length > 0 ? (
                allTasks.map(renderTask)
              ) : (
                <p className="text-sm text-zinc-500 text-center py-6">
                  No tasks in the system.
                </p>
              )}
            </div>

            {/* Error toast */}
            {error && (
              <div className="fixed bottom-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-lg bg-red-600 text-white text-sm shadow-lg">
                {error}
                <button onClick={() => setError(null)} className="ml-3 opacity-70 hover:opacity-100">x</button>
              </div>
            )}
          </div>
        ) : null}
      </main>
    </div>
  );
}
