import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { bearerFrom, identifyFromToken } from "@/lib/mcp/auth";
import { buildServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * The MCP endpoint — one URL that Claude, ChatGPT, Hermes or anything else
 * speaking MCP can connect to.
 *
 * Stateless: a server and transport are built per request from the identity on
 * the bearer token. That costs a little setup per call but means no session
 * affinity, so this runs unchanged behind a load balancer or on serverless,
 * where a long-lived in-memory session would break as soon as a second
 * instance appeared.
 */

function unauthorized(): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32001, message: "A valid TurnKeep access token is required." },
      id: null,
    }),
    {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        // Points a client at where to get one, per the MCP auth guidance.
        "WWW-Authenticate": 'Bearer realm="TurnKeep", error="invalid_token"',
      },
    },
  );
}

async function handle(request: Request): Promise<Response> {
  const token = bearerFrom(request);
  if (!token) return unauthorized();

  const identity = await identifyFromToken(token);
  if (!identity) return unauthorized();

  const server = buildServer(identity);
  const transport = new WebStandardStreamableHTTPServerTransport({
    // Stateless mode — no session id generator.
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  // Don't close the transport here: handleRequest resolves as soon as the
  // Response object exists, while its body is still streaming. Closing at that
  // point truncates the stream and the client sits waiting until it times out.
  // The transport tears itself down when the request's stream ends.
  return transport.handleRequest(request);
}

export const POST = handle;
export const GET = handle;
export const DELETE = handle;
