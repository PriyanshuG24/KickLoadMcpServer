import type { Request } from "express";
import { AsyncLocalStorage } from "node:async_hooks";
import config from "./config/index.js";
import type { KickLoadConfig } from "./types.js";

interface RequestContextStore {
    headers: Request["headers"];
}

const requestStore = new AsyncLocalStorage<RequestContextStore>();

export async function runWithRequestContext<T>(
    req: Request,
    fn: () => Promise<T>,
): Promise<T> {
    const headers = req.headers || {};

    return requestStore.run({ headers }, fn);
}

export function getRequestContext(): RequestContextStore | undefined {
    return requestStore.getStore();
}

export function getKickLoadConfigFromContext(): KickLoadConfig {
    const store = getRequestContext();
    const headers = store?.headers || {};

    const authHeader = headers.authorization || "";
    const bearerToken = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7).trim()
        : "";
    const xApiToken = headers["x-api-token"];

    const apiToken = String(xApiToken || bearerToken || "").trim();

    const baseUrl = String(config.kickloadBaseUrl).replace(/\/$/, "");

    if (!apiToken) {
        throw new Error(
            "Missing KickLoad API token. Send it as X-Api-Token header.",
        );
    }

    if (!baseUrl) {
        throw new Error("Missing KICKLOAD_BASE_URL environment variable.");
    }

    return { apiToken, baseUrl };
}
