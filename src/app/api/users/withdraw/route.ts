import { NextRequest, NextResponse } from "next/server";
import { authenticateUser } from "@/modules/users/auth";
import { withdrawFromYellow, withdrawFromYellowTestnet } from "@/modules/yellow/server/funds";
import { serverData } from "@/modules/general/utils/server-constants";

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

  try {
    const withdraw = serverData.isTestnet ? withdrawFromYellowTestnet : withdrawFromYellow;
    const result = await withdraw({
      privyWalletId: user.privyWalletId,
      walletAddress: user.walletAddress,
      amount,
      destinationAddress,
    });

    return NextResponse.json({
      tx_hash: result.txHash,
      amount,
      destination: destinationAddress,
    });
  } catch (err) {
    console.error("Withdrawal failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Withdrawal failed" },
      { status: 500 },
    );
  }
}
