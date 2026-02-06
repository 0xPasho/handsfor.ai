import { NextRequest, NextResponse } from "next/server";
import { eq, and, asc } from "drizzle-orm";
import { db } from "@/modules/db";
import { messages, applications, users } from "@/modules/db/schema";
import { getAuthedTask } from "../helpers";
import { getDisplayName } from "@/lib/identity";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;
  const ctx = await getAuthedTask(req, taskId);
  if (ctx instanceof NextResponse) return ctx;

  const { user, task } = ctx;
  const isCreator = task.creatorId === user.id;

  let participantId: string;

  if (isCreator) {
    const pid = new URL(req.url).searchParams.get("participant");
    if (!pid) {
      return NextResponse.json(
        { error: "participant query param required for task creator" },
        { status: 400 },
      );
    }
    participantId = pid;
  } else {
    // Check the caller has an accepted application
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.taskId, taskId),
          eq(applications.applicantId, user.id),
          eq(applications.status, "accepted"),
        ),
      )
      .limit(1);

    if (!app) {
      return NextResponse.json(
        { error: "You must have an accepted application to view messages" },
        { status: 403 },
      );
    }
    participantId = user.id;
  }

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
        eq(messages.taskId, taskId),
        eq(messages.participantId, participantId),
      ),
    )
    .orderBy(asc(messages.createdAt));

  return NextResponse.json({
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
      sender_wallet: m.senderWallet,
      content: m.content,
      created_at: m.createdAt,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: taskId } = await params;
  const ctx = await getAuthedTask(req, taskId);
  if (ctx instanceof NextResponse) return ctx;

  const { user, task } = ctx;
  const isCreator = task.creatorId === user.id;

  let body: { content?: string; participant_id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.content?.trim()) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 },
    );
  }

  let participantId: string;

  if (isCreator) {
    if (!body.participant_id) {
      return NextResponse.json(
        { error: "participant_id required for task creator" },
        { status: 400 },
      );
    }
    participantId = body.participant_id;
  } else {
    // Verify accepted application
    const [app] = await db
      .select()
      .from(applications)
      .where(
        and(
          eq(applications.taskId, taskId),
          eq(applications.applicantId, user.id),
          eq(applications.status, "accepted"),
        ),
      )
      .limit(1);

    if (!app) {
      return NextResponse.json(
        { error: "You must have an accepted application to send messages" },
        { status: 403 },
      );
    }
    participantId = user.id;
  }

  const [msg] = await db
    .insert(messages)
    .values({
      taskId,
      participantId,
      senderId: user.id,
      content: body.content.trim(),
    })
    .returning();

  return NextResponse.json({
    id: msg.id,
    sender_id: msg.senderId,
    content: msg.content,
    created_at: msg.createdAt,
  });
}
