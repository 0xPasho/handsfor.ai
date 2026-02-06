"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
import { MarkdownEditor } from "@/components/markdown-editor";
import { MarkdownRenderer } from "@/components/markdown-renderer";
import { Button } from "@/modules/shared/components/ui/button";
import { Skeleton } from "@/modules/shared/components/ui/skeleton";
import { Separator } from "@/modules/shared/components/ui/separator";
import {
  Avatar,
  AvatarImage,
  AvatarFallback,
} from "@/modules/shared/components/ui/avatar";
import { truncAddr, formatTime } from "@/lib/format";
import { getDisplayName, getInitials } from "@/lib/identity";
import { ArrowLeft, Shield, User, Clock, Check, X, MapPin, MessageSquare, Send, ExternalLink, Star } from "lucide-react";
import type { Task } from "@/hooks/use-user";

type Submission = {
  id: string;
  worker_id: string;
  worker_wallet: string;
  evidence_notes: string | null;
  submitted_at: string;
  is_winner: boolean;
};

type TaskReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  reviewer_name: string | null;
  reviewer_wallet: string;
  reviewer_id: string;
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
    avatar_url: string | null;
    tags: string[];
    hourly_rate: string | null;
    bio: string | null;
    location: string | null;
    username?: string | null;
    ens_name?: string | null;
    base_name?: string | null;
    active_identity?: string | null;
  };
};

export default function TaskDetailPage() {
  const params = useParams();
  const taskId = params.id as string;
  const { ready, authenticated } = useAuth();
  const { user, loading: userLoading } = useUser();
  const { doAction, error, setError } = useTasks();

  const [task, setTask] = useState<
    (Task & {
      submissions?: Submission[];
      applications?: Application[];
      application_count?: number;
      tags?: string[];
      review?: TaskReview | null;
      creator?: {
        id: string;
        wallet_address: string;
        username?: string | null;
        ens_name?: string | null;
        base_name?: string | null;
        active_identity?: string | null;
      } | null;
      acceptor?: {
        id: string;
        wallet_address: string;
        username?: string | null;
        ens_name?: string | null;
        base_name?: string | null;
        active_identity?: string | null;
      } | null;
    }) | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [submitNotes, setSubmitNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [applying, setApplying] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [chatParticipantId, setChatParticipantId] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<string | null>(null); // submission ID or "approve"
  const [ratingValue, setRatingValue] = useState(0);
  const [ratingComment, setRatingComment] = useState("");

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

  // Check if current user already submitted work
  const mySubmission =
    user && task?.submissions
      ? task.submissions.find((s) => s.worker_id === user.user_id)
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

  // Show skeleton while task is loading OR while auth/user is still resolving
  const stillLoading = loading || !ready || (authenticated && userLoading);

  if (stillLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-10">
        <Skeleton className="mb-6 h-6 w-32" />
        <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
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
            {task.description ? (
              <MarkdownRenderer content={task.description} className="max-h-[600px] overflow-y-auto" />
            ) : (
              <p className="text-base text-foreground">No description provided</p>
            )}
            <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Clock className="size-3" />
                {formatTime(task.createdAt)}
              </span>
              <span className="inline-flex items-center gap-1 font-mono">
                {task.id.slice(0, 8)}
                <CopyButton text={task.id} />
              </span>
            </div>
          </div>

          <Separator />

          {/* Evidence / Submissions */}
          {task.evidenceNotes && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
                Evidence Submitted
              </p>
              <MarkdownRenderer content={task.evidenceNotes} className="max-h-96 overflow-y-auto" />
            </div>
          )}

          {task.disputeReason && (
            <div className="rounded-md border border-destructive/20 bg-destructive/5 p-4">
              <p className="text-[11px] uppercase tracking-wider text-destructive mb-1">
                Dispute Reason
              </p>
              <MarkdownRenderer content={task.disputeReason} className="max-h-96 overflow-y-auto" />
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
                      onChat={
                        app.status === "accepted"
                          ? () => setChatParticipantId(app.applicant_id)
                          : undefined
                      }
                    />
                  ))}
                </div>
              </div>
            )}

          {/* Chat panel — creator chatting with a selected applicant */}
          {isCreator && chatParticipantId && (
            <ChatPanel
              taskId={taskId}
              participantId={chatParticipantId}
              onClose={() => setChatParticipantId(null)}
              participantName={
                (() => {
                  const chatApp = task.applications?.find(
                    (a) => a.applicant_id === chatParticipantId,
                  );
                  if (!chatApp) return undefined;
                  return getDisplayName({ ...chatApp.applicant, wallet_address: chatApp.applicant_wallet });
                })()
              }
            />
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
                            onClick={() => {
                              setRatingTarget(sub.id);
                              setRatingValue(0);
                              setRatingComment("");
                            }}
                          >
                            Pick Winner
                          </Button>
                        )}
                    </div>
                    {sub.evidence_notes && (
                      <div className="mt-2">
                        <MarkdownRenderer content={sub.evidence_notes} className="max-h-96 overflow-y-auto" />
                      </div>
                    )}

                    {/* Rating panel for this submission */}
                    {ratingTarget === sub.id && (
                      <RatingPanel
                        rating={ratingValue}
                        comment={ratingComment}
                        onRatingChange={setRatingValue}
                        onCommentChange={setRatingComment}
                        loading={actionLoading === "pick-winner"}
                        onCancel={() => setRatingTarget(null)}
                        onConfirm={async () => {
                          setActionLoading("pick-winner");
                          try {
                            await doAction(taskId, "pick-winner", {
                              submission_id: sub.id,
                              rating: ratingValue,
                              review: ratingComment || undefined,
                            });
                            setRatingTarget(null);
                            await fetchTask();
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review display on completed tasks */}
          {task.review && (
            <div className="rounded-md border border-border bg-card p-4">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2">
                Review
              </p>
              <div className="flex items-center gap-1 mb-1">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    className={`size-4 ${
                      s <= task.review!.rating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground/30"
                    }`}
                  />
                ))}
                <span className="ml-1 text-xs text-muted-foreground">
                  {task.review.rating}/5
                </span>
              </div>
              {task.review.comment && (
                <MarkdownRenderer content={task.review.comment} className="text-foreground/80 mt-1" />
              )}
              <p className="mt-2 text-[10px] text-muted-foreground">
                by{" "}
                <Link
                  href={`/humans/${task.review.reviewer_id}`}
                  className="hover:underline"
                >
                  {task.review.reviewer_name || truncAddr(task.review.reviewer_wallet || "")}
                </Link>
              </p>
            </div>
          )}

          {/* Action area */}
          {authenticated ? (
            <div className="space-y-4">
              {/* Worker: apply to task */}
              {task.status === "open" && !isCreator && !myApplication && (
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Apply for this Task
                  </p>
                  <MarkdownEditor
                    value={applyMessage}
                    onChange={setApplyMessage}
                    placeholder="Why are you a good fit? (optional)"
                    rows={3}
                    maxLength={2000}
                    variant="dark"
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

              {/* Worker: application accepted → can submit work or see submitted */}
              {task.status === "open" &&
                !isCreator &&
                myApplication?.status === "accepted" &&
                (mySubmission ? (
                  <div className="rounded-md border border-border bg-card p-4">
                    <p className="text-sm font-medium mb-1">
                      Work submitted
                    </p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Waiting for the task creator to review your submission.
                    </p>
                    {mySubmission.evidence_notes && (
                      <div className="border-t border-border pt-2 mt-2">
                        <MarkdownRenderer content={mySubmission.evidence_notes} />
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      Application accepted
                    </p>
                    <p className="text-xs text-muted-foreground">
                      You can now submit your work.
                    </p>
                    <MarkdownEditor
                      value={submitNotes}
                      onChange={setSubmitNotes}
                      placeholder="Describe what you did, include any evidence notes..."
                      rows={3}
                      maxLength={5000}
                      variant="dark"
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
                ))}

              {/* Worker: chat with creator */}
              {!isCreator && myApplication?.status === "accepted" && (
                <ChatPanel
                  taskId={taskId}
                  participantId={user!.user_id}
                />
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
                <div className="space-y-3">
                  <p className="text-sm font-medium">
                    Submit Evidence
                  </p>
                  <MarkdownEditor
                    value={submitNotes}
                    onChange={setSubmitNotes}
                    placeholder="Describe your completed work..."
                    rows={3}
                    maxLength={5000}
                    variant="dark"
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
                <>
                  {ratingTarget === "approve" ? (
                    <div className="rounded-md border border-border bg-card p-4">
                      <RatingPanel
                        rating={ratingValue}
                        comment={ratingComment}
                        onRatingChange={setRatingValue}
                        onCommentChange={setRatingComment}
                        loading={actionLoading === "approve"}
                        confirmLabel="Approve & Pay"
                        onCancel={() => setRatingTarget(null)}
                        onConfirm={async () => {
                          setActionLoading("approve");
                          try {
                            await doAction(taskId, "approve", {
                              rating: ratingValue,
                              review: ratingComment || undefined,
                            });
                            setRatingTarget(null);
                            await fetchTask();
                          } finally {
                            setActionLoading(null);
                          }
                        }}
                      />
                    </div>
                  ) : (
                    <div className="flex gap-3">
                      <Button
                        onClick={() => {
                          setRatingTarget("approve");
                          setRatingValue(0);
                          setRatingComment("");
                        }}
                      >
                        Approve & Pay
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

                  {ratingTarget !== "approve" && (
                    <textarea
                      placeholder="Reason for dispute (if needed)..."
                      value={disputeReason}
                      onChange={(e) => setDisputeReason(e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
                    />
                  )}
                </>
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
              {task.appSessionId ? (
                <a
                  href="https://www.yellow.org"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs hover:underline"
                >
                  Secured in Yellow Network
                  <ExternalLink className="size-2.5 text-muted-foreground" />
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  Pending escrow
                </span>
              )}
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
                  <Link
                    href={`/humans/${task.creatorId}`}
                    className="text-xs hover:underline"
                  >
                    {task.creator ? getDisplayName(task.creator) : truncAddr(task.creatorWallet)}
                    {isCreator && (
                      <span className="text-muted-foreground ml-1">
                        (you)
                      </span>
                    )}
                  </Link>
                ) : (
                  <span className="text-xs text-muted-foreground">-</span>
                )}
              </div>
              {task.acceptorWallet && task.acceptorId && (
                <div className="flex items-center gap-2">
                  <User className="size-3 text-muted-foreground" />
                  <span className="text-xs">Worker:</span>
                  <Link
                    href={`/humans/${task.acceptorId}`}
                    className="text-xs hover:underline"
                  >
                    {task.acceptor ? getDisplayName(task.acceptor) : truncAddr(task.acceptorWallet)}
                    {isAcceptor && (
                      <span className="text-muted-foreground ml-1">
                        (you)
                      </span>
                    )}
                  </Link>
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
  onChat,
}: {
  application: Application;
  taskId: string;
  taskStatus: string;
  actionLoading: string | null;
  onRefresh: () => Promise<void>;
  setActionLoading: (v: string | null) => void;
  onChat?: () => void;
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

  const applicantIdentity = { ...profile, wallet_address: app.applicant_wallet };
  const initials = getInitials(applicantIdentity);

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <Link href={`/humans/${app.applicant_id}`} className="shrink-0">
          <Avatar className="size-8 transition-opacity hover:opacity-80">
            {profile.avatar_url ? (
              <AvatarImage
                src={profile.avatar_url}
                alt="Applicant"
              />
            ) : null}
            <AvatarFallback className="text-xs">{initials}</AvatarFallback>
          </Avatar>
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/humans/${app.applicant_id}`}
              className="text-sm font-medium truncate hover:underline"
            >
              {getDisplayName(applicantIdentity)}
            </Link>
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
            <MarkdownRenderer content={app.message} className="mt-2 text-foreground" />
          )}

          <p className="mt-1 text-[10px] text-muted-foreground">
            Applied {formatTime(app.created_at)}
          </p>
        </div>

        {/* Accept/Reject buttons */}
        <div className="flex shrink-0 gap-1.5">
          {app.status === "pending" && taskStatus === "open" && (
            <>
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
            </>
          )}
          {app.status === "accepted" && onChat && (
            <Button size="xs" variant="outline" onClick={onChat}>
              <MessageSquare className="size-3" />
              Chat
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

type ChatMessage = {
  id: string;
  sender_id: string;
  sender_name: string | null;
  sender_wallet: string | null;
  content: string;
  created_at: string;
};

function ChatPanel({
  taskId,
  participantId,
  onClose,
  participantName,
}: {
  taskId: string;
  participantId: string;
  onClose?: () => void;
  participantName?: string;
}) {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const token = await getToken();
      const res = await fetch(
        `/api/tasks/${taskId}/messages?participant=${participantId}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      }
    } catch {
      // ignore
    }
  }, [taskId, participantId, getToken]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const token = await getToken();
      const res = await fetch(`/api/tasks/${taskId}/messages`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: draft.trim(),
          participant_id: participantId,
        }),
      });
      if (res.ok) {
        setDraft("");
        await fetchMessages();
      }
    } catch {
      // ignore
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="rounded-md border border-border bg-card">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-2">
          <MessageSquare className="size-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">
            Chat{participantName ? ` with ${participantName}` : ""}
          </span>
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={scrollRef} className="h-64 overflow-y-auto px-4 py-3 space-y-3">
        {messages.length === 0 && (
          <p className="text-center text-xs text-muted-foreground py-8">
            No messages yet. Start the conversation.
          </p>
        )}
        {messages.map((msg) => {
          const isMe = user && msg.sender_id === user.user_id;
          return (
            <div
              key={msg.id}
              className={`flex ${isMe ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-md px-3 py-2 ${
                  isMe
                    ? "bg-foreground text-background"
                    : "bg-muted text-foreground"
                }`}
              >
                {!isMe && (
                  <p className="text-[10px] font-medium mb-0.5 opacity-70">
                    {msg.sender_name || (msg.sender_wallet ? truncAddr(msg.sender_wallet) : "Anonymous")}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                <p
                  className={`text-[10px] mt-1 ${
                    isMe ? "text-background/60" : "text-muted-foreground"
                  }`}
                >
                  {formatTime(msg.created_at)}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="flex items-center gap-2 border-t border-border px-4 py-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Type a message..."
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
        <button
          onClick={handleSend}
          disabled={!draft.trim() || sending}
          className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-40"
        >
          <Send className="size-4" />
        </button>
      </div>
    </div>
  );
}

function RatingPanel({
  rating,
  comment,
  onRatingChange,
  onCommentChange,
  loading,
  onCancel,
  onConfirm,
  confirmLabel = "Confirm",
}: {
  rating: number;
  comment: string;
  onRatingChange: (r: number) => void;
  onCommentChange: (c: string) => void;
  loading: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium mb-2">Rate this worker</p>
      <div className="flex items-center gap-0.5 mb-3">
        {[1, 2, 3, 4, 5].map((s) => (
          <button
            key={s}
            type="button"
            onMouseEnter={() => setHovered(s)}
            onMouseLeave={() => setHovered(0)}
            onClick={() => onRatingChange(s)}
            className="p-0.5 transition-transform hover:scale-110"
          >
            <Star
              className={`size-6 ${
                s <= (hovered || rating)
                  ? "fill-yellow-400 text-yellow-400"
                  : "text-muted-foreground/30"
              }`}
            />
          </button>
        ))}
        {rating > 0 && (
          <span className="ml-2 text-xs text-muted-foreground">{rating}/5</span>
        )}
      </div>
      <textarea
        value={comment}
        onChange={(e) => onCommentChange(e.target.value)}
        placeholder="Leave a comment (optional)..."
        rows={2}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:border-foreground/30"
      />
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          onClick={onConfirm}
          disabled={loading || rating === 0}
        >
          {loading ? "..." : confirmLabel}
        </Button>
        <Button size="sm" variant="outline" onClick={onCancel} disabled={loading}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
