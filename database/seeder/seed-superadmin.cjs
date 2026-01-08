/* Run:
   npm run seed:admin

   Notes:
   - If SUPERADMIN_EMAIL / SUPERADMIN_PASSWORD are NOT set in .env or shell,
     this script will use a safe local default email and GENERATE a strong password,
     then print the credentials to the console.
*/

async function loadDotEnv() {
    const { default: fs } = await import("node:fs/promises")
    const pathMod = await import("node:path")
    const path = pathMod.default ?? pathMod

    const envPath = path.join(process.cwd(), ".env")

    let raw = ""
    try {
        raw = await fs.readFile(envPath, "utf8")
    } catch {
        return
    }

    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith("#")) continue

        const eq = trimmed.indexOf("=")
        if (eq === -1) continue

        const key = trimmed.slice(0, eq).trim()
        let val = trimmed.slice(eq + 1).trim()

        if (
            (val.startsWith('"') && val.endsWith('"')) ||
            (val.startsWith("'") && val.endsWith("'"))
        ) {
            val = val.slice(1, -1)
        }

        if (process.env[key] == null) {
            process.env[key] = val
        }
    }
}

function normalizeEmail(email) {
    return String(email ?? "").trim().toLowerCase()
}

async function main() {
    await loadDotEnv()

    const DATABASE_URL = process.env.DATABASE_URL
    if (!DATABASE_URL) {
        console.error("Missing DATABASE_URL (set it in .env)")
        process.exit(1)
    }

    // Defaults for local/dev seeding
    const defaultEmail = "superadmin@thesisgrader.local"
    const defaultName = "Super Admin"

    let EMAIL = process.env.SUPERADMIN_EMAIL
    let PASSWORD = process.env.SUPERADMIN_PASSWORD
    const NAME = process.env.SUPERADMIN_NAME || defaultName

    const cryptoMod = await import("node:crypto")
    const crypto = cryptoMod.default ?? cryptoMod

    let generatedPassword = null

    if (!EMAIL) {
        EMAIL = defaultEmail
    }

    if (!PASSWORD) {
        // Generate a strong password and print it once
        // 24 bytes => base64url length ~ 32 chars
        generatedPassword = crypto.randomBytes(24).toString("base64url")
        PASSWORD = generatedPassword
    }

    EMAIL = normalizeEmail(EMAIL)

    const pgMod = await import("pg")
    const Pool =
        pgMod.Pool ??
        (pgMod.default && pgMod.default.Pool) ??
        (pgMod.default && pgMod.default.default && pgMod.default.default.Pool)

    if (!Pool) {
        throw new Error("Could not resolve Pool from 'pg'")
    }

    const bcryptMod = await import("bcryptjs")
    const bcrypt = bcryptMod.default ?? bcryptMod

    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()

    try {
        const passwordHash = await bcrypt.hash(PASSWORD, 12)

        const upsert = `
        insert into users (name, email, role, status, password_hash)
        values ($1, $2, 'admin', 'active', $3)
        on conflict (lower(email)) do nothing
        returning id
      `

        const inserted = await client.query(upsert, [NAME, EMAIL, passwordHash])

        if (inserted.rowCount === 1) {
            console.log("✅ Superadmin created:")
            console.log("   Email   :", EMAIL)
            if (generatedPassword) {
                console.log("   Password:", generatedPassword)
                console.log("   (Generated because SUPERADMIN_PASSWORD was not set)")
            } else {
                console.log("   Password: (from SUPERADMIN_PASSWORD env var)")
            }
        } else {
            console.log("ℹ️ Superadmin already exists:", EMAIL)
            if (generatedPassword) {
                console.log(
                    "   Note: A password was generated but NOT applied because the user already exists."
                )
            }
        }
    } finally {
        client.release()
        await pool.end()
    }
}

main().catch((e) => {
    console.error(e)
    process.exit(1)
})
