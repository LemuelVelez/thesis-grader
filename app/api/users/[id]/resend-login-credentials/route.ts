import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { randomBytes } from "node:crypto"

import { UserController } from "@/database/controllers/UserController"
import { resolveDatabaseServices } from "@/database/services/resolver"
import { sendLoginDetailsEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEMP_PASSWORD_CHARS =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"

type BasicUser = {
    id: string
    name: string
    email: string
}

type RouteParams = {
    id?: string
}

type RouteContext = {
    params: Promise<RouteParams> | RouteParams
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function isCallable(value: unknown): value is (...args: unknown[]) => unknown {
    return typeof value === "function"
}

function isBasicUser(value: unknown): value is BasicUser {
    if (!isRecord(value)) return false
    return (
        typeof value.id === "string" &&
        typeof value.name === "string" &&
        typeof value.email === "string"
    )
}

function toBasicUser(value: unknown): BasicUser | null {
    if (isBasicUser(value)) return value

    if (isRecord(value) && "item" in value) {
        const item = value.item
        if (isBasicUser(item)) return item
    }

    return null
}

function generateTemporaryPassword(length = 12): string {
    const bytes = randomBytes(length)
    let out = ""
    for (let i = 0; i < length; i += 1) {
        out += TEMP_PASSWORD_CHARS[bytes[i] % TEMP_PASSWORD_CHARS.length]
    }
    return out
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : "Unknown error."
}

async function findUserById(users: UserController, id: string): Promise<BasicUser | null> {
    const source = users as unknown as Record<string, unknown>
    const methodNames = [
        "getById",
        "findById",
        "readById",
        "get",
        "getOne",
        "findOneById",
        "detail",
    ]

    for (const name of methodNames) {
        const maybeFn = source[name]
        if (!isCallable(maybeFn)) continue

        const result = await Promise.resolve(maybeFn.call(users, id))
        if (result == null) return null

        const parsed = toBasicUser(result)
        if (parsed) return parsed
    }

    throw new Error("UserController does not expose a supported read-by-id method.")
}

async function updateUserPasswordHash(
    users: UserController,
    id: string,
    passwordHash: string,
): Promise<void> {
    const source = users as unknown as Record<string, unknown>
    const methodNames = ["update", "patch", "updateById", "edit"]
    let lastError: unknown = null

    for (const name of methodNames) {
        const maybeFn = source[name]
        if (!isCallable(maybeFn)) continue

        const attempts: unknown[][] = [
            [id, { password_hash: passwordHash }],
            [id, { passwordHash }],
            [{ id, password_hash: passwordHash }],
            [{ id, passwordHash }],
        ]

        for (const args of attempts) {
            try {
                await Promise.resolve(maybeFn.call(users, ...args))
                return
            } catch (error) {
                lastError = error
            }
        }
    }

    if (lastError) {
        throw lastError
    }

    throw new Error("UserController does not expose a supported update method.")
}

export async function POST(req: NextRequest, context: RouteContext) {
    const params = await context.params
    const userId = params?.id?.trim()

    if (!userId) {
        return NextResponse.json({ error: "User id is required." }, { status: 400 })
    }

    let body: Record<string, unknown> = {}
    try {
        const parsed = await req.json()
        if (isRecord(parsed)) body = parsed
    } catch {
        // Optional body only; safe to ignore when empty.
    }

    const loginUrlFromBody =
        typeof body.loginUrl === "string" ? body.loginUrl.trim() : ""
    const loginUrl = loginUrlFromBody || `${req.nextUrl.origin}/login`

    try {
        const services = await resolveDatabaseServices()
        const users = new UserController(services)

        const user = await findUserById(users, userId)
        if (!user) {
            return NextResponse.json({ error: "User not found." }, { status: 404 })
        }

        if (!BASIC_EMAIL_REGEX.test(user.email)) {
            return NextResponse.json(
                { error: "User email is invalid. Please update the user email first." },
                { status: 400 },
            )
        }

        const plainPassword = generateTemporaryPassword(12)
        const password_hash = await hash(plainPassword, 12)

        await updateUserPasswordHash(users, user.id, password_hash)

        try {
            await sendLoginDetailsEmail({
                to: user.email,
                name: user.name,
                email: user.email,
                password: plainPassword,
                loginUrl,
            })
        } catch (emailError) {
            return NextResponse.json(
                {
                    error: "Password was reset, but failed to send login details email.",
                    message: getErrorMessage(emailError),
                },
                { status: 500 },
            )
        }

        return NextResponse.json(
            {
                message: "Login credentials were resent successfully.",
            },
            { status: 200 },
        )
    } catch (error) {
        return NextResponse.json(
            {
                error: "Failed to resend login credentials.",
                message: getErrorMessage(error),
            },
            { status: 500 },
        )
    }
}
