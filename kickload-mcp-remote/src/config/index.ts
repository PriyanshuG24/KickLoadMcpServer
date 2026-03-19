import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
    PORT: z
        .string()
        .transform(Number)
        .default(() => 5000),
    NODE_ENV: z
        .enum(["development", "production", "test"])
        .default("development"),
    KICKLOAD_BASE_URL: z.string().default("https://api.neeyatai.com"),
    MCP_SERVER_SECRET: z.string().default("your-secret"),
});

export const env = envSchema.parse(process.env);
const config = {
    port: env.PORT,
    node_env: env.NODE_ENV,
    kickloadBaseUrl: env.KICKLOAD_BASE_URL.replace(/\/$/, ""),
    mcpServerSecret: env.MCP_SERVER_SECRET,
};

export default config;
