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

function checksumSha256Hex(input) {
    // dynamic import to keep the file consistent with your "no require()" preference
    return import("node:crypto").then((m) => {
        const crypto = m.default ?? m
        return crypto.createHash("sha256").update(input).digest("hex")
    })
}

async function main() {
    await loadDotEnv()

    const DATABASE_URL = process.env.DATABASE_URL
    if (!DATABASE_URL) {
        console.error("Missing DATABASE_URL (set it in .env)")
        process.exit(1)
    }

    const pathMod = await import("node:path")
    const path = pathMod.default ?? pathMod
    const { default: fs } = await import("node:fs/promises")

    const pgMod = await import("pg")
    const pgAny = pgMod.default ?? pgMod
    const Pool = pgAny.Pool ?? pgMod.Pool
    if (!Pool) throw new Error("Could not resolve Pool from 'pg'")

    const pool = new Pool({ connectionString: DATABASE_URL })
    const client = await pool.connect()

    try {
        // Track applied migrations
        await client.query(`
        create table if not exists schema_migrations (
          id bigserial primary key,
          filename text not null unique,
          checksum text not null,
          applied_at timestamptz not null default now()
        )
      `)

        const appliedRes = await client.query(
            `select filename, checksum from schema_migrations order by applied_at asc`
        )
        const applied = new Map(appliedRes.rows.map((r) => [r.filename, r.checksum]))

        const migrationsDir = path.join(process.cwd(), "database", "migration")
        const entries = await fs.readdir(migrationsDir, { withFileTypes: true })

        const files = entries
            .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".sql"))
            .map((e) => e.name)
            .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))

        if (files.length === 0) {
            console.log("No migration .sql files found in database/migration")
            return
        }

        let ranAny = false

        for (const file of files) {
            const fullPath = path.join(migrationsDir, file)
            const sql = await fs.readFile(fullPath, "utf8")
            const sum = await checksumSha256Hex(sql)

            if (applied.has(file)) {
                const prev = applied.get(file)
                if (prev !== sum) {
                    console.error(`❌ Migration checksum mismatch: ${file}`)
                    console.error(
                        "This file was already applied, but its contents changed.\n" +
                        "Fix: revert the file to the applied version, or create a new migration file (recommended)."
                    )
                    process.exit(1)
                }

                console.log(`↩️  Skipped: ${file} (already applied)`)
                continue
            }

            ranAny = true
            const started = Date.now()

            await client.query("begin")
            try {
                await client.query(sql)
                await client.query(
                    `insert into schema_migrations (filename, checksum) values ($1, $2)`,
                    [file, sum]
                )
                await client.query("commit")
            } catch (e) {
                await client.query("rollback")
                throw e
            }

            const ms = Date.now() - started
            console.log(`✅ Migrated: ${file} (${ms}ms)`)
        }

        if (!ranAny) {
            console.log("✅ Database is up to date (no pending migrations).")
        }
    } finally {
        client.release()
        await pool.end()
    }
}

main().catch((e) => {
    console.error("Migration failed:")
    console.error(e)
    process.exit(1)
})
