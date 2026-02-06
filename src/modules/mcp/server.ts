import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as tools from "./tools";

type User = {
  id: string;
  walletAddress: string;
  privyWalletId: string | null;
  privyUserId: string | null;
  externalWalletAddress: string | null;
  apiKey: string;
  balance: string;
  createdAt: Date | null;
};

export function createMcpServer(user: User): McpServer {
  const server = new McpServer({
    name: "handsfor-ai",
    version: "1.0.0",
  });

  server.tool(
    "create_task",
    "Post a new task for humans to complete. The USDC amount will be held in escrow until a winner is picked.",
    {
      description: z.string().describe("What you need a human to do. Be specific about location, timing, and what counts as proof."),
      amount: z.string().describe("USDC reward amount (e.g. '5.00')"),
      tags: z.array(z.string()).optional().describe("1-3 short tags describing the task (e.g. 'research', 'nyc', 'urgent')"),
      deadline_hours: z.number().optional().describe("Hours until deadline (e.g. 1, 2, 6, 12, 24)"),
    },
    async ({ description, amount, tags, deadline_hours }) => {
      try {
        const result = await tools.createTask(user as never, {
          description,
          amount,
          tags,
          deadline_hours,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to create task"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_tasks",
    "List tasks. Optionally filter by status (open, in_progress, submitted, completed, cancelled, disputed).",
    {
      status: z.string().optional().describe("Filter by task status"),
    },
    async ({ status }) => {
      try {
        const result = await tools.listTasks({ status });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to list tasks"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_task",
    "Get full task details including all submissions and their evidence.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
    },
    async ({ task_id }) => {
      try {
        const result = await tools.getTask({ task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to get task"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "pick_winner",
    "Select the winning submission for a task. This releases the escrowed USDC to the winner's wallet instantly.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      submission_id: z.string().describe("The ID of the winning submission (UUID)"),
    },
    async ({ task_id, submission_id }) => {
      try {
        const result = await tools.pickWinner(user as never, {
          task_id,
          submission_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to pick winner"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "cancel_task",
    "Cancel an open task and return escrowed USDC to the creator.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
    },
    async ({ task_id }) => {
      try {
        const result = await tools.cancelTask(user as never, { task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to cancel task"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "list_applications",
    "List applications for your task. Shows who wants to do the work, with their profile info.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
    },
    async ({ task_id }) => {
      try {
        const result = await tools.listApplications(user as never, { task_id });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to list applications"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "select_applicant",
    "Accept an applicant to work on your task. Only accepted applicants can submit work.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      application_id: z.string().describe("The application ID (UUID) to accept"),
    },
    async ({ task_id, application_id }) => {
      try {
        const result = await tools.selectApplicant(user as never, {
          task_id,
          application_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to select applicant"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "reject_applicant",
    "Reject an applicant for your task.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      application_id: z.string().describe("The application ID (UUID) to reject"),
    },
    async ({ task_id, application_id }) => {
      try {
        const result = await tools.rejectApplicant(user as never, {
          task_id,
          application_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to reject applicant"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_balance",
    "Check your USDC wallet balance and Yellow Network custody balance.",
    {},
    async () => {
      try {
        const result = await tools.getBalance(user as never);
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to get balance"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "send_message",
    "Send a message to a worker on your task. Each worker has a separate conversation.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      participant_id: z.string().describe("The worker's user ID (UUID) — from their application"),
      content: z.string().describe("The message to send"),
    },
    async ({ task_id, participant_id, content }) => {
      try {
        const result = await tools.sendMessage(user as never, {
          task_id,
          participant_id,
          content,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to send message"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "get_messages",
    "Get the conversation with a worker on your task.",
    {
      task_id: z.string().describe("The task ID (UUID)"),
      participant_id: z.string().describe("The worker's user ID (UUID)"),
    },
    async ({ task_id, participant_id }) => {
      try {
        const result = await tools.getMessages(user as never, {
          task_id,
          participant_id,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: "text" as const,
              text: `Error: ${err instanceof Error ? err.message : "Failed to get messages"}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  return server;
}
