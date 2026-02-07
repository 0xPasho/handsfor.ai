import { eq, and, type SQL } from "drizzle-orm";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { users, tasks, submissions, applications, messages } from "@/modules/db/schema";
import { createInitialTaskSession, closeTaskAppSession, cancelInitialSession, transitionToWorkerSession } from "@/modules/yellow/server/platform";
import { depositAndAllocateForUserTestnet, depositFromServerWallet, sponsorGas, withdrawFromYellow, withdrawFromYellowTestnet } from "@/modules/yellow/server/funds";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";

import { serverData } from "@/modules/general/utils/server-constants";
import { getDisplayName } from "@/lib/identity";

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
  const amountNum = parseFloat(amountUsdc);
  if (isNaN(amountNum) || amountNum <= 0 || amountNum > 100000) {
    throw new Error("Invalid amount. Must be a positive number up to 100,000.");
  }

  if (args.description && args.description.length > 5000) {
    throw new Error("Description must be 5000 characters or less");
  }

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
  } else {
    // Production: check Yellow balance before creating session
    const yellowBalance = await getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress);
    if (parseFloat(yellowBalance) < parseFloat(amountUsdc)) {
      throw new Error(`Insufficient Yellow balance: have ${yellowBalance} USDC, need ${amountUsdc}. Use the deposit tool first.`);
    }
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
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      username: users.username,
      ensName: users.ensName,
      baseName: users.baseName,
      activeIdentity: users.activeIdentity,
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
        name: getDisplayName({
          username: a.username,
          ensName: a.ensName,
          baseName: a.baseName,
          activeIdentity: a.activeIdentity,
          walletAddress: a.applicantWallet,
        }),
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

  if (!creator?.privyWalletId) throw new Error("Creator has no server wallet");

  const [winner] = await db
    .select()
    .from(users)
    .where(eq(users.id, submission.workerId))
    .limit(1);

  if (!winner?.privyWalletId) throw new Error("Winner has no server wallet");

  if (task.appSessionId) {
    const { appSessionId } = await transitionToWorkerSession({
      existingAppSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      creatorUserId: creator.id,
      creatorPrivyWalletId: creator.privyWalletId,
      acceptorAddress: winner.walletAddress as Address,
      acceptorUserId: winner.id,
      acceptorPrivyWalletId: winner.privyWalletId,
      amount: task.amount,
    });

    await closeTaskAppSession({
      appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: winner.walletAddress as Address,
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
      acceptorId: winner.id,
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
      tags: users.tags,
      hourlyRate: users.hourlyRate,
      bio: users.bio,
      username: users.username,
      ensName: users.ensName,
      baseName: users.baseName,
      activeIdentity: users.activeIdentity,
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
        name: getDisplayName({
          username: r.username,
          ensName: r.ensName,
          baseName: r.baseName,
          activeIdentity: r.activeIdentity,
          walletAddress: r.applicantWallet,
        }),
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

export async function sendMessage(
  user: User,
  args: { task_id: string; participant_id: string; content: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id)
    throw new Error("Only the task creator can send messages via MCP");

  if (!args.content?.trim()) throw new Error("Message content is required");
  if (args.content.length > 10000) throw new Error("Message too long (max 10,000 characters)");

  const { asc } = await import("drizzle-orm");

  const [msg] = await db
    .insert(messages)
    .values({
      taskId: args.task_id,
      participantId: args.participant_id,
      senderId: user.id,
      content: args.content.trim(),
    })
    .returning();

  return {
    id: msg.id,
    task_id: msg.taskId,
    participant_id: msg.participantId,
    sender_id: msg.senderId,
    content: msg.content,
    created_at: msg.createdAt,
  };
}

export async function getMessages(
  user: User,
  args: { task_id: string; participant_id: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id)
    throw new Error("Only the task creator can read messages via MCP");

  const { asc } = await import("drizzle-orm");

  const rows = await db
    .select({
      id: messages.id,
      senderId: messages.senderId,
      content: messages.content,
      createdAt: messages.createdAt,
      senderWallet: users.walletAddress,
      senderUsername: users.username,
      senderEnsName: users.ensName,
      senderBaseName: users.baseName,
      senderActiveIdentity: users.activeIdentity,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderId, users.id))
    .where(
      and(
        eq(messages.taskId, args.task_id),
        eq(messages.participantId, args.participant_id),
      ),
    )
    .orderBy(asc(messages.createdAt));

  return {
    task_id: args.task_id,
    participant_id: args.participant_id,
    messages: rows.map((m) => ({
      id: m.id,
      sender_id: m.senderId,
      sender_name: getDisplayName({
        username: m.senderUsername,
        ensName: m.senderEnsName,
        baseName: m.senderBaseName,
        activeIdentity: m.senderActiveIdentity,
        walletAddress: m.senderWallet,
      }),
      content: m.content,
      created_at: m.createdAt,
    })),
  };
}

export async function applyToTask(
  user: User,
  args: { task_id: string; message?: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.status !== "open") throw new Error(`Task is ${task.status}, can only apply to open tasks`);
  if (task.creatorId === user.id) throw new Error("Cannot apply to your own task");

  // Check for existing application
  const [existing] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.taskId, task.id),
        eq(applications.applicantId, user.id),
      ),
    )
    .limit(1);

  if (existing) throw new Error("You have already applied to this task");

  const [application] = await db
    .insert(applications)
    .values({
      taskId: task.id,
      applicantId: user.id,
      applicantWallet: user.walletAddress,
      message: args.message?.trim() || null,
      status: "pending",
    })
    .returning();

  return {
    application_id: application.id,
    task_id: application.taskId,
    status: application.status,
    message: application.message,
  };
}

export async function submitWork(
  user: User,
  args: { task_id: string; evidence_notes: string; attachment_url?: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.status !== "open") throw new Error(`Task is ${task.status}, can only submit when open`);
  if (task.creatorId === user.id) throw new Error("Cannot submit work on your own task");

  // Check for accepted application
  const [acceptedApp] = await db
    .select()
    .from(applications)
    .where(
      and(
        eq(applications.taskId, task.id),
        eq(applications.applicantId, user.id),
        eq(applications.status, "accepted"),
      ),
    )
    .limit(1);

  if (!acceptedApp) throw new Error("You must have an accepted application to submit work");

  // Check for duplicate
  const [existing] = await db
    .select()
    .from(submissions)
    .where(
      and(
        eq(submissions.taskId, task.id),
        eq(submissions.workerId, user.id),
      ),
    )
    .limit(1);

  if (existing) throw new Error("You have already submitted work for this task");

  if (!args.evidence_notes?.trim()) throw new Error("Evidence notes are required");
  if (args.evidence_notes.length > 5000) throw new Error("Evidence notes must be 5000 characters or less");

  const [submission] = await db
    .insert(submissions)
    .values({
      taskId: task.id,
      workerId: user.id,
      workerWallet: user.walletAddress,
      evidenceNotes: args.evidence_notes.trim(),
      attachmentUrl: args.attachment_url || null,
    })
    .returning();

  return {
    submission_id: submission.id,
    task_id: submission.taskId,
    evidence_notes: submission.evidenceNotes,
    submitted_at: submission.submittedAt,
  };
}

export async function withdraw(
  user: User,
  args: { amount: string; destination_address: string },
) {
  if (!user.privyWalletId) throw new Error("No server wallet found. Cannot withdraw.");
  if (!args.amount || parseFloat(args.amount) <= 0) throw new Error("Amount must be positive");
  if (!/^0x[a-fA-F0-9]{40}$/.test(args.destination_address)) throw new Error("Invalid destination address");

  const withdrawFn = serverData.isTestnet ? withdrawFromYellowTestnet : withdrawFromYellow;
  const result = await withdrawFn({
    privyWalletId: user.privyWalletId,
    walletAddress: user.walletAddress,
    amount: args.amount,
    destinationAddress: args.destination_address,
  });

  return {
    transfer_tx_hash: result.txHash,
    custody_tx_hash: result.custodyTxHash,
    amount: args.amount,
    destination: args.destination_address,
  };
}

export async function deposit(
  user: User,
  args: { amount: string },
) {
  if (!user.privyWalletId) throw new Error("No server wallet found. Cannot deposit.");
  if (!args.amount || parseFloat(args.amount) <= 0) throw new Error("Amount must be positive");

  if (serverData.isTestnet) {
    await depositAndAllocateForUserTestnet({
      userId: user.id,
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount: args.amount,
    });
  } else {
    // Production: sponsor gas then move on-chain USDC from server wallet → Yellow custody
    await sponsorGas(user.walletAddress);
    await depositFromServerWallet({
      userId: user.id,
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount: args.amount,
    });
  }

  // Return updated balance
  return getBalance(user);
}

export async function disputeTask(
  user: User,
  args: { task_id: string; reason: string },
) {
  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, args.task_id))
    .limit(1);

  if (!task) throw new Error("Task not found");
  if (task.creatorId !== user.id) throw new Error("Only the task creator can dispute");
  if (task.status !== "open") throw new Error(`Task is ${task.status}, can only dispute when open`);
  if (!args.reason?.trim()) throw new Error("Dispute reason is required");

  // Load submissions
  const taskSubmissions = await db
    .select()
    .from(submissions)
    .where(eq(submissions.taskId, task.id));

  if (taskSubmissions.length === 0) throw new Error("No submissions to dispute — cancel the task instead");
  if (!task.appSessionId) throw new Error("Task missing escrow session");

  // Call the dispute API endpoint internally
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("AI dispute resolution not configured (OPENROUTER_API_KEY missing)");

  // Mark as disputed
  await db
    .update(tasks)
    .set({ status: "disputed", disputeReason: args.reason.trim() })
    .where(eq(tasks.id, task.id));

  // AI resolution
  const submissionsList = taskSubmissions
    .map((s, i) => `Submission ${i + 1} (ID: ${s.id}):\n${s.evidenceNotes || "(no evidence)"}`)
    .join("\n\n");

  let resolution: "creator_wins" | "acceptor_wins" = "creator_wins";
  let winnerSubmissionId: string | null = null;

  try {
    const prompt = `You are a dispute resolver for a task marketplace. A task creator is disputing the submitted work.

Task description: ${task.description || "(no description)"}

Submissions:
${submissionsList}

Creator's dispute reason: ${args.reason}

Based on this information, decide who wins the dispute.
- If ANY submission adequately fulfills the task, respond with: acceptor_wins:SUBMISSION_ID (using the actual submission ID)
- If NO submission adequately fulfills the task, respond with: creator_wins

Respond with ONLY one line in the format above.`;

    const controller = new AbortController();
    const aiTimeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "anthropic/claude-sonnet-4",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 50,
      }),
      signal: controller.signal,
    });
    clearTimeout(aiTimeout);

    if (response.ok) {
      const data = await response.json();
      const answer = data.choices?.[0]?.message?.content?.trim() || "";
      if (answer.toLowerCase().startsWith("acceptor_wins")) {
        const parts = answer.split(":");
        const subId = parts.slice(1).join(":").trim();
        const valid = taskSubmissions.find((s) => s.id === subId);
        if (valid) {
          resolution = "acceptor_wins";
          winnerSubmissionId = valid.id;
        } else {
          // AI gave invalid submission ID — default to creator wins for safety
          console.error(`AI dispute returned invalid submission ID: ${subId}`);
        }
      }
    }
  } catch (err) {
    console.error("AI dispute resolution error:", err);
  }

  // Load creator
  const [creator] = await db
    .select()
    .from(users)
    .where(eq(users.id, task.creatorId))
    .limit(1);

  if (!creator?.privyWalletId) throw new Error("Creator has no server wallet");

  if (resolution === "acceptor_wins" && winnerSubmissionId) {
    const winningSubmission = taskSubmissions.find((s) => s.id === winnerSubmissionId)!;
    const [winner] = await db
      .select()
      .from(users)
      .where(eq(users.id, winningSubmission.workerId))
      .limit(1);

    if (!winner?.privyWalletId) throw new Error("Winner has no server wallet");

    const { appSessionId } = await transitionToWorkerSession({
      existingAppSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      creatorUserId: creator.id,
      creatorPrivyWalletId: creator.privyWalletId,
      acceptorAddress: winner.walletAddress as Address,
      acceptorUserId: winner.id,
      acceptorPrivyWalletId: winner.privyWalletId,
      amount: task.amount,
    });

    await closeTaskAppSession({
      appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: winner.walletAddress as Address,
      amount: task.amount,
      winner: "acceptor",
    });

    await db.update(submissions).set({ isWinner: true }).where(eq(submissions.id, winnerSubmissionId));
    await db.update(tasks).set({
      status: "completed",
      resolution: "acceptor_wins",
      acceptorId: winner.id,
      winnerSubmissionId,
      completedAt: new Date(),
    }).where(eq(tasks.id, task.id));
  } else {
    await closeTaskAppSession({
      appSessionId: task.appSessionId,
      creatorAddress: creator.walletAddress as Address,
      acceptorAddress: creator.walletAddress as Address,
      amount: task.amount,
      winner: "creator",
    });

    await db.update(tasks).set({
      status: "completed",
      resolution: "creator_wins",
      completedAt: new Date(),
    }).where(eq(tasks.id, task.id));
  }

  return {
    task_id: task.id,
    status: "completed",
    resolution,
    winner_submission_id: winnerSubmissionId,
  };
}

export async function getBalance(user: User) {
  let balance = "0";

  if (user.privyWalletId) {
    try {
      balance = await getYellowUnifiedBalance(
        user.id,
        user.privyWalletId,
        user.walletAddress,
      );
    } catch {
      // ignore
    }
  }

  return {
    balance,
    wallet_address: user.walletAddress,
    api_key: user.apiKey,
  };
}
