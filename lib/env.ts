export const env = {
    DATABASE_URL: process.env.DATABASE_URL ?? "",
    DATABASE_SSL: (process.env.DATABASE_SSL ?? "false").toLowerCase() === "true",

    GMAIL_USER: process.env.GMAIL_USER ?? "",
    GMAIL_APP_PASSWORD: process.env.GMAIL_APP_PASSWORD ?? "",

    AWS_REGION: process.env.AWS_REGION ?? "",
    S3_BUCKET_NAME: process.env.S3_BUCKET_NAME ?? "",
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "",

    // Used for reset links; you can set this in env. Fallback is localhost.
    APP_URL: process.env.APP_URL ?? "http://localhost:3000",

    NODE_ENV: process.env.NODE_ENV ?? "development",
}

type EnvKey = keyof typeof env

export const isProd = env.NODE_ENV === "production"

export function assertServerEnv(
    required: readonly EnvKey[] = ["DATABASE_URL"] as const,
) {
    const missing = required.filter((k) => !env[k])
    if (missing.length) {
        throw new Error(`Missing required env vars: ${missing.join(", ")}`)
    }
}
