import { eq, and, type SQL } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { users, tasks, submissions, applications } from "@/modules/db/schema";
import { createInitialTaskSession, closeTaskAppSession, cancelInitialSession } from "@/modules/yellow/server/platform";
import { depositAndAllocateForUserTestnet } from "@/modules/yellow/server/funds";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { getUsdcBalance } from "@/modules/evm/balance";
import { serverData } from "@/modules/general/utils/server-constants";

type User = typeof users.$inferSelect;

export async function createTask(
  user: User,
  args: {
    description: string;
    amount: string;
    tags?: string[];
    deadline_hours?: number;
  },
) {
  const amountUsdc = args.amount;

  if (!user.privyWalletId) {
    throw new Error("User wallet not configured");
  }

  if (serverData.isTestnet) {
    await depositAndAllocateForUserTestnet({
      userId: user.id,
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount: amountUsdc,
    });
  }

  const { appSessionId } = await createInitialTaskSession({
    creatorAddress: user.walletAddress as Address,
    userId: user.id,
    privyWalletId: user.privyWalletId,
    amount: amountUsdc,
  });

  const deadline = args.deadline_hours
    ? new Date(Date.now() + args.deadline_hours * 60 * 60 * 1000)
    : undefined;

  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount: amountUsdc,
      status: "open",
      description: args.description,
      tags: args.tags || [],
      deadline,
      competitionMode: true,
      appSessionId,
    })
    .returning();

  return {
    task_id: task.id,
    status: task.status,
    amount: task.amount,
    description: task.description,
  };
}

export async function listTasks(args: { status?: string }) {
  const conditions: SQL[] = [];
  if (args.status) conditions.push(eq(tasks.status, args.status));

  const results =
    conditions.length > 0
      ? await db.select().from(tasks).where(and(...conditions))
      : await db.select().from(tasks);

  return {
    tasks: results.map((t) => ({
      id: t.id,
      amount: t.amount,
      status: t.status,
      description: t.description,
      tags: t.tags,
      created_at: t.createdAt,
    })),
  };
}

export async function getTask(args: { task_id: string }) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) {
    throw new Error("Task not found");
  }

  const taskSubmissions = await db
    .select()
    .from(submissions)
    .where(eq(submissions.taskId, task.id));

  const taskApplications = await db
    .select({
      id: applications.id,
      applicantId: applications.applicantId,
      applicantWallet: applications.applicantWallet,
      message: applications.message,
      status: applications.status,
      createdAt: applications.createdAt,
      displayName: users.displayName,
      tags: users.tags,
      hourlyRate: users.hourlyRate,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(applications.taskId, task.id));

  return {
    id: task.id,
    status: task.status,
    amount: task.amount,
    description: task.description,
    tags: task.tags,
    deadline: task.deadline,
    competition_mode: task.competitionMode,
    evidence_notes: task.evidenceNotes,
    dispute_reason: task.disputeReason,
    resolution: task.resolution,
    created_at: task.createdAt,
    submissions: taskSubmissions.map((s) => ({
      id: s.id,
      worker_wallet: s.workerWallet,
      evidence_notes: s.evidenceNotes,
      submitted_at: s.submittedAt,
      is_winner: s.isWinner,
    })),
    applications: taskApplications.map((a) => ({
      id: a.id,
      applicant_id: a.applicantId,
      applicant_wallet: a.applicantWallet,
      message: a.message,
      status: a.status,
      created_at: a.createdAt,
      applicant: {
        display_name: a.displayName || null,
        tags: a.tags || [],
        hourly_rate: a.hourlyRate || null,
      },
    })),
    application_count: taskApplications.length,
  };
}

export async function pickWinner(
  user: User,
  args: { task_id: string; submission_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id) throw new Error("Only the task creator can pick a winner");
  if (task.status !== "open" && task.status !== "reviewing")
    throw new Error(`Task is ${task.status}, cannot pick winner`);

  const [submission] = await db
    .select()
    .from(submissions)
    .where(eq(submissions.id, args.submission_id))
    .limit(1);

  if (!submission || submission.taskId !== task.id)
    throw new Error("Submission not found for this task");

  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  if (!creator) throw new Error("Creator not found");

  if (task.appSessionId) {
    await closeTaskAppSession({
      appSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: submission.workerWallet as Address,
      amount: task.amount,
      winner: "acceptor",
    });
  }

  await db
    .update(submissions)
    .set({ isWinner: true })
    .where(eq(submissions.id, args.submission_id));

  await db
    .update(tasks)
    .set({
      status: "completed",
      resolution: "acceptor_wins",
      winnerSubmissionId: args.submission_id,
      completedAt: new Date(),
    })
    .where(eq(tasks.id, task.id));

  return {
    task_id: task.id,
    status: "completed",
    winner_submission_id: args.submission_id,
    winner_wallet: submission.workerWallet,
  };
}

export async function cancelTask(
  user: User,
  args: { task_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id) throw new Error("Only the task creator can cancel");
  if (task.status !== "open") throw new Error(`Task is ${task.status}, can only cancel open tasks`);

  if (task.appSessionId) {
    const [creator] = await db
      .select()
      .from(users)
      .where(eq(users.id, task.creatorId))
      .limit(1);

    if (creator) {
      await cancelInitialSession({
        appSessionId: task.appSessionId,
        creatorAddress: creator.walletAddress as Address,
        amount: task.amount,
      });
    }
  }

  await db
    .update(tasks)
    .set({ status: "cancelled", completedAt: new Date() })
    .where(eq(tasks.id, task.id));

  return { task_id: task.id, status: "cancelled" };
}

export async function listApplications(
  user: User,
  args: { task_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id)
    throw new Error("Only the task creator can view applications");

  const rows = await db
    .select({
      id: applications.id,
      applicantId: applications.applicantId,
      applicantWallet: applications.applicantWallet,
      message: applications.message,
      status: applications.status,
      createdAt: applications.createdAt,
      displayName: users.displayName,
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      bio: users.bio,
    })
    .from(applications)
    .innerJoin(users, eq(applications.applicantId, users.id))
    .where(eq(applications.taskId, task.id));

  return {
    task_id: task.id,
    applications: rows.map((r) => ({
      id: r.id,
      applicant_id: r.applicantId,
      applicant_wallet: r.applicantWallet,
      message: r.message,
      status: r.status,
      created_at: r.createdAt,
      applicant: {
        display_name: r.displayName || null,
        tags: r.tags || [],
        hourly_rate: r.hourlyRate || null,
        bio: r.bio || null,
      },
    })),
  };
}

export async function selectApplicant(
  user: User,
  args: { task_id: string; application_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id)
    throw new Error("Only the task creator can select applicants");
  if (task.status !== "open")
    throw new Error(`Task is ${task.status}, can only select on open tasks`);

  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, args.application_id))
    .limit(1);

  if (!application || application.taskId !== task.id)
    throw new Error("Application not found for this task");
  if (application.status !== "pending")
    throw new Error(`Application is already ${application.status}`);

  const [updated] = await db
    .update(applications)
    .set({ status: "accepted", reviewedAt: new Date() })
    .where(eq(applications.id, args.application_id))
    .returning();

  return {
    task_id: task.id,
    application_id: updated.id,
    applicant_wallet: updated.applicantWallet,
    status: updated.status,
  };
}

export async function rejectApplicant(
  user: User,
  args: { task_id: string; application_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id)
    throw new Error("Only the task creator can reject applicants");
  if (task.status !== "open")
    throw new Error(`Task is ${task.status}, can only reject on open tasks`);

  const [application] = await db
    .select()
    .from(applications)
    .where(eq(applications.id, args.application_id))
    .limit(1);

  if (!application || application.taskId !== task.id)
    throw new Error("Application not found for this task");
  if (application.status !== "pending")
    throw new Error(`Application is already ${application.status}`);

  const [updated] = await db
    .update(applications)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(applications.id, args.application_id))
    .returning();

  return {
    task_id: task.id,
    application_id: updated.id,
    applicant_wallet: updated.applicantWallet,
    status: updated.status,
  };
}

export async function getBalance(user: User) {
  let walletBalance = "0";
  let yellowBalance = "0";

  try {
    walletBalance = await getUsdcBalance(user.walletAddress as Address);
  } catch {
    // ignore
  }

  if (user.privyWalletId) {
    try {
      yellowBalance = await getYellowUnifiedBalance(
        user.id,
        user.privyWalletId,
        user.walletAddress,
      );
    } catch {
      // ignore
    }
  }

  return {
    wallet_balance: walletBalance,
    yellow_balance: yellowBalance,
    total: (parseFloat(walletBalance) + parseFloat(yellowBalance)).toString(),
    wallet_address: user.walletAddress,
  };
}
