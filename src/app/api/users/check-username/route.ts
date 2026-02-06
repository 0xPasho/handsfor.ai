import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { users } from "@/modules/db/schema";

export async function GET(req: NextRequest) {
  const username = req.nextUrl.searchParams.get("username");
  if (!username) {
    return NextResponse.json({ error: "username param required" }, { status: 400 });
  }

  const uname = username.toLowerCase();
  if (uname.length < 3 || uname.length > 30 || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(uname)) {
    return NextResponse.json({ available: false, reason: "invalid" });
  }

  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, uname))
    .limit(1);

  return NextResponse.json({ available: !existing });
}
