import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { users } from "@/modules/db/schema";
import { randomBytes } from "crypto";

/**
 * Generate a unique username for a new user.
 * Format: human-{random5chars}
 * Retries with longer suffix if collision occurs.
 */
export async function generateUniqueUsername(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const suffix = randomBytes(3).toString("hex").slice(0, 5 + attempt);
    const candidate = `human-${suffix}`;
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.username, candidate))
      .limit(1);
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback
  return `human-${randomBytes(8).toString("hex")}`;
}
