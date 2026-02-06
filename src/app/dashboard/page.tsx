"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import { UsdcAmount } from "@/components/usdc-amount";
import { TaskCard } from "@/components/task-card";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/modules/shared/components/ui/button";
import { Input } from "@/modules/shared/components/ui/input";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { Separator } from "@/modules/shared/components/ui/separator";
import { truncAddr } from "@/lib/format";
import { Wallet, ArrowUpRight, Key } from "lucide-react";
import type { Task } from "@/hooks/use-user";

type TabKey = "created" | "working" | "completed";

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, getToken } = useAuth();
  const { user, loading, error, refetch } = useUser();

  const [tab, setTab] = useState<TabKey>("created");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawAddr, setWithdrawAddr] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);

  useEffect(() => {
    if (ready && !authenticated) {
      router.push("/");
    }
  }, [ready, authenticated, router]);

  const handleWithdraw = useCallback(async () => {
    if (!withdrawAmount || !withdrawAddr) return;
    setWithdrawing(true);
    setWithdrawError(null);
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
      await refetch();
    } catch (err) {
      setWithdrawError(
        err instanceof Error ? err.message : "Withdraw failed",
      );
    } finally {
      setWithdrawing(false);
    }
  }, [withdrawAmount, withdrawAddr, getToken, refetch]);

  if (!ready || !authenticated) {
    return null;
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10">
        <Skeleton className="mb-6 h-8 w-40" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="mx-auto max-w-[720px] px-6 py-10 text-center">
        <p className="text-sm text-destructive">{error || "Failed to load"}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={refetch}>
          Retry
        </Button>
      </div>
    );
  }

  const createdTasks = user.tasks.filter(
    (t) => t.creatorId === user.user_id,
  );
  const workingTasks = user.tasks.filter(
    (t) =>
      t.acceptorId === user.user_id &&
      !["completed", "cancelled"].includes(t.status),
  );
  const completedTasks = user.tasks.filter((t) =>
    ["completed", "cancelled"].includes(t.status),
  );

  const tabTasks: Record<TabKey, Task[]> = {
    created: createdTasks,
    working: workingTasks,
    completed: completedTasks,
  };

  const activeTasks = user.tasks.filter(
    (t) => !["completed", "cancelled"].includes(t.status),
  ).length;
  const completedCount = user.tasks.filter(
    (t) => t.status === "completed",
  ).length;

  return (
    <div className="mx-auto max-w-[720px] px-6 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>

      {/* Balance card */}
      <div className="mt-6 rounded-md border border-border bg-card p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              Total Balance
            </p>
            <UsdcAmount
              amount={(
                parseFloat(user.balance) + parseFloat(user.yellow_balance)
              ).toString()}
              size="lg"
            />
          </div>
          <Wallet className="size-5 text-muted-foreground" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Wallet
            </p>
            <p className="text-sm font-semibold tabular-nums">
              ${parseFloat(user.balance).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Yellow Balance
            </p>
            <p className="text-sm font-semibold tabular-nums">
              ${parseFloat(user.yellow_balance).toFixed(2)}
            </p>
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs font-mono text-muted-foreground">
            {truncAddr(user.wallet_address)}
          </span>
          <CopyButton text={user.wallet_address} />
        </div>
      </div>

      {/* Withdraw section */}
      <div className="mt-4 rounded-md border border-border bg-card p-5">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
          Withdraw
        </p>
        <div className="flex gap-2">
          <Input
            type="number"
            step="0.01"
            min="0"
            placeholder="Amount (USDC)"
            value={withdrawAmount}
            onChange={(e) => setWithdrawAmount(e.target.value)}
            className="flex-1"
          />
          <Button
            size="sm"
            variant="outline"
            onClick={handleWithdraw}
            disabled={withdrawing || !withdrawAmount || !withdrawAddr}
          >
            <ArrowUpRight className="size-3.5" />
            {withdrawing ? "..." : "Withdraw"}
          </Button>
        </div>
        <Input
          type="text"
          placeholder="Destination address (0x...)"
          value={withdrawAddr}
          onChange={(e) => setWithdrawAddr(e.target.value)}
          className="mt-2 font-mono text-xs"
        />
        {!withdrawAddr && (
          <button
            onClick={() => setWithdrawAddr(user.wallet_address)}
            className="mt-1 text-xs text-muted-foreground hover:text-foreground"
          >
            Use my wallet ({truncAddr(user.wallet_address)})
          </button>
        )}
        {withdrawError && (
          <p className="mt-2 text-xs text-destructive">{withdrawError}</p>
        )}
      </div>

      {/* Quick stats */}
      <div className="mt-6 grid grid-cols-4 gap-3">
        <StatCard label="Active" value={activeTasks} />
        <StatCard label="Completed" value={completedCount} />
        <StatCard label="Total" value={user.tasks.length} />
        <StatCard
          label="Tasks"
          value={createdTasks.length}
          sublabel="created"
        />
      </div>

      <Separator className="my-8" />

      {/* Task tabs */}
      <div className="flex gap-1 border-b border-border">
        {(
          [
            { key: "created", label: "Created" },
            { key: "working", label: "Working On" },
            { key: "completed", label: "Completed" },
          ] as { key: TabKey; label: string }[]
        ).map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2 text-sm transition-colors ${
              tab === t.key
                ? "border-b-2 border-foreground font-medium"
                : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {tabTasks[tab].length > 0 ? (
          tabTasks[tab].map((task) => (
            <TaskCard
              key={task.id}
              id={task.id}
              description={task.description}
              amount={task.amount}
              status={task.status}
              createdAt={task.createdAt}
              creatorWallet={task.creatorWallet}
            />
          ))
        ) : (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No tasks here yet.
          </p>
        )}
      </div>

      <Separator className="my-8" />

      {/* API Key section */}
      <div>
        <button
          onClick={() => setShowApiKey(!showApiKey)}
          className="flex items-center gap-2 text-sm font-medium"
        >
          <Key className="size-4" />
          API & MCP Access
        </button>
        {showApiKey && (
          <div className="mt-3 rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              API Key
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded bg-muted px-2 py-1 text-xs font-mono">
                {user.api_key}
              </code>
              <CopyButton text={user.api_key} />
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Use this key to create tasks programmatically or connect an AI
              agent via MCP.
            </p>
            <p className="mt-1 text-xs text-muted-foreground font-mono">
              Header: X-API-Key: {truncAddr(user.api_key)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sublabel,
}: {
  label: string;
  value: number;
  sublabel?: string;
}) {
  return (
    <div className="rounded-md border border-border bg-card p-3 text-center">
      <p className="text-lg font-semibold tabular-nums">{value}</p>
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      {sublabel && (
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}
