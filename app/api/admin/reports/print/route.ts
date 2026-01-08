/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server"

import { env } from "@/lib/env"
import { requireAdminFromCookies } from "@/lib/admin-auth"
import { getReportsSummary, resolveDateRange } from "@/lib/reports-admin"

export const runtime = "nodejs"

function safeInt(v: unknown, fallback: number, min: number, max: number) {
    const n = typeof v === "string" ? Number(v) : Number(v)
    if (!Number.isFinite(n)) return fallback
    const i = Math.trunc(n)
    return Math.min(Math.max(i, min), max)
}

function esc(s: any) {
    const t = s === null || s === undefined ? "" : String(s)
    return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
}

export async function GET(req: Request) {
    try {
        if (!env.DATABASE_URL) {
            return NextResponse.json(
                { ok: false, message: "Database is not configured (DATABASE_URL missing)." },
                { status: 500 }
            )
        }

        const auth = await requireAdminFromCookies()
        if (!auth.ok) return NextResponse.json({ ok: false, message: auth.message }, { status: auth.status })

        const url = new URL(req.url)
        const fromQ = String(url.searchParams.get("from") ?? "").trim()
        const toQ = String(url.searchParams.get("to") ?? "").trim()
        const days = safeInt(url.searchParams.get("days"), 30, 1, 365)
        const program = String(url.searchParams.get("program") ?? "").trim()
        const term = String(url.searchParams.get("term") ?? "").trim()

        const range = resolveDateRange({ from: fromQ || undefined, to: toQ || undefined, days })
        const summary = await getReportsSummary({ ...range, program: program || undefined, term: term || undefined })

        const title = `Reports (${summary.range.from} → ${summary.range.to})`

        const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${esc(title)}</title>
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <style>
      :root { --fg:#111; --muted:#666; --border:#ddd; }
      body { font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; color:var(--fg); margin:24px; }
      h1 { font-size: 20px; margin: 0 0 4px; }
      .muted { color: var(--muted); font-size: 12px; }
      .grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap: 12px; margin: 16px 0; }
      .card { border:1px solid var(--border); border-radius: 10px; padding:12px; }
      .k { color: var(--muted); font-size: 12px; }
      .v { font-size: 22px; font-weight: 700; margin-top: 2px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border-bottom: 1px solid var(--border); padding: 8px 6px; font-size: 12px; text-align: left; vertical-align: top; }
      th { font-size: 12px; color: var(--muted); }
      .section { margin-top: 18px; }
      @media print {
        body { margin: 10mm; }
        .no-print { display:none; }
      }
    </style>
  </head>
  <body>
    <div class="no-print" style="margin-bottom:10px;">
      <button onclick="window.print()">Print / Save as PDF</button>
    </div>

    <h1>${esc(title)}</h1>
    <div class="muted">
      Filters: Program=${esc(summary.filters.program ?? "(any)")}, Term=${esc(summary.filters.term ?? "(any)")}
    </div>

    <div class="grid">
      <div class="card"><div class="k">Users</div><div class="v">${summary.users.total}</div>
        <div class="muted">active ${summary.users.byStatus.active} • disabled ${summary.users.byStatus.disabled}</div>
      </div>
      <div class="card"><div class="k">Thesis groups</div><div class="v">${summary.thesis.groups_total}</div>
        <div class="muted">unassigned adviser ${summary.thesis.unassigned_adviser}</div>
      </div>
      <div class="card"><div class="k">Defenses (range)</div><div class="v">${summary.defenses.total_in_range}</div></div>
      <div class="card"><div class="k">Audit logs (range)</div><div class="v">${summary.audit.total_in_range}</div></div>
    </div>

    <div class="section">
      <h2 style="font-size:14px;margin:0;">Top Audit Actions</h2>
      <table><thead><tr><th>Action</th><th style="text-align:right;">Count</th></tr></thead><tbody>
        ${summary.audit.topActions.length
                ? summary.audit.topActions
                    .map((r) => `<tr><td>${esc(r.action)}</td><td style="text-align:right;">${r.count}</td></tr>`)
                    .join("")
                : `<tr><td colspan="2" class="muted">No data</td></tr>`
            }
      </tbody></table>
    </div>

    <div class="section">
      <h2 style="font-size:14px;margin:0;">Top Active Staff/Admin</h2>
      <table><thead><tr><th>Actor</th><th>Role</th><th style="text-align:right;">Count</th></tr></thead><tbody>
        ${summary.audit.topActors.length
                ? summary.audit.topActors
                    .map(
                        (r) =>
                            `<tr><td>${esc(r.actor_name ?? "Unknown")} (${esc(r.actor_email ?? "-")})</td><td>${esc(
                                r.role
                            )}</td><td style="text-align:right;">${r.count}</td></tr>`
                    )
                    .join("")
                : `<tr><td colspan="3" class="muted">No data</td></tr>`
            }
      </tbody></table>
    </div>

    <div class="section">
      <h2 style="font-size:14px;margin:0;">Defense Schedules by Room</h2>
      <table><thead><tr><th>Room</th><th style="text-align:right;">Count</th></tr></thead><tbody>
        ${summary.defenses.byRoom.length
                ? summary.defenses.byRoom
                    .map((r) => `<tr><td>${esc(r.room)}</td><td style="text-align:right;">${r.count}</td></tr>`)
                    .join("")
                : `<tr><td colspan="2" class="muted">No data</td></tr>`
            }
      </tbody></table>
    </div>

    <div class="section">
      <h2 style="font-size:14px;margin:0;">Defense Schedules by Month</h2>
      <table><thead><tr><th>Month</th><th style="text-align:right;">Count</th></tr></thead><tbody>
        ${summary.defenses.byMonth.length
                ? summary.defenses.byMonth
                    .map((r) => `<tr><td>${esc(r.month)}</td><td style="text-align:right;">${r.count}</td></tr>`)
                    .join("")
                : `<tr><td colspan="2" class="muted">No data</td></tr>`
            }
      </tbody></table>
    </div>
  </body>
</html>`

        return new NextResponse(html, {
            status: 200,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
            },
        })
    } catch (err: any) {
        console.error("GET /api/admin/reports/print failed:", err)
        return NextResponse.json({ ok: false, message: "Internal Server Error" }, { status: 500 })
    }
}
