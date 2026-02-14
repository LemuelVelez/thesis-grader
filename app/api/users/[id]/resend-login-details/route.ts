import { type NextRequest } from "next/server"
import { POST as resendLoginCredentialsPOST } from "../resend-login-credentials/route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const revalidate = 0

type RouteParams = {
    id?: string
}

type RouteContext = {
    params: Promise<RouteParams> | RouteParams
}

export async function POST(req: NextRequest, context: RouteContext) {
    return resendLoginCredentialsPOST(req, context)
}
