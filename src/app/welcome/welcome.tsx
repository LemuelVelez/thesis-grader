import { Link, useLocation, useNavigate } from "react-router-dom"
import { useState, type ElementType } from "react"
import {
    IconChecklist,
    IconUsersGroup,
    IconShieldLock,
    IconCalendarEvent,
    IconFileCertificate,
    IconChartBar,
    IconMenu2,
    IconX,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"

export default function WelcomePage() {
    const location = useLocation()
    const navigate = useNavigate()
    const [mobileOpen, setMobileOpen] = useState(false)

    const prefersReducedMotion =
        typeof window !== "undefined" &&
        window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches

    const easeInOutCubic = (t: number) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

    const smoothScrollTo = (toY: number, duration = 900) => {
        if (prefersReducedMotion) {
            window.scrollTo(0, toY)
            return
        }
        const startY = window.scrollY || window.pageYOffset
        const diff = toY - startY
        if (diff === 0) return

        let start: number | null = null
        const step = (timestamp: number) => {
            if (start === null) start = timestamp
            const elapsed = timestamp - start
            const progress = Math.min(elapsed / duration, 1)
            const eased = easeInOutCubic(progress)
            window.scrollTo(0, startY + diff * eased)
            if (elapsed < duration) requestAnimationFrame(step)
        }
        requestAnimationFrame(step)
    }

    const scrollToId = (id: string, offset = 84, duration = 900) => {
        const el = document.getElementById(id)
        if (!el) return
        const y = el.getBoundingClientRect().top + window.scrollY - Math.max(offset, 0)
        smoothScrollTo(y, duration)
    }

    const handleHomeClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
        if (location.pathname === "/welcome") {
            e.preventDefault()
            smoothScrollTo(0, 900)
            setMobileOpen(false)
        }
    }

    const handleAboutClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
        e.preventDefault()
        scrollToId("about", 84, 900)
        setMobileOpen(false)
    }

    return (
        <main className="relative min-h-dvh w-full bg-background text-foreground">
            {/* Blue ambient background */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-[radial-gradient(70%_70%_at_50%_-10%,hsl(var(--primary)/0.15),transparent_60%)]" />
                <div className="absolute inset-0 opacity-[0.06] [background:linear-gradient(to_right,transparent_0,transparent_31px,hsl(var(--ring)/.6)_32px),linear-gradient(to_bottom,transparent_0,transparent_31px,hsl(var(--ring)/.6)_32px)] [background-size:32px_32px]" />
            </div>

            <header className="sticky top-0 z-40 w-full border-b bg-background/75 backdrop-blur supports-[backdrop-filter]:bg-background/60">
                <div
                    className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6"
                    style={{ WebkitTapHighlightColor: "transparent" }}
                >
                    <Link
                        to="/"
                        onClick={(e) => {
                            if (location.pathname === "/welcome") {
                                e.preventDefault()
                                smoothScrollTo(0, 900)
                            } else {
                                e.preventDefault()
                                navigate("/welcome")
                            }
                        }}
                        className="flex items-center gap-2 font-bold tracking-tight select-none outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md px-1"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                        aria-label="ThesisGrader Home"
                    >
                        <span className="inline-block size-4 rounded-full bg-[radial-gradient(100%_100%_at_30%_20%,hsl(var(--primary))_0%,hsl(var(--primary)/.6)_70%,hsl(var(--primary)/.2)_100%)] shadow-[0_0_0_3px_hsl(var(--primary)/.2)]" aria-hidden />
                        <span className="text-sm sm:text-base">ThesisGrader</span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-6 text-sm">
                        <Link
                            to="/welcome"
                            onClick={handleHomeClick}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                        >
                            Home
                        </Link>
                        <a
                            href="#about"
                            onClick={handleAboutClick}
                            className="text-muted-foreground hover:text-foreground transition-colors"
                            style={{ WebkitTapHighlightColor: "transparent" }}
                        >
                            About
                        </a>
                    </nav>

                    <div className="hidden md:flex items-center gap-2">
                        <Button asChild variant="ghost" className="cursor-pointer">
                            <Link to="/docs" style={{ WebkitTapHighlightColor: "transparent" }}>
                                Docs
                            </Link>
                        </Button>
                        <Button asChild className="cursor-pointer">
                            <Link to="/auth/login" style={{ WebkitTapHighlightColor: "transparent" }}>
                                Login
                            </Link>
                        </Button>
                    </div>

                    <button
                        type="button"
                        aria-label="Open menu"
                        aria-expanded={mobileOpen}
                        aria-controls="mobile-menu"
                        onClick={() => setMobileOpen((v) => !v)}
                        className="md:hidden inline-flex items-center justify-center rounded-xl border px-3 py-2 text-sm hover:bg-accent/60 active:scale-[0.98] transition cursor-pointer"
                        style={{ WebkitTapHighlightColor: "transparent" }}
                    >
                        {mobileOpen ? <IconX className="size-5" /> : <IconMenu2 className="size-5" />}
                    </button>
                </div>

                <div
                    id="mobile-menu"
                    className={`md:hidden overflow-hidden border-b bg-background transition-[max-height,opacity,transform] duration-300 ease-in-out ${mobileOpen ? "max-h-96 opacity-100 translate-y-0" : "max-h-0 opacity-0 -translate-y-2"
                        }`}
                >
                    <nav className="flex flex-col px-4 sm:px-6 py-2 gap-1 text-base">
                        <Link
                            to="/welcome"
                            onClick={handleHomeClick}
                            className="rounded-lg px-3 py-3 text-foreground/90 hover:bg-accent/60 active:bg-accent transition"
                        >
                            Home
                        </Link>
                        <a
                            href="#about"
                            onClick={handleAboutClick}
                            className="rounded-lg px-3 py-3 text-foreground/90 hover:bg-accent/60 active:bg-accent transition"
                        >
                            About
                        </a>
                        <div className="my-2 h-px bg-border" />
                        <Link
                            to="/docs"
                            onClick={() => setMobileOpen(false)}
                            className="rounded-lg px-3 py-3 text-foreground/90 hover:bg-accent/60 active:bg-accent transition"
                        >
                            Docs
                        </Link>
                        <Link
                            to="/auth/login"
                            onClick={() => setMobileOpen(false)}
                            className="mt-1 inline-flex items-center justify-center rounded-lg border px-3 py-3 hover:bg-accent/60 active:bg-accent transition"
                        >
                            Login
                        </Link>
                    </nav>
                </div>
            </header>

            <section
                className="
          mx-auto grid w-full max-w-6xl
          place-items-stretch
          gap-8 px-4 py-10
          sm:px-6 sm:py-12
          lg:grid-cols-2 lg:gap-14 lg:py-24
        "
            >
                <div className="order-1 flex w-full max-w-xl flex-col items-center text-center lg:order-1 lg:items-start lg:text-left">
                    <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                        <span className="bg-gradient-to-b from-[hsl(var(--primary))] to-[hsl(var(--primary)/0.65)] bg-clip-text text-transparent">
                            THESISGRADER
                        </span>
                    </h1>

                    <p className="mt-2 text-lg font-semibold text-[hsl(var(--ring))]">
                        Web-Based Evaluation &amp; Grading for Thesis Panel Review
                    </p>

                    <p className="mt-4 max-w-prose text-pretty text-muted-foreground">
                        Digitize rubrics, streamline panel workflows, and generate audit-ready results with transparent,
                        outcome-aligned scoring.
                    </p>

                    <div className="mt-7 grid w-full grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:items-center sm:justify-center lg:justify-start">
                        <Button asChild variant="default" className="cursor-pointer shadow-lg shadow-[hsl(var(--ring)/.25)] hover:shadow-[hsl(var(--ring)/.35)]">
                            <Link to="/auth/login" style={{ WebkitTapHighlightColor: "transparent" }}>
                                Get started
                            </Link>
                        </Button>

                        <Button asChild variant="outline" className="cursor-pointer">
                            <Link to="/student-dashboard" style={{ WebkitTapHighlightColor: "transparent" }}>
                                Student dashboard
                            </Link>
                        </Button>

                        <Button
                            asChild
                            variant="ghost"
                            className="justify-self-start underline-offset-4 hover:underline sm:justify-self-auto cursor-pointer"
                        >
                            <a href="#about" onClick={handleAboutClick} style={{ WebkitTapHighlightColor: "transparent" }}>
                                Learn more
                            </a>
                        </Button>
                    </div>

                    <ul className="mt-5 grid grid-cols-1 gap-y-1 text-sm text-muted-foreground sm:flex sm:flex-wrap sm:gap-x-6">
                        <li>• Weighted rubric scoring</li>
                        <li>• Panel calibration</li>
                        <li>• Scheduling &amp; notices</li>
                        <li>• PDF/CSV exports</li>
                    </ul>
                </div>

                <div className="order-2 grid w-full max-w-xl content-center gap-4 justify-self-center lg:order-2">
                    <Card className="backdrop-blur transition-shadow hover:shadow-xl hover:shadow-[hsl(var(--ring)/.15)]">
                        <CardHeader className="flex flex-row items-start justify-between gap-4">
                            <div>
                                <CardTitle className="text-lg">Outcomes-Aligned Rubrics</CardTitle>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Versioned criteria with weights &amp; descriptors, plus transparent computation traces.
                                </p>
                            </div>
                            <div className="rounded-xl border border-[hsl(var(--ring)/.2)] bg-[hsl(var(--ring)/.08)] p-3 text-[hsl(var(--ring))]">
                                <IconChecklist className="size-6" />
                            </div>
                        </CardHeader>

                        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-center text-sm">
                            <Stat value="100%" label="Weight total" />
                            <Stat value="≥ 0.70" label="IRR target" />
                            <Stat value="1-click" label="PDF export" />
                        </CardContent>
                    </Card>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Feature
                            icon={IconUsersGroup}
                            title="Role-aware flows"
                            desc="Student, Adviser, Panel, Chair, and Admin journeys are streamlined."
                        />
                        <Feature
                            icon={IconShieldLock}
                            title="Privacy-first"
                            desc="RBAC, consent receipts, and audit logs per RA 10173."
                        />
                        <Feature
                            icon={IconCalendarEvent}
                            title="Defense scheduling"
                            desc="Conflict checks, notifications, attendance, and timelines."
                        />
                        <Feature
                            icon={IconChartBar}
                            title="Analytics"
                            desc="Distributions, time-to-result, and reliability summaries."
                        />
                    </div>
                </div>
            </section>

            <section id="about" className="border-t bg-[hsl(var(--primary)/.03)]">
                <div className="mx-auto grid w-full max-w-6xl place-items-center gap-6 px-4 py-12 sm:px-6 lg:grid-cols-3">
                    <div className="w-full max-w-2xl lg:col-span-2">
                        <h2 className="text-center text-xl font-bold lg:text-left">About the Study</h2>
                        <p className="mt-2 max-w-3xl text-balance text-center text-sm leading-relaxed text-muted-foreground lg:text-left">
                            ThesisGrader standardizes rubric-based assessment, supports panel calibration, automates weighted scoring,
                            anchors comments to criteria, and preserves a complete audit trail—improving fairness, timeliness, and
                            transparency in thesis reviews.
                        </p>

                        <div className="mt-6 grid gap-4 sm:grid-cols-3">
                            <MiniCard
                                icon={IconFileCertificate}
                                title="Transparent results"
                                text="Per-criterion breakdowns, comments, and signed PDFs."
                            />
                            <MiniCard
                                icon={IconChecklist}
                                title="Reliable scoring"
                                text="Calibration workflows; κ/ICC targets for consistency."
                            />
                            <MiniCard
                                icon={IconShieldLock}
                                title="Compliance-ready"
                                text="Consent, audit logging, and retention controls."
                            />
                        </div>
                    </div>

                    <Card className="w-full max-w-xl">
                        <CardHeader>
                            <CardTitle className="text-base">Key Objectives</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                                <li>Fair, transparent assessment with computation traces.</li>
                                <li>Efficient, secure operations with role-based workflows.</li>
                                <li>Measurable impact on reliability, speed, and satisfaction.</li>
                            </ul>
                        </CardContent>
                    </Card>
                </div>
            </section>

            <footer className="border-t">
                <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 py-8 text-center text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <div className="font-semibold">Authors</div>
                            <p className="mt-1 text-muted-foreground">
                                EJ E. Amit • Rey F. Chavez • Jezrael A. Dumali • Veltran S. Espina Jr. • Jenie P. Pocong
                            </p>
                        </div>
                        <div>
                            <div className="font-semibold">Institution</div>
                            <p className="mt-1 text-muted-foreground">College of Computing Studies, JRMSU — ZNAC, Tampilisan</p>
                        </div>
                    </div>
                    <div className="mt-4 text-muted-foreground">© {new Date().getFullYear()} ThesisGrader</div>
                </div>
            </footer>
        </main>
    )
}

/* ---------- UI bits ---------- */
function Feature({
    icon: Icon,
    title,
    desc,
}: {
    icon: ElementType<{ className?: string }>
    title: string
    desc: string
}) {
    return (
        <Card className="transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-[hsl(var(--ring)/.15)]">
            <CardContent className="p-5">
                <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-[hsl(var(--ring)/.2)] bg-[hsl(var(--ring)/.08)] p-2 text-[hsl(var(--ring))]">
                        <Icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{title}</h3>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
            </CardContent>
        </Card>
    )
}

function MiniCard({
    icon: Icon,
    title,
    text,
}: {
    icon: ElementType<{ className?: string }>
    title: string
    text: string
}) {
    return (
        <Card className="transition-all hover:shadow-md hover:shadow-[hsl(var(--ring)/.12)]">
            <CardContent className="p-5">
                <div className="mb-2 flex items-center gap-3">
                    <div className="rounded-xl border border-[hsl(var(--ring)/.2)] bg-[hsl(var(--ring)/.08)] p-2 text-[hsl(var(--ring))]">
                        <Icon className="size-5" />
                    </div>
                    <h3 className="text-base font-semibold">{title}</h3>
                </div>
                <p className="text-sm text-muted-foreground">{text}</p>
            </CardContent>
        </Card>
    )
}

function Stat({ value, label }: { value: string; label: string }) {
    return (
        <div className="rounded-lg border border-[hsl(var(--ring)/.2)] bg-[hsl(var(--ring)/.06)] p-3 text-left sm:text-center">
            <div className="text-2xl font-bold leading-none">{value}</div>
            <div className="mt-1 text-xs text-muted-foreground">{label}</div>
        </div>
    )
}
