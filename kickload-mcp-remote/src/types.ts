export interface RunLoadTestArgs {
    jmx_filename: string;
    num_threads?: number;
    ramp_time?: number;
    duration?: number;
    loop_count?: number;
    startup_delay?: number;
    specify_thread_lifetime?: boolean;
}

export interface RunLoadTestApiResponse {
    status: string;
    task_id?: string;
    message?: string;
}

export interface ToolTextContent {
    type: "text";
    text: string;
}

export interface ToolResult {
    content: ToolTextContent[];
    isError?: boolean;
}

export interface GenerateTestPlanArgs {
    prompt: string;
}

export interface GenerateTestPlanApiResponse {
    status: string;
    jmx_filename?: string;
    message?: string;
}

export interface Thresholds {
    p95_ms?: number;
    p99_ms?: number;
    error_rate_pct?: number;
    min_throughput_rps?: number;
}

export interface GetResultsArgs {
    task_id: string;
    thresholds?: Thresholds;
}

export interface AnalysisMetrics {
    avg_ms?: number;
    throughput_rps?: number;
    total_requests?: number;
    error_rate_pct?: number;
    endpoint?: string;
    min_ms?: number;
    max_ms?: number;
    stddev_ms?: number;
    received_kbps?: number;
    sent_kbps?: number;
    avg_bytes?: number;
}

export interface AnalysisResponse {
    filename?: string;
    summary?: string;
    metrics?: AnalysisMetrics;
    error?: string;
    message?: string;
}

export interface TaskStatusResponse {
    result_file?: string;
}

export interface ToolTextContent {
    type: "text";
    text: string;
}

export interface KickLoadConfig {
    apiToken: string;
    baseUrl: string;
}
