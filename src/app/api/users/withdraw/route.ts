import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { authenticateUser } from "@/modules/users/auth";
import { withdrawFromYellow, withdrawFromYellowTestnet } from "@/modules/yellow/server/funds";
import { getYellowUnifiedBalance } from "@/modules/yellow/server/balance";
import { serverData } from "@/modules/general/utils/server-constants";
import { db } from "@/modules/db";
import { withdrawals } from "@/modules/db/schema";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = await authenticateUser(req);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const { user } = auth;

  if (!user.privyWalletId) {
    return NextResponse.json(
      { error: "No server wallet found. Cannot withdraw." },
      { status: 400 },
    );
  }

  let amount: string;
  let destinationAddress: string;

  try {
    const body = await req.json();
    amount = body.amount;
    destinationAddress = body.destination_address;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!amount || !destinationAddress) {
    return NextResponse.json(
      { error: "amount and destination_address are required" },
      { status: 400 },
    );
  }

  if (parseFloat(amount) <= 0) {
    return NextResponse.json(
      { error: "Amount must be positive" },
      { status: 400 },
    );
  }

  if (!/^0x[a-fA-F0-9]{40}$/.test(destinationAddress)) {
    return NextResponse.json(
      { error: "Invalid destination address" },
      { status: 400 },
    );
  }

  // Check Yellow balance before proceeding
  try {
    const available = await getYellowUnifiedBalance(user.id, user.privyWalletId, user.walletAddress);
    if (parseFloat(available) < parseFloat(amount)) {
      return NextResponse.json(
        { error: "Insufficient balance", available, requested: amount },
        { status: 402 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Could not verify balance" },
      { status: 500 },
    );
  }

  // Create pending withdrawal record
  const [withdrawal] = await db
    .insert(withdrawals)
    .values({
      userId: user.id,
      amount,
      destinationAddress,
      status: "pending",
    })
    .returning();

  try {
    const withdraw = serverData.isTestnet ? withdrawFromYellowTestnet : withdrawFromYellow;
    const result = await withdraw({
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount,
      destinationAddress,
    });

    // Update withdrawal record with tx hashes
    await db
      .update(withdrawals)
      .set({
        custodyTxHash: result.custodyTxHash,
        transferTxHash: result.txHash,
        status: "completed",
        completedAt: new Date(),
      })
      .where(eq(withdrawals.id, withdrawal.id));

    return NextResponse.json({
      withdrawal_id: withdrawal.id,
      custody_tx_hash: result.custodyTxHash,
      transfer_tx_hash: result.txHash,
      amount,
      destination: destinationAddress,
    });
  } catch (err) {
    console.error("Withdrawal failed:", err);

    // Mark withdrawal as failed
    await db
      .update(withdrawals)
      .set({ status: "failed" })
      .where(eq(withdrawals.id, withdrawal.id));

    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Withdrawal failed" },
      { status: 500 },
    );
  }
}
