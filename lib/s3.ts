/* eslint-disable @typescript-eslint/no-explicit-any */
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { env } from "@/lib/env"
import { ensureS3CorsForDirectUploads } from "@/lib/s3-cors"

let client: S3Client | null = null

export function getS3Client() {
    if (client) return client

    // If running on IAM role in prod, credentials can be omitted.
    const hasStaticCreds = !!env.AWS_ACCESS_KEY_ID && !!env.AWS_SECRET_ACCESS_KEY

    const config: ConstructorParameters<typeof S3Client>[0] = {
        region: env.AWS_REGION,
        credentials: hasStaticCreds
            ? {
                accessKeyId: env.AWS_ACCESS_KEY_ID,
                secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
            }
            : undefined,
    }

        // Reduces extra checksum signing headers/params on presigned PUT URLs
        // which helps avoid stricter browser preflight/header mismatches.
        ; (config as any).requestChecksumCalculation = "WHEN_REQUIRED"

    client = new S3Client(config)
    return client
}

export async function createPresignedPutUrl(opts: {
    key: string
    contentType: string
    expiresInSeconds?: number
}) {
    // ✅ Ensure bucket CORS once for whole app before generating direct-upload URLs
    await ensureS3CorsForDirectUploads()

    const s3 = getS3Client()
    const cmd = new PutObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: opts.key,
        ContentType: opts.contentType,
    })

    const url = await getSignedUrl(s3, cmd, { expiresIn: opts.expiresInSeconds ?? 60 })
    return url
}

export async function createPresignedGetUrl(opts: {
    key: string
    expiresInSeconds?: number
    responseContentDisposition?: string
    responseContentType?: string
}) {
    const s3 = getS3Client()

    const cmd = new GetObjectCommand({
        Bucket: env.S3_BUCKET_NAME,
        Key: opts.key,
        ResponseContentDisposition: opts.responseContentDisposition,
        ResponseContentType: opts.responseContentType,
    })

    // ✅ default to 300 seconds (matches your example)
    const url = await getSignedUrl(s3, cmd, { expiresIn: opts.expiresInSeconds ?? 300 })
    return url
}
