/* eslint-disable @typescript-eslint/no-explicit-any */
import {
    GetBucketCorsCommand,
    PutBucketCorsCommand,
    type CORSRule,
} from "@aws-sdk/client-s3"
import { getS3Client } from "@/lib/s3"
import { env } from "@/lib/env"

let ensured = false
let ensuring: Promise<void> | null = null

function normalize(arr?: string[]) {
    return (arr ?? []).map((v) => v.trim()).filter(Boolean).sort()
}

function ruleMatches(a: CORSRule, b: CORSRule) {
    const am = normalize(a.AllowedMethods as string[])
    const bm = normalize(b.AllowedMethods as string[])
    const ah = normalize(a.AllowedHeaders as string[])
    const bh = normalize(b.AllowedHeaders as string[])
    const ao = normalize(a.AllowedOrigins as string[])
    const bo = normalize(b.AllowedOrigins as string[])
    const ae = normalize(a.ExposeHeaders as string[])
    const be = normalize(b.ExposeHeaders as string[])

    return (
        JSON.stringify(am) === JSON.stringify(bm) &&
        JSON.stringify(ah) === JSON.stringify(bh) &&
        JSON.stringify(ao) === JSON.stringify(bo) &&
        JSON.stringify(ae) === JSON.stringify(be) &&
        (a.MaxAgeSeconds ?? 0) === (b.MaxAgeSeconds ?? 0)
    )
}

function getAllowedOrigins(): string[] {
    // Add all app origins that upload directly to S3.
    // S3 CORS does NOT support wildcard subdomains like https://*.jrmsu-tc.cloud
    const defaults = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://thesis-grader.jrmsu-tc.cloud",
    ]

    const fromEnv = (env as any).S3_ALLOWED_ORIGINS as string | undefined
    if (!fromEnv) return defaults

    const parsed = fromEnv
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)

    return parsed.length ? parsed : defaults
}

function buildRequiredRule(): CORSRule {
    return {
        AllowedMethods: ["GET", "HEAD", "PUT"],
        AllowedOrigins: getAllowedOrigins(),
        AllowedHeaders: [
            "content-type",
            "x-amz-date",
            "x-amz-security-token",
            "x-amz-content-sha256",
            "authorization",
        ],
        ExposeHeaders: ["etag", "x-amz-request-id", "x-amz-id-2"],
        MaxAgeSeconds: 3000,
    }
}

export async function ensureS3CorsForDirectUploads(): Promise<void> {
    if (ensured) return
    if (ensuring) return ensuring

    ensuring = (async () => {
        const s3 = getS3Client()
        const bucket = env.S3_BUCKET_NAME
        const required = buildRequiredRule()

        let existingRules: CORSRule[] = []
        try {
            const current = await s3.send(new GetBucketCorsCommand({ Bucket: bucket }))
            existingRules = (current.CORSRules ?? []) as CORSRule[]
        } catch (err: any) {
            // No CORS configured yet -> AWS returns NoSuchCORSConfiguration
            if (err?.name !== "NoSuchCORSConfiguration") {
                throw err
            }
        }

        const alreadyHasRequired = existingRules.some((r) => ruleMatches(r, required))
        if (!alreadyHasRequired) {
            const merged: CORSRule[] = [...existingRules, required]
            await s3.send(
                new PutBucketCorsCommand({
                    Bucket: bucket,
                    CORSConfiguration: { CORSRules: merged },
                })
            )
        }

        ensured = true
    })()

    try {
        await ensuring
    } finally {
        ensuring = null
    }
}
