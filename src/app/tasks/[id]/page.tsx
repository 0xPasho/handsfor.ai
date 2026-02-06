"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/hooks/use-auth";
import { useUser } from "@/hooks/use-user";
import { useTasks } from "@/hooks/use-tasks";
import { UsdcAmount } from "@/components/usdc-amount";
import { StatusBadge } from "@/components/status-badge";
import { TagPill } from "@/components/tag-pill";
import { Timeline } from "@/components/timeline";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/modules/shared/components/ui/button";
import { Textarea } from "@/modules/shared/components/ui/textarea";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { Separator } from "@/modules/shared/components/ui/separator";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { truncAddr, formatTime } from "@/lib/format";
import { ArrowLeft, Shield, User, Clock, Check, X, MapPin } from "lucide-react";
import type { Task } from "@/hooks/use-user";

type Submission = {
  id: string;
  worker_id: string;
  worker_wallet: string;
  evidence_notes: string | null;
  submitted_at: string;
  is_winner: boolean;
};

type Application = {
  id: string;
  applicant_id: string;
  applicant_wallet: string;
  message: string | null;
  status: string;
  created_at: string;
  reviewed_at: string | null;
  applicant: {
    display_name: string | null;
    avatar_url: string | null;
    tags: string[];
    hourly_rate: string | null;
    bio: string | null;
    location: string | null;
  };
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const { authenticated } = useAuth();
  const { user } = useUser();
  const { doAction, error, setError } = useTasks();

  const [task, setTask] = useState<
    (Task & {
      submissions?: Submission[];
      applications?: Application[];
      application_count?: number;
      tags?: string[];
    }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchTask = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`);
      if (res.ok) {
        setTask(await res.json());
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const isCreator = user && task && task.creatorId === user.user_id;
  const isAcceptor = user && task && task.acceptorId === user.user_id;

  // Find the current user's application
  const myApplication =
    user && task?.applications
      ? task.applications.find((a) => a.applicant_id === user.user_id)
      : null;

  const handleAction = async (action: string, body?: object) => {
    setActionLoading(action);
    try {
      await doAction(taskId, action, body);
      await fetchTask();
    } finally {
      setActionLoading(null);
    }
  };

  const handleApply = async () => {
    setApplying(true);
    try {
      await doAction(taskId, "apply", { message: applyMessage || undefined });
      setApplyMessage("");
      await fetchTask();
    } finally {
      setApplying(false);
    }
  };

  const handleSubmitWork = async () => {
    if (!submitNotes.trim()) return;
    setSubmitting(true);
    try {
      await doAction(taskId, "submissions", {
        evidence_notes: submitNotes,
      });
      setSubmitNotes("");
      await fetchTask();
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="mb-6 h-6 w-32" />
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <Skeleton className="h-64" />
          <Skeleton className="h-48" />
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10 text-center">
        <p className="text-sm text-muted-foreground">Task not found.</p>
        <Link href="/tasks" className="mt-4 inline-block text-sm underline">
          Back to tasks
        </Link>
      </div>
    );
  }

  const timelineSteps = [
    { label: "Posted", active: true, completed: !!task.createdAt },
    {
      label: "Active",
      active: task.status === "open" || task.status === "in_progress",
      completed: !!task.acceptedAt,
    },
    {
      label: task.status === "submitted" ? "Submitted" : "Review",
      active: task.status === "submitted" || task.status === "reviewing",
      completed: task.status === "completed" || task.status === "disputed",
    },
    {
      label: task.status === "cancelled" ? "Cancelled" : "Completed",
      active: task.status === "completed" || task.status === "cancelled",
      completed: task.status === "completed" || task.status === "cancelled",
    },
  ];

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      {/* Back link */}
      <Link
        href="/tasks"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to tasks
      </Link>

      <div className="grid gap-8 lg:grid-cols-[1fr_300px]">
        {/* Main content */}
        <div className="space-y-6">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <StatusBadge status={task.status} />
              {task.tags && task.tags.length > 0 &&
                task.tags.map((tag) => (
                  <TagPill key={tag} tag={tag} />
                ))}
            </div>
            <p className="text-base text-foreground">
              {task.description || "No description provided"}
            </p>
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatTime(task.createdAt)}
              </span>
              <span className="font-mono">{task.id.slice(0, 8)}</span>
            </div>
          </div>

          <Separator />

          {/* Evidence / Submissions */}
          {task.evidenceNotes && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Evidence Submitted
              </p>
              <p className="text-sm">{task.evidenceNotes}</p>
            </div>
          )}

          {task.disputeReason && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-[11px] uppercase tracking-wider text-destructive mb-1">
                Dispute Reason
              </p>
              <p className="text-sm">{task.disputeReason}</p>
            </div>
          )}

          {task.resolution && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Resolution
              </p>
              <p className="text-sm font-medium">
                {task.resolution === "acceptor_wins"
                  ? "Worker wins — funds released"
                  : "Creator wins — funds returned"}
              </p>
            </div>
          )}

          {/* Applications list — creator view */}
          {task.applications &&
            task.applications.length > 0 &&
            isCreator && (
              <div>
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                  Applications ({task.applications.length})
                </p>
                <div className="space-y-3">
                  {task.applications.map((app: Application) => (
                    <ApplicationCard
                      key={app.id}
                      application={app}
                      taskId={taskId}
                      taskStatus={task.status}
                      actionLoading={actionLoading}
                      onRefresh={fetchTask}
                      setActionLoading={setActionLoading}
                    />
                  ))}
                </div>
              </div>
            )}

          {/* Submissions list */}
          {task.submissions && task.submissions.length > 0 && isCreator && (
            <div>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
                Submissions ({task.submissions.length})
              </p>
              <div className="space-y-3">
                {task.submissions.map((sub: Submission) => (
                  <div
                    key={sub.id}
                    className="rounded-md border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-mono text-muted-foreground">
                          {truncAddr(sub.worker_wallet)}
                        </span>
                        <span className="text-xs text-muted-foreground ml-2">
                          {formatTime(sub.submitted_at)}
                        </span>
                        {sub.is_winner && (
                          <span className="ml-2 text-xs font-semibold text-usdc">
                            Winner
                          </span>
                        )}
                      </div>
                      {!sub.is_winner &&
                        task.status !== "completed" &&
                        task.status !== "cancelled" && (
                          <Button
                            size="xs"
                            onClick={() =>
                              handleAction("pick-winner", {
                                submission_id: sub.id,
                              })
                            }
                            disabled={actionLoading === "pick-winner"}
                          >
                            {actionLoading === "pick-winner"
                              ? "..."
                              : "Pick Winner"}
                          </Button>
                        )}
                    </div>
                    {sub.evidence_notes && (
                      <p className="mt-2 text-sm">{sub.evidence_notes}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <Separator />

          {/* Action area */}
          {authenticated ? (
            <div className="space-y-4">
              {/* Worker: apply to task */}
              {task.status === "open" && !isCreator && !myApplication && (
                <div className="rounded-md bg-zinc-900 p-4">
                  <p className="text-sm font-medium text-white mb-3">
                    Apply for this Task
                  </p>
                  <Textarea
                    placeholder="Why are you a good fit? (optional)"
                    value={applyMessage}
                    onChange={(e) => setApplyMessage(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mb-3"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    className="bg-white text-zinc-900 hover:bg-zinc-100"
                    onClick={handleApply}
                    disabled={applying}
                  >
                    {applying ? "Applying..." : "Apply"}
                  </Button>
                </div>
              )}

              {/* Worker: application pending */}
              {task.status === "open" &&
                !isCreator &&
                myApplication?.status === "pending" && (
                  <div className="rounded-md border border-border bg-card p-4">
                    <p className="text-sm font-medium mb-1">
                      Application submitted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Waiting for the task creator to review your application.
                    </p>
                  </div>
                )}

              {/* Worker: application accepted → can submit work */}
              {task.status === "open" &&
                !isCreator &&
                myApplication?.status === "accepted" && (
                  <div className="rounded-md bg-zinc-900 p-4">
                    <p className="text-sm font-medium text-white mb-1">
                      Application accepted
                    </p>
                    <p className="text-xs text-zinc-400 mb-3">
                      You can now submit your work.
                    </p>
                    <Textarea
                      placeholder="Describe what you did, include any evidence notes..."
                      value={submitNotes}
                      onChange={(e) => setSubmitNotes(e.target.value)}
                      className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mb-3"
                      rows={3}
                    />
                    <Button
                      size="sm"
                      className="bg-white text-zinc-900 hover:bg-zinc-100"
                      onClick={handleSubmitWork}
                      disabled={submitting || !submitNotes.trim()}
                    >
                      {submitting ? "Submitting..." : "Submit Work"}
                    </Button>
                  </div>
                )}

              {/* Worker: application rejected */}
              {task.status === "open" &&
                !isCreator &&
                myApplication?.status === "rejected" && (
                  <div className="rounded-md border border-border bg-card p-4">
                    <p className="text-sm font-medium mb-1">
                      Application not selected
                    </p>
                    <p className="text-xs text-muted-foreground">
                      The task creator chose other applicants.
                    </p>
                  </div>
                )}

              {/* Submit evidence (in-progress task — legacy) */}
              {task.status === "in_progress" && isAcceptor && (
                <div className="rounded-md bg-zinc-900 p-4">
                  <p className="text-sm font-medium text-white mb-3">
                    Submit Evidence
                  </p>
                  <Textarea
                    placeholder="Describe your completed work..."
                    value={submitNotes}
                    onChange={(e) => setSubmitNotes(e.target.value)}
                    className="bg-zinc-800 border-zinc-700 text-white placeholder:text-zinc-500 mb-3"
                    rows={3}
                  />
                  <Button
                    size="sm"
                    className="bg-white text-zinc-900 hover:bg-zinc-100"
                    onClick={() =>
                      handleAction("submit", { notes: submitNotes })
                    }
                    disabled={
                      actionLoading === "submit" || !submitNotes.trim()
                    }
                  >
                    {actionLoading === "submit"
                      ? "Submitting..."
                      : "Submit Evidence"}
                  </Button>
                </div>
              )}

              {/* Creator actions */}
              {task.status === "submitted" && isCreator && (
                <div className="flex gap-3">
                  <Button
                    onClick={() => handleAction("approve")}
                    disabled={actionLoading === "approve"}
                  >
                    {actionLoading === "approve" ? "..." : "Approve & Pay"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      if (disputeReason.trim()) {
                        handleAction("dispute", { reason: disputeReason });
                      }
                    }}
                    disabled={
                      actionLoading === "dispute" || !disputeReason.trim()
                    }
                  >
                    {actionLoading === "dispute" ? "..." : "Dispute"}
                  </Button>
                </div>
              )}

              {task.status === "submitted" && isCreator && (
                <Textarea
                  placeholder="Reason for dispute (if needed)..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  rows={2}
                />
              )}

              {task.status === "open" && isCreator && (
                <Button
                  variant="outline"
                  onClick={() => handleAction("cancel")}
                  disabled={actionLoading === "cancel"}
                >
                  {actionLoading === "cancel" ? "..." : "Cancel Task"}
                </Button>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-border bg-card p-6 text-center">
              <p className="text-sm text-muted-foreground">
                Log in to apply for this task or interact with it.
              </p>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">{error}</p>
              <button
                onClick={() => setError(null)}
                className="mt-1 text-xs text-destructive/70 hover:text-destructive"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="space-y-4">
          {/* Reward card */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Reward
            </p>
            <UsdcAmount amount={task.amount} size="lg" />
          </div>

          {/* Escrow status */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Escrow
            </p>
            <div className="flex items-center gap-2">
              <Shield className="size-3.5 text-muted-foreground" />
              <span className="text-xs">
                {task.appSessionId
                  ? "Secured in Yellow Network"
                  : "Pending escrow"}
              </span>
            </div>
            {task.appSessionId && (
              <div className="mt-2 flex items-center gap-1">
                <span className="text-[10px] font-mono text-muted-foreground truncate">
                  {task.appSessionId.slice(0, 16)}...
                </span>
                <CopyButton text={task.appSessionId} />
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-3">
              Status
            </p>
            <Timeline steps={timelineSteps} />
          </div>

          {/* Participants */}
          <div className="rounded-md border border-border bg-card p-4">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
              Participants
            </p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="size-3 text-muted-foreground" />
                <span className="text-xs">Creator:</span>
                {task.creatorWallet ? (
                  <span className="text-xs font-mono">
                    {truncAddr(task.creatorWallet)}
                    {isCreator && (
                      <span className="text-muted-foreground ml-1">
                        (you)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
              {task.acceptorWallet && (
                <div className="flex items-center gap-2">
                  <User className="size-3 text-muted-foreground" />
                  <span className="text-xs">Worker:</span>
                  <span className="text-xs font-mono">
                    {truncAddr(task.acceptorWallet)}
                    {isAcceptor && (
                      <span className="text-muted-foreground ml-1">
                        (you)
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Application count in sidebar */}
          {task.application_count !== undefined && task.application_count > 0 && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Applications
              </p>
              <p className="text-lg font-semibold">{task.application_count}</p>
              <p className="text-xs text-muted-foreground">
                {task.applications?.filter((a) => a.status === "accepted")
                  .length || 0}{" "}
                accepted
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ApplicationCard({
  application,
  taskId,
  taskStatus,
  actionLoading,
  onRefresh,
  setActionLoading,
}: {
  application: Application;
  taskId: string;
  taskStatus: string;
  actionLoading: string | null;
  onRefresh: () => Promise<void>;
  setActionLoading: (v: string | null) => void;
}) {
  const { getToken } = useAuth();
  const app = application;
  const profile = app.applicant;

  const handleReview = async (newStatus: "accepted" | "rejected") => {
    const loadingKey = `review-${app.id}`;
    setActionLoading(loadingKey);
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/tasks/${taskId}/applications/${app.id}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ status: newStatus }),
        },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update application");
      }
      await onRefresh();
    } catch {
      // ignore — error handled by parent
    } finally {
      setActionLoading(null);
    }
  };

  const initials = profile.display_name
    ? profile.display_name.charAt(0).toUpperCase()
    : app.applicant_wallet.slice(2, 4).toUpperCase();

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Avatar className="size-8 shrink-0">
          {profile.avatar_url ? (
            <AvatarImage
              src={profile.avatar_url}
              alt={profile.display_name || "Applicant"}
            />
          ) : null}
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium truncate">
              {profile.display_name || truncAddr(app.applicant_wallet)}
            </span>
            {app.status === "accepted" && (
              <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600">
                Accepted
              </span>
            )}
            {app.status === "rejected" && (
              <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-600">
                Rejected
              </span>
            )}
            {app.status === "pending" && (
              <span className="rounded-full bg-yellow-500/10 px-2 py-0.5 text-[10px] font-medium text-yellow-600">
                Pending
              </span>
            )}
          </div>

          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{truncAddr(app.applicant_wallet)}</span>
            {profile.location && (
              <span className="flex items-center gap-0.5">
                <MapPin className="size-2.5" />
                {profile.location}
              </span>
            )}
            {profile.hourly_rate && (
              <span>${profile.hourly_rate}/hr</span>
            )}
          </div>

          {profile.tags && profile.tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {profile.tags.slice(0, 5).map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {app.message && (
            <p className="mt-2 text-sm text-foreground">{app.message}</p>
          )}

          <p className="mt-1 text-[10px] text-muted-foreground">
            Applied {formatTime(app.created_at)}
          </p>
        </div>

        {/* Accept/Reject buttons */}
        {app.status === "pending" &&
          taskStatus === "open" && (
            <div className="flex shrink-0 gap-1.5">
              <Button
                size="xs"
                onClick={() => handleReview("accepted")}
                disabled={actionLoading === `review-${app.id}`}
              >
                <Check className="size-3" />
                Accept
              </Button>
              <Button
                size="xs"
                variant="outline"
                onClick={() => handleReview("rejected")}
                disabled={actionLoading === `review-${app.id}`}
              >
                <X className="size-3" />
              </Button>
            </div>
          )}
      </div>
    </div>
  );
}
