import crypto from "node:crypto"

/**
 * Fast SHA-256 helper (hex output).
 * Used for session/reset token hashing (NOT recommended for password hashing).
 */
export function sha256(input: string) {
    return crypto.createHash("sha256").update(input).digest("hex")
}

/**
 * Cryptographically-secure random token (URL-safe).
 * @param bytes number of random bytes to generate (default 32)
 */
export function randomToken(bytes = 32) {
    return crypto.randomBytes(bytes).toString("base64url")
}

/**
 * Pragmatic email validation (not full RFC).
 */
export function isValidEmail(email: string) {
    const s = String(email ?? "").trim()
    if (!s || s.length > 254) return false
    const at = s.indexOf("@")
    if (at <= 0 || at !== s.lastIndexOf("@")) return false
    const local = s.slice(0, at)
    const domain = s.slice(at + 1)
    if (!local || !domain) return false
    if (local.length > 64) return false
    if (/\s/.test(s)) return false
    if (!domain.includes(".")) return false
    if (domain.startsWith(".") || domain.endsWith(".")) return false
    return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)+$/.test(s)
}

function timingSafeEqual(a: Buffer, b: Buffer) {
    if (a.length !== b.length) return false
    return crypto.timingSafeEqual(a, b)
}

function looksLikeHexSha256(s: string) {
    return /^[a-f0-9]{64}$/i.test(s)
}

function isPowerOfTwo(n: number) {
    return Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0
}

/**
 * Password hashing (recommended): scrypt.
 * Stored format:
 *   scrypt$N$r$p$salt_b64url$dk_b64url
 *
 * Fix for: "Invalid scrypt params ... memory limit exceeded"
 * - Node/OpenSSL enforces a default maxmem that can be slightly below the
 *   memory required by common params like N=32768,r=8 (≈33.5MB).
 * - We set a higher maxmem and also use a slightly lower default N.
 */
export async function hashPassword(
    password: string,
    opts?: {
        N?: number
        r?: number
        p?: number
        keylen?: number
        saltBytes?: number
        maxmem?: number
    }
) {
    const pwd = String(password ?? "")
    if (!pwd) throw new Error("Password required")

    // Safer default that stays under many environments' limits
    const N = opts?.N ?? 16384
    const r = opts?.r ?? 8
    const p = opts?.p ?? 1
    const keylen = opts?.keylen ?? 64
    const saltBytes = opts?.saltBytes ?? 16

    if (!isPowerOfTwo(N)) throw new Error("Invalid scrypt N (must be power of two)")
    if (!Number.isInteger(r) || r <= 0) throw new Error("Invalid scrypt r")
    if (!Number.isInteger(p) || p <= 0) throw new Error("Invalid scrypt p")

    const salt = crypto.randomBytes(saltBytes)

    // Estimated memory usage: 128 * r * N bytes (approx)
    const mem = 128 * r * N
    const maxmem = opts?.maxmem ?? Math.max(64 * 1024 * 1024, mem + 1024 * 1024)

    const dk = (await scryptAsync(pwd, salt, keylen, { N, r, p, maxmem })) as Buffer

    return `scrypt$${N}$${r}$${p}$${salt.toString("base64url")}$${dk.toString("base64url")}`
}

/**
 * Verify a plaintext password against a stored hash.
 * Supports:
 *  - scrypt$... (recommended format)
 *  - bcryptjs ($2a/$2b/$2y)
 *  - legacy sha256 (64-hex or "sha256:<hex>" or "sha256$<hex>")
 */
export async function verifyPassword(password: string, storedHash: string) {
    const pwd = String(password ?? "")
    const hash = String(storedHash ?? "")
    if (!pwd || !hash) return false

    // scrypt$N$r$p$salt$dk
    if (hash.startsWith("scrypt$")) {
        const parts = hash.split("$")
        if (parts.length !== 6) return false

        const N = Number(parts[1])
        const r = Number(parts[2])
        const p = Number(parts[3])
        const saltB64 = parts[4]
        const dkB64 = parts[5]

        // Guardrails to avoid pathological params
        if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false
        if (!isPowerOfTwo(N)) return false
        if (!Number.isInteger(r) || r <= 0 || r > 32) return false
        if (!Number.isInteger(p) || p <= 0 || p > 16) return false
        if (N > (1 << 20)) return false // cap at ~1,048,576

        let salt: Buffer
        let dkStored: Buffer
        try {
            salt = Buffer.from(saltB64, "base64url")
            dkStored = Buffer.from(dkB64, "base64url")
        } catch {
            return false
        }
        if (salt.length < 8 || dkStored.length < 16) return false

        const mem = 128 * r * N
        const maxmem = Math.max(64 * 1024 * 1024, mem + 1024 * 1024)

        const dk = (await scryptAsync(pwd, salt, dkStored.length, { N, r, p, maxmem })) as Buffer
        return timingSafeEqual(dk, dkStored)
    }

    // bcryptjs
    if (hash.startsWith("$2a$") || hash.startsWith("$2b$") || hash.startsWith("$2y$")) {
        try {
            const bcryptjs = await import("bcryptjs")
            return await bcryptjs.compare(pwd, hash)
        } catch {
            return false
        }
    }

    // legacy sha256 fallbacks
    if (hash.startsWith("sha256:") || hash.startsWith("sha256$")) {
        const hex = hash.slice("sha256:".length).replace(/^\$/, "")
        if (!looksLikeHexSha256(hex)) return false
        const a = Buffer.from(sha256(pwd), "hex")
        const b = Buffer.from(hex.toLowerCase(), "hex")
        return timingSafeEqual(a, b)
    }

    if (looksLikeHexSha256(hash)) {
        const a = Buffer.from(sha256(pwd), "hex")
        const b = Buffer.from(hash.toLowerCase(), "hex")
        return timingSafeEqual(a, b)
    }

    return false
}

function scryptAsync(
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
    options: crypto.ScryptOptions
) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keylen, options, (err, derivedKey) => {
            if (err) return reject(err)
            resolve(derivedKey)
        })
    })
}
