import { NextRequest, NextResponse } from "next/server";
import { type Address } from "viem";
import { db } from "@/modules/db";
import { tasks } from "@/modules/db/schema";
import { authenticateUser } from "@/modules/users/auth";
import { createInitialTaskSession } from "@/modules/yellow/server/platform";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateUser(req);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const user = auth.user;

  let amount: string | undefined;
  let description: string | undefined;
  try {
    const body = await req.json();
    amount = body.amount;
    description = body.description;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
    return NextResponse.json({ error: "Valid amount is required" }, { status: 400 });
  }

  if (!user.privyWalletId) {
    return NextResponse.json(
      { error: "You need a server wallet to create tasks" },
      { status: 400 },
    );
  }

  // Create 2-party Yellow session (creator + platform)
  // User is authenticated on the platform's connection inside this call
  const { appSessionId } = await createInitialTaskSession({
    creatorAddress: user.walletAddress as Address,
    userId: user.id,
    privyWalletId: user.privyWalletId,
    amount,
  });

  // Create task in DB with session ID
  const [task] = await db
    .insert(tasks)
    .values({
      creatorId: user.id,
      amount,
      status: "open",
      description: description || null,
      appSessionId,
    })
    .returning();

  return NextResponse.json({ task });
}
