import { createApiRouteHandlers } from '../../../database/routes/Route'
import { env } from '@/lib/env'
import { sendPasswordResetEmail } from '@/lib/email'

export const runtime = 'nodejs'

function getAppBaseUrl() {
    const raw = (env.APP_URL || 'http://localhost:3000').trim()
    return raw.endsWith('/') ? raw.slice(0, -1) : raw
}

const handlers = createApiRouteHandlers({
    auth: {
        onPasswordResetRequested: async ({ email, token, user }) => {
            const resetUrl = `${getAppBaseUrl()}/auth/password/reset?token=${encodeURIComponent(token)}`
            await sendPasswordResetEmail({
                to: email,
                name: user.name,
                resetUrl,
            })
        },
    },
})

export const GET = handlers.GET
export const POST = handlers.POST
export const PUT = handlers.PUT
export const PATCH = handlers.PATCH
export const DELETE = handlers.DELETE
export const OPTIONS = handlers.OPTIONS
