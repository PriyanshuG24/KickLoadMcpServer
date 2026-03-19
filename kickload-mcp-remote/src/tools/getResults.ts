import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { kickloadFetch, pollTaskUntilDone } from "../lib/kickloadClient.js";
import type {
    GetResultsArgs,
    AnalysisResponse,
    TaskStatusResponse,
    AnalysisMetrics,
    ToolResult,
    KickLoadConfig,
} from "../types.js";

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

    let parsedMetrics: AnalysisMetrics = {};
    let isDiagnostic = false;

    try {
        // Download PDF
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

        const pdfRes = await fetch(downloadData.download_url!);
        if (!pdfRes.ok) {
            throw new Error(`PDF download failed: ${pdfRes.statusText}`);
        }

        const pdfBuffer = Buffer.from(await pdfRes.arrayBuffer());
        const data = new Uint8Array(pdfBuffer);
        const loadingTask = pdfjsLib.getDocument({ data });
        const pdf = await loadingTask.promise;

        // Extract text from PDF
        let fullText = "";
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
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

            fullText += sortedLines.join("\n") + "\n";
        }

        // Parse metrics from PDF text
        parsedMetrics = parseKickLoadReport(fullText);
        isDiagnostic = parsedMetrics.avg_ms ? false : true;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : "Unknown PDF parse error";
        return err(`PDF parsing failed: ${message}`);
    }

    const failures: string[] = [];
    const m = parsedMetrics;
    const t = thresholds;

    if (t && Object.keys(m).length > 0) {
        // Only check thresholds for metrics that are actually available
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

        // Note: p95_ms and p99_ms thresholds are not supported since these metrics are not available in the PDF
        if (t.p95_ms !== undefined || t.p99_ms !== undefined) {
            failures.push(
                "p95/p99 thresholds not supported - these metrics are not available in the PDF report",
            );
        }
    }

    const lines: string[] = [
        `📊 Results — Task: ${task_id}`,
        `📁 JTL file: ${jtlFilename}`,
        ``,
    ];

    if (Object.keys(m).length > 0) {
        lines.push(
            ``,
            `┌─ Performance Metrics ────────────────────┐`,
            `│  Endpoint:     ${pad(m.endpoint ?? "—", 30)} │`,
            `│  Avg Response: ${pad(m.avg_ms ?? "—", 10)} ms                │`,
            `│  Throughput:   ${pad(m.throughput_rps?.toFixed(1) ?? "—", 10)} req/s             │`,
            `│  Total:        ${pad(m.total_requests ?? "—", 10)} requests           │`,
            `│  Error rate:   ${pad(m.error_rate_pct?.toFixed(2) ?? "—", 10)} %                 │`,
            `│  Min/Max:      ${pad(m.min_ms ?? "—", 5)}-${pad(m.max_ms ?? "—", 5)} ms              │`,
            `│  Std Dev:      ${pad(m.stddev_ms ?? "—", 10)} ms                │`,
            `└─────────────────────────────────────────┘`,
        );

        if (isDiagnostic) {
            lines.push(
                ``,
                `⚠️  Diagnostic Mode: Limited test data detected`,
                `💡 Consider increasing threads, duration, or loop count`,
            );
        }
    } else {
        lines.push(`⚠️  Could not parse metrics from PDF text`);
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

function parseKickLoadReport(text: string): AnalysisMetrics {
    const metrics: AnalysisMetrics = {};

    // Find the metrics table
    const lines = text
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);

    // Find header and data lines
    let headerIndex = -1;
    let dataIndex = -1;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        // Look for the line with "Endpoint" (header start)
        if (line.includes("Endpoint") && line.includes("Samples")) {
            headerIndex = i;
            continue;
        }

        // Look for the line with numbers (data)
        if (headerIndex !== -1 && /^\d+\s+/.test(line)) {
            dataIndex = i;
            break;
        }
    }

    if (
        headerIndex !== -1 &&
        dataIndex !== -1 &&
        dataIndex + 1 < lines.length
    ) {
        const dataLine = lines[dataIndex];
        const endpointLine = lines[dataIndex + 1];

        // Extract numbers from data line
        const numbers = dataLine.match(/\d+\.?\d*/g);

        if (numbers && numbers.length >= 10) {
            const [
                samples,
                avg_ms,
                min_ms,
                max_ms,
                stddev_ms,
                error_rate_pct,
                throughput_rps,
                received_kbps,
                sent_kbps,
                avg_bytes,
            ] = numbers.map(Number);

            // Extract endpoint (remove any leading numbers)
            const endpoint = endpointLine.replace(/^\d+\s*/, "").trim();

            // Assign parsed values
            metrics.endpoint = endpoint;
            metrics.total_requests = samples;
            metrics.avg_ms = avg_ms;
            metrics.min_ms = min_ms;
            metrics.max_ms = max_ms;
            metrics.stddev_ms = stddev_ms;
            metrics.error_rate_pct = error_rate_pct;
            metrics.throughput_rps = throughput_rps;
            metrics.received_kbps = received_kbps;
            metrics.sent_kbps = sent_kbps;
            metrics.avg_bytes = avg_bytes;
        }
    }

    return metrics;
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
