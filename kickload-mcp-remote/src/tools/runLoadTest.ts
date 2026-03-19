import { kickloadFetch } from "../lib/kickloadClient.js";
import type { KickLoadConfig } from "../requestContext.js";

interface RunLoadTestArgs {
    jmx_filename: string;
    num_threads?: number;
    ramp_time?: number;
    duration?: number;
    loop_count?: number;
    startup_delay?: number;
    specify_thread_lifetime?: boolean;
}

interface RunLoadTestApiResponse {
    status: string;
    task_id?: string;
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

export async function runLoadTest(
    args: RunLoadTestArgs,
    config: KickLoadConfig,
): Promise<ToolResult> {
    const { jmx_filename, ...opts } = args;

    if (!jmx_filename?.trim()) {
        return err(
            "jmx_filename is required — use the value returned by generate_test_plan",
        );
    }

    const params = {
        num_threads: opts.num_threads ?? 10,
        ramp_time: opts.ramp_time ?? 30,
        loop_count: opts.loop_count ?? 1,
        duration: opts.duration ?? 60,
        specify_thread_lifetime: opts.specify_thread_lifetime ?? false,
        startup_delay: opts.startup_delay ?? 0,
    };

    let response: RunLoadTestApiResponse;

    try {
        response = await kickloadFetch<RunLoadTestApiResponse>(
            `/run-test/${encodeURIComponent(jmx_filename)}`,
            config,
            {
                method: "POST",
                body: JSON.stringify(params),
            },
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return err(`Test failed to start: ${message}`);
    }

    if (response.status !== "started" || !response.task_id) {
        return err(
            `Test failed to start: ${response.message || JSON.stringify(response)}`,
        );
    }

    return {
        content: [
            {
                type: "text",
                text: [
                    `🚀 Load test started!`,
                    ``,
                    `🆔 Task ID:    ${response.task_id}`,
                    `📄 JMX file:  ${jmx_filename}`,
                    ``,
                    `⚙️ Parameters:`,
                    `   Threads:   ${params.num_threads}`,
                    `   Ramp time: ${params.ramp_time}s`,
                    `   Duration:  ${params.duration}s`,
                    `   Loops:     ${params.loop_count}`,
                    ``,
                    `Next step — poll for results:`,
                    `  get_results({ task_id: "${response.task_id}" })`,
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
