import { NextResponse } from "next/server";
import { z } from "zod";
import { bearerFrom, identifyFromToken } from "@/lib/mcp/auth";
import { buildTools } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Plain-REST shim over the same MCP tools.
 *
 * For a bot that doesn't speak MCP — Hermes, an n8n flow, a shell script. It
 * runs the identical tool implementations with the identical per-user scoping,
 * so there's no second surface to keep in sync or secure separately.
 *
 *   GET  /api/bot                      → the tool list, as JSON
 *   POST /api/bot {tool, arguments}    → run one, get prose back
 */

const callSchema = z.object({
  tool: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
});

async function authenticate(request: Request) {
  const token = bearerFrom(request);
  if (!token) return null;
  return identifyFromToken(token);
}

const unauthorized = () =>
  NextResponse.json({ error: "A valid TurnKeep access token is required." }, { status: 401 });

export async function GET(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return unauthorized();

  const tools = buildTools(identity).map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    // The same schema the MCP clients see, so a bot author can read it here.
    arguments: Object.fromEntries(
      Object.entries(tool.inputSchema).map(([key, schema]) => [
        key,
        (schema as { description?: string }).description ?? "",
      ]),
    ),
  }));

  return NextResponse.json({
    connected_as: {
      name: identity.name,
      role: identity.role,
      read_only: identity.readOnly,
    },
    tools,
  });
}

export async function POST(request: Request) {
  const identity = await authenticate(request);
  if (!identity) return unauthorized();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body must be JSON" }, { status: 400 });
  }

  const parsed = callSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Send {\"tool\": \"list_tasks\", \"arguments\": {…}}" },
      { status: 400 },
    );
  }

  const tool = buildTools(identity).find((candidate) => candidate.name === parsed.data.tool);
  if (!tool) {
    return NextResponse.json(
      { error: `No tool called "${parsed.data.tool}". GET this endpoint for the list.` },
      { status: 404 },
    );
  }

  // Validate against the same schema the MCP clients are held to, rather than
  // trusting whatever the bot sent.
  const args = z.object(tool.inputSchema).safeParse(parsed.data.arguments);
  if (!args.success) {
    return NextResponse.json(
      {
        error: "Those arguments didn't validate",
        details: args.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
      },
      { status: 422 },
    );
  }

  try {
    const result = await tool.run(args.data);
    const textOut = result.content
      .filter((block) => block.type === "text")
      .map((block) => block.text ?? "")
      .join("\n");
    return NextResponse.json({ tool: parsed.data.tool, text: textOut });
  } catch (error) {
    // Tool errors are the person's answer ("only a manager can…"), not a 500.
    const message = error instanceof Error ? error.message : "That didn't work";
    return NextResponse.json({ tool: parsed.data.tool, error: message }, { status: 400 });
  }
}
