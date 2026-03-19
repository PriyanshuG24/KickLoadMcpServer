import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { kickloadFetch, pollTaskUntilDone } from "../lib/kickloadClient.js";
import type { KickLoadConfig } from "../requestContext.js";

interface Thresholds {
    p95_ms?: number;
    p99_ms?: number;
    error_rate_pct?: number;
    min_throughput_rps?: number;
}

interface GetResultsArgs {
    task_id: string;
    thresholds?: Thresholds;
}

interface AnalysisMetrics {
    p95_ms?: number;
    p99_ms?: number;
    avg_ms?: number;
    throughput_rps?: number;
    total_requests?: number;
    error_rate_pct?: number;
}

interface AnalysisResponse {
    filename?: string;
    summary?: string;
    metrics?: AnalysisMetrics;
    error?: string;
    message?: string;
}

interface TaskStatusResponse {
    result_file?: string;
}

interface ToolTextContent {
    type: "text";
    text: string;
}

interface ToolResult {
    content: ToolTextContent[];
    isError?: boolean;
}

export async function getResults(
    args: GetResultsArgs,
    config: KickLoadConfig,
): Promise<ToolResult> {
    const { task_id, thresholds } = args;

    if (!task_id?.trim()) {
        return err(
            "task_id is required — use the value returned by run_load_test",
        );
    }

    let taskStatus: TaskStatusResponse;

    try {
        taskStatus = await pollTaskUntilDone(task_id, config);
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return err(`Test run failed or timed out: ${message}`);
    }

    const jtlFilename = taskStatus.result_file;

    if (!jtlFilename) {
        return err(
            `Test completed but no result_file was returned. Raw: ${JSON.stringify(taskStatus)}`,
        );
    }

    let analysis: AnalysisResponse;

    try {
        analysis = await kickloadFetch<AnalysisResponse>(
            "/analyzeJTL",
            config,
            {
                method: "POST",
                body: JSON.stringify({ filename: jtlFilename }),
            },
        );
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown error occurred";
        return err(`Analysis request failed: ${message}`);
    }

    if (!analysis.filename) {
        return err(
            `Analysis failed: ${analysis.error || JSON.stringify(analysis)}`,
        );
    }

    let pdfSection = "";

    try {
        const downloadRes = await fetch(
            `${config.baseUrl}/download/${analysis.filename}`,
            {
                headers: {
                    "X-API-Token": config.apiToken,
                },
            },
        );

        if (!downloadRes.ok) {
            throw new Error(`Download URL failed: ${downloadRes.statusText}`);
        }

        const downloadData = (await downloadRes.json()) as {
            download_url?: string;
        };
        if (!downloadData.download_url) {
            throw new Error("download_url missing in response");
        }

        const pdfRes = await fetch(downloadData.download_url);
        if (!pdfRes.ok) {
            throw new Error(`PDF download failed: ${pdfRes.statusText}`);
        }

        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());

        const data = new Uint8Array(pdfBuffer);
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        let fullText = "";

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();

            const lines: Record<number, string[]> = {};

            for (const item of textContent.items as Array<any>) {
                if (!("str" in item) || !("transform" in item)) continue;

                const y = Math.round(item.transform[5]);
                if (!lines[y]) lines[y] = [];
                lines[y].push(item.str);
            }

            const sortedLines = Object.keys(lines)
                .sort((a, b) => Number(b) - Number(a))
                .map((y) => lines[Number(y)].join(" "));

            fullText += `${sortedLines.join("\n")}\n`;
        }

        pdfSection = [
            `📄 PDF Report: ${analysis.filename}`,
            `📏 Size: ${(pdfBuffer.byteLength / 1024).toFixed(1)} KB`,
            `📝 Pages parsed: ${pdf.numPages}`,
            `🗒️ Extracted chars: ${fullText.length}`,
            ``,
            `================================================================================`,
            fullText,
            `================================================================================`,
        ].join("\n");
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown PDF parse error";
        pdfSection = [
            `📄 PDF Report: ${analysis.filename}`,
            `⚠️ Could not parse PDF: ${message}`,
        ].join("\n");
    }

    const failures: string[] = [];
    const m = analysis.metrics;
    const t = thresholds;

    if (t && m) {
        if (
            t.p95_ms !== undefined &&
            m.p95_ms !== undefined &&
            m.p95_ms > t.p95_ms
        ) {
            failures.push(`p95 ${m.p95_ms}ms > threshold ${t.p95_ms}ms`);
        }

        if (
            t.p99_ms !== undefined &&
            m.p99_ms !== undefined &&
            m.p99_ms > t.p99_ms
        ) {
            failures.push(`p99 ${m.p99_ms}ms > threshold ${t.p99_ms}ms`);
        }

        if (
            t.error_rate_pct !== undefined &&
            m.error_rate_pct !== undefined &&
            m.error_rate_pct > t.error_rate_pct
        ) {
            failures.push(
                `errors ${m.error_rate_pct.toFixed(2)}% > ${t.error_rate_pct}%`,
            );
        }

        if (
            t.min_throughput_rps !== undefined &&
            m.throughput_rps !== undefined &&
            m.throughput_rps < t.min_throughput_rps
        ) {
            failures.push(
                `throughput ${m.throughput_rps.toFixed(1)} rps < ${t.min_throughput_rps}`,
            );
        }
    }

    const lines: string[] = [
        `📊 Results — Task: ${task_id}`,
        `📁 JTL file: ${jtlFilename}`,
        ``,
        pdfSection,
    ];

    if (m) {
        lines.push(
            ``,
            `┌─ API metrics ───────────────────────────┐`,
            `│  p95:  ${pad(m.p95_ms ?? "—")} ms                      │`,
            `│  p99:  ${pad(m.p99_ms ?? "—")} ms                      │`,
            `│  avg:  ${pad(m.avg_ms ?? "—")} ms                      │`,
            `└─────────────────────────────────────────┘`,
            ``,
            `┌─ Load ──────────────────────────────────┐`,
            `│  Throughput:  ${pad(m.throughput_rps?.toFixed(1) ?? "—")} req/s            │`,
            `│  Total:       ${pad(m.total_requests ?? "—")} requests          │`,
            `│  Error rate:  ${pad(m.error_rate_pct?.toFixed(2) ?? "—")} %                │`,
            `└─────────────────────────────────────────┘`,
        );
    }

    if (analysis.summary) {
        lines.push(``, `🤖 AI Summary:`, analysis.summary);
    }

    if (thresholds) {
        lines.push(
            ``,
            failures.length === 0
                ? `✅ All thresholds PASSED`
                : `❌ Threshold failures (${failures.length}):\n${failures
                      .map((f) => `   • ${f}`)
                      .join("\n")}`,
        );
    }

    return {
        content: [{ type: "text", text: lines.join("\n") }],
    };
}

function pad(val: string | number, width = 8): string {
    return String(val).padEnd(width);
}

function err(msg: string): ToolResult {
    return {
        content: [{ type: "text", text: `❌ ${msg}` }],
        isError: true,
    };
}
