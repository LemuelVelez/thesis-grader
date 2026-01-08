import { Pool } from "pg"
import { env } from "@/lib/env"

declare global {

    var __pgPool: Pool | undefined
}

function createPool() {
    return new Pool({
        connectionString: env.DATABASE_URL,
        ssl: env.DATABASE_SSL ? { rejectUnauthorized: false } : false,
        max: 10,
    })
}

export const db: Pool = global.__pgPool ?? createPool()

if (process.env.NODE_ENV !== "production") {
    global.__pgPool = db
}
