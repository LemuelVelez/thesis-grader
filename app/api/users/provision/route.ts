import { NextRequest, NextResponse } from "next/server"
import { hash } from "bcryptjs"
import { randomBytes } from "node:crypto"

import { UserController } from "@/database/controllers/UserController"
import {
    THESIS_ROLES,
    USER_STATUSES,
    type ThesisRole,
    type UserInsert,
    type UserStatus,
} from "@/database/models/Model"
import { resolveDatabaseServices } from "@/database/services/resolver"
import { sendLoginDetailsEmail } from "@/lib/email"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

const BASIC_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const TEMP_PASSWORD_CHARS =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*"

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
}

function toRole(value: unknown): ThesisRole | null {
    if (typeof value !== "string") return null
    const normalized = value.trim().toLowerCase()
    return (THESIS_ROLES as readonly string[]).includes(normalized)
        ? (normalized as ThesisRole)
        : null
}

function toStatus(value: unknown): UserStatus | null {
    if (typeof value !== "string") return null
    const normalized = value.trim().toLowerCase()
    return (USER_STATUSES as readonly string[]).includes(normalized)
        ? (normalized as UserStatus)
        : null
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

export async function POST(req: NextRequest) {
    let body: unknown

    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    }

    if (!isRecord(body)) {
        return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
    }

    const name = typeof body.name === "string" ? body.name.trim() : ""
    const emailRaw = typeof body.email === "string" ? body.email.trim() : ""
    const email = emailRaw.toLowerCase()

    if (!name) {
        return NextResponse.json({ error: "name is required." }, { status: 400 })
    }

    if (!email) {
        return NextResponse.json({ error: "email is required." }, { status: 400 })
    }

    if (!BASIC_EMAIL_REGEX.test(email)) {
        return NextResponse.json({ error: "email must be a valid email address." }, { status: 400 })
    }

    const role = toRole(body.role) ?? "student"
    const status = toStatus(body.status) ?? "active"

    const providedPassword =
        typeof body.password === "string" ? body.password.trim() : ""

    if (providedPassword && providedPassword.length < 8) {
        return NextResponse.json(
            { error: "password must be at least 8 characters if provided." },
            { status: 400 },
        )
    }

    const plainPassword = providedPassword || generateTemporaryPassword(12)
    const password_hash = await hash(plainPassword, 12)

    const payload: UserInsert = {
        name,
        email,
        role,
        status,
        password_hash,
        avatar_key: null,
    }

    try {
        const services = await resolveDatabaseServices()
        const users = new UserController(services)
        const item = await users.create(payload)

        const sendLoginDetails =
            typeof body.sendLoginDetails === "boolean" ? body.sendLoginDetails : true

        const loginUrlFromBody =
            typeof body.loginUrl === "string" ? body.loginUrl.trim() : ""
        const loginUrl = loginUrlFromBody || `${req.nextUrl.origin}/login`

        let emailSent = false
        let emailError: string | undefined

        if (sendLoginDetails) {
            try {
                await sendLoginDetailsEmail({
                    to: item.email,
                    name: item.name,
                    email: item.email,
                    password: plainPassword,
                    loginUrl,
                })
                emailSent = true
            } catch (error) {
                emailError = getErrorMessage(error)
            }
        }

        const message = sendLoginDetails
            ? emailSent
                ? "User created successfully. Login details were sent to the user email."
                : "User created successfully, but failed to send login details email."
            : "User created successfully."

        return NextResponse.json(
            {
                item,
                emailSent,
                message,
                emailError,
            },
            { status: 201 },
        )
    } catch (error) {
        const message = getErrorMessage(error)
        const isDuplicate =
            /duplicate key|already exists|unique constraint|users_email_key/i.test(message)

        return NextResponse.json(
            {
                error: isDuplicate ? "Email is already in use." : "Failed to create user.",
                message,
            },
            { status: isDuplicate ? 409 : 500 },
        )
    }
}
