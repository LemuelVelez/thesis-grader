
import { z } from "zod"

export function searchParamsToObject(sp: URLSearchParams) {
    const obj: Record<string, string> = {}
    for (const [key, value] of sp.entries()) obj[key] = value
    return obj
}

export function parseQuery<T extends z.ZodTypeAny>(schema: T, sp: URLSearchParams): z.infer<T> {
    const obj = searchParamsToObject(sp)
    return schema.parse(obj)
}

export function parseBody<T extends z.ZodTypeAny>(schema: T, body: unknown): z.infer<T> {
    return schema.parse(body)
}

export const zUuid = z.string().uuid()

export const zLimit = z.coerce.number().int().min(1).max(200).default(50)
export const zOffset = z.coerce.number().int().min(0).default(0)

export const zBoolFromString = z.preprocess((v) => {
    if (v === "true") return true
    if (v === "false") return false
    return v
}, z.boolean())

export const zDateTimeString = z
    .string()
    .min(1)
    .refine((v) => Number.isFinite(Date.parse(v)), { message: "Invalid datetime string" })

export function zNonEmptyString(fieldName = "value") {
    return z.string().trim().min(1, `${fieldName} is required`)
}
