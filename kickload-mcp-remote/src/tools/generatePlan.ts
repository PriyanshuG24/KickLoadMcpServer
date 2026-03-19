import { kickloadFetch } from "../lib/kickloadClient.js";
import type { KickLoadConfig } from "../requestContext.js";

interface GenerateTestPlanArgs {
    prompt: string;
}

interface GenerateTestPlanApiResponse {
    status: string;
    jmx_filename?: string;
    message?: string;
}

interface ToolTextContent {
    type: "text";
    text: string;
}

interface ToolResult {
    content: ToolTextContent[];
    isError?: boolean;
}

export async function generateTestPlan(
    args: GenerateTestPlanArgs,
    config: KickLoadConfig,
): Promise<ToolResult> {
    const { prompt } = args;

    if (!prompt?.trim()) {
        return err("prompt is required for generate_test_plan");
    }

    let response: GenerateTestPlanApiResponse;

    try {
        response = await kickloadFetch<GenerateTestPlanApiResponse>(
            "/generate-test-plan",
            config,
            {
                method: "POST",
                body: JSON.stringify({ prompt: prompt.trim() }),
            },
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return err(`Test plan generation failed: ${message}`);
    }

    if (response.status !== "success" || !response.jmx_filename) {
        return err(
            `Test plan generation failed: ${response.message || JSON.stringify(response)}`,
        );
    }

    return {
        content: [
            {
                type: "text",
                text: [
                    `✅ Test plan generated successfully.`,
                    ``,
                    `📄 JMX filename: ${response.jmx_filename}`,
                    ``,
                    `Next step — run the test:`,
                    `  run_load_test({ jmx_filename: "${response.jmx_filename}" })`,
                    ``,
                    `Optional run parameters:`,
                    `  num_threads, ramp_time, duration, loop_count`,
                    `  (defaults: 10 threads, 30s ramp, 60s duration, 1 loop)`,
                ].join("\n"),
            },
        ],
    };
}

function err(msg: string): ToolResult {
    return {
        content: [{ type: "text", text: `❌ ${msg}` }],
        isError: true,
    };
}
