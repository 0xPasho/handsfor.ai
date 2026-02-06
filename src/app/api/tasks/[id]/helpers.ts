import { NextRequest, NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/modules/db";
import { tasks, users } from "@/modules/db/schema";
import { authenticateUser } from "@/modules/users/auth";

type User = typeof users.$inferSelect;
type Task = typeof tasks.$inferSelect;

export type AuthedTaskContext = {
  user: User;
  task: Task;
};

/**
 * Authenticate the request and load the task by ID.
 * Returns the user and task, or a NextResponse error.
 */
export async function getAuthedTask(
  req: NextRequest,
  taskId: string,
): Promise<AuthedTaskContext | NextResponse> {
  const auth = await authenticateUser(req);
  if (!auth.success) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const [task] = await db
    .select()
    .from(tasks)
    .where(eq(tasks.id, taskId))
    .limit(1);

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return { user: auth.user, task };
}
