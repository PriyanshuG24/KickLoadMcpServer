import express, { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import config from "./config/index.js";

import { generateTestPlan } from "./tools/generatePlan.js";
import { runLoadTest } from "./tools/runLoadTest.js";
import { getResults } from "./tools/getResults.js";
import {
    runWithRequestContext,
    getKickLoadConfigFromContext,
} from "./requestContext.js";

const app = express();
app.use(express.json({ limit: "10mb" }));

const PORT = Number(config.port);
const HOST = "0.0.0.0";

const MCP_SERVER_SECRET = config.mcpServerSecret;

type SessionTransport = StreamableHTTPServerTransport;
const transports = new Map<string, SessionTransport>();

function validateMcpServerAuth(
    req: Request,
    res: Response,
    next: NextFunction,
): void {
    if (!MCP_SERVER_SECRET) {
        next();
        return;
    }

    const auth = req.headers.authorization || "";
    const expected = `Bearer ${MCP_SERVER_SECRET}`;

    if (auth !== expected) {
        res.status(401).json({ error: "Unauthorized MCP access" });
        return;
    }

    next();
}

function buildServer(): McpServer {
    const server = new McpServer(
        { name: "kickload-mcp", version: "1.0.0" },
        { capabilities: { tools: {} } },
    );

    server.registerTool(
        "generate_test_plan",
        {
            description:
                "Generate a JMeter .jmx test plan from a plain-English description. Returns a jmx_filename to pass into run_load_test.",
            inputSchema: z.object({
                prompt: z
                    .string()
                    .describe(
                        'Example: "Test POST https://api.example.com/login with 100 users for 60 seconds"',
                    ),
            }),
        },
        async (args) => {
            const config = getKickLoadConfigFromContext();
            const result = await generateTestPlan(args, config);

            return {
                content: result.content,
                _meta: {},
                isError: result.isError ?? false,
            };
        },
    );

    server.registerTool(
        "run_load_test",
        {
            description:
                "Execute a test plan by filename and return a task_id for get_results.",
            inputSchema: z.object({
                jmx_filename: z.string(),
                num_threads: z.number().optional(),
                ramp_time: z.number().optional(),
                duration: z.number().optional(),
                loop_count: z.number().optional(),
                startup_delay: z.number().optional(),
            }),
        },
        async (args) => {
            const config = getKickLoadConfigFromContext();
            const result = await runLoadTest(args, config);

            return {
                content: result.content,
                _meta: {},
                isError: result.isError ?? false,
            };
        },
    );

    server.registerTool(
        "get_results",
        {
            description:
                "Poll task status until complete, then analyze the JTL results. Optionally validate thresholds.",
            inputSchema: z.object({
                task_id: z.string(),
                thresholds: z
                    .object({
                        p95_ms: z.number().optional(),
                        p99_ms: z.number().optional(),
                        error_rate_pct: z.number().optional(),
                        min_throughput_rps: z.number().optional(),
                    })
                    .optional(),
            }),
        },
        async (args) => {
            const config = getKickLoadConfigFromContext();
            const result = await getResults(args, config);

            return {
                content: result.content,
                _meta: {},
                isError: result.isError ?? false,
            };
        },
    );

    return server;
}

app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({
        ok: true,
        service: "kickload-mcp",
        transport: "streamable-http",
    });
});

app.use("/mcp", validateMcpServerAuth);

app.post("/mcp", async (req: Request, res: Response) => {
    try {
        await runWithRequestContext(req, async () => {
            const sessionIdHeader = req.headers["mcp-session-id"];
            const sessionId =
                typeof sessionIdHeader === "string"
                    ? sessionIdHeader
                    : undefined;

            let transport: SessionTransport | undefined;

            if (sessionId && transports.has(sessionId)) {
                transport = transports.get(sessionId);
            } else if (!sessionId && isInitializeRequest(req.body)) {
                transport = new StreamableHTTPServerTransport({
                    sessionIdGenerator: () => randomUUID(),
                    onsessioninitialized: (newSessionId: string) => {
                        if (transport) {
                            transports.set(newSessionId, transport);
                        }
                    },
                });

                transport.onclose = async () => {
                    if (transport?.sessionId) {
                        transports.delete(transport.sessionId);
                    }
                };

                const server = buildServer();
                await server.connect(transport);
            } else {
                res.status(400).json({
                    jsonrpc: "2.0",
                    error: {
                        code: -32000,
                        message: "Bad Request: No valid session ID provided",
                    },
                    id: null,
                });
                return;
            }

            await transport?.handleRequest(req, res, req.body);
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";
        res.status(500).json({
            jsonrpc: "2.0",
            error: {
                code: -32603,
                message,
            },
            id: null,
        });
    }
});

app.get("/mcp", async (req: Request, res: Response) => {
    try {
        await runWithRequestContext(req, async () => {
            const sessionIdHeader = req.headers["mcp-session-id"];
            const sessionId =
                typeof sessionIdHeader === "string"
                    ? sessionIdHeader
                    : undefined;

            if (!sessionId || !transports.has(sessionId)) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }

            const transport = transports.get(sessionId)!;
            await transport.handleRequest(req, res);
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";
        res.status(500).send(message);
    }
});

app.delete("/mcp", async (req: Request, res: Response) => {
    try {
        await runWithRequestContext(req, async () => {
            const sessionIdHeader = req.headers["mcp-session-id"];
            const sessionId =
                typeof sessionIdHeader === "string"
                    ? sessionIdHeader
                    : undefined;

            if (!sessionId || !transports.has(sessionId)) {
                res.status(400).send("Invalid or missing session ID");
                return;
            }

            const transport = transports.get(sessionId)!;
            await transport.handleRequest(req, res);
        });
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Internal server error";
        res.status(500).send(message);
    }
});

app.listen(PORT, HOST, () => {
    console.log(`✅ KickLoad MCP running on http://${HOST}:${PORT}`);
});
