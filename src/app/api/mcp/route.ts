import { NextRequest } from "next/server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/modules/mcp/server";
import { authenticateUser } from "@/modules/users/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await authenticateUser(req);
  if (!auth.success) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: { code: -32000, message: auth.error },
        id: null,
      },
      { status: auth.status },
    );
  }

  const server = createMcpServer(auth.user);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function GET() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: { code: -32000, message: "Use POST for MCP messages" },
      id: null,
    },
    { status: 405 },
  );
}

export async function DELETE() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Stateless server — no sessions to terminate",
      },
      id: null,
    },
    { status: 405 },
  );
}
