/* Run:
   SUPERADMIN_EMAIL=admin@example.com SUPERADMIN_PASSWORD='StrongPass123!' SUPERADMIN_NAME='Super Admin' \
   node database/seeder/seed-superadmin.js
*/

const DATABASE_URL = process.env.DATABASE_URL

const EMAIL = process.env.SUPERADMIN_EMAIL
const PASSWORD = process.env.SUPERADMIN_PASSWORD
const NAME = process.env.SUPERADMIN_NAME || "Super Admin"

if (!DATABASE_URL) {
    console.error("Missing DATABASE_URL")
    process.exit(1)
}
if (!EMAIL || !PASSWORD) {
    console.error("Missing SUPERADMIN_EMAIL or SUPERADMIN_PASSWORD")
    process.exit(1)
}

async function main() {
    // Avoid require() to satisfy eslint/@typescript-eslint/no-require-imports
    const pgMod = await import("pg")
    const bcryptMod = await import("bcryptjs")

    const pg = pgMod.default ?? pgMod
    const bcrypt = bcryptMod.default ?? bcryptMod

    const { Pool } = pg

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
            console.log("✅ Superadmin created:", EMAIL)
        } else {
            console.log("ℹ️ Superadmin already exists:", EMAIL)
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
