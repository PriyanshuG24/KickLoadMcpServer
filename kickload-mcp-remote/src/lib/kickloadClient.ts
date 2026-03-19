import type { KickLoadConfig } from "../requestContext.js";

type JsonValue =
    | string
    | number
    | boolean
    | null
    | JsonValue[]
    | { [key: string]: JsonValue };

export async function kickloadFetch<T = any>(
    path: string,
    config: KickLoadConfig,
    options: RequestInit = {},
): Promise<T> {
    const url = `${config.baseUrl}${path}`;

    const headers: Record<string, string> = {
        "X-API-Token": config.apiToken,
        ...(options.headers instanceof Headers
            ? Object.fromEntries(options.headers.entries())
            : (options.headers as Record<string, string> | undefined)),
    };

    if (!(options.body instanceof FormData)) {
        headers["Content-Type"] = headers["Content-Type"] || "application/json";
    }

    const res = await fetch(url, {
        ...options,
        headers,
    });

    if (!res.ok) {
        let errMsg = `HTTP ${res.status} ${res.statusText}`;

        try {
            const body = (await res.json()) as Record<string, JsonValue>;
            errMsg = String(body.message || body.error || errMsg);
        } catch {
            // ignore json parse failure
        }

        throw new Error(`KickLoad API error [${path}]: ${errMsg}`);
    }

    return (await res.json()) as T;
}

interface TaskStatusResponse {
    status: string;
    message?: string;
    result_file?: string;
}

export async function pollTaskUntilDone(
    taskId: string,
    config: KickLoadConfig,
    maxWaitMs = 600000,
): Promise<TaskStatusResponse> {
    const start = Date.now();

    while (Date.now() - start < maxWaitMs) {
        const status = await kickloadFetch<TaskStatusResponse>(
            `/task-status/${taskId}`,
            config,
        );

        if (status.status === "success") return status;
        if (status.status === "error") {
            throw new Error(status.message || "Task failed");
        }

        await sleep(5000);
    }

    throw new Error(
        `Task ${taskId} did not complete within ${maxWaitMs / 1000}s`,
    );
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
