/* eslint-disable @typescript-eslint/no-explicit-any */
import type { ComponentType, ReactNode } from "react"
import {
    IconChecklist,
    IconUsersGroup,
    IconShieldLock,
    IconCalendarEvent,
    IconFileCertificate,
    IconChartBar,
} from "@tabler/icons-react"
import { Button } from "@/components/ui/button"

export default function WelcomePage() {
    return (
        <main className="min-h-dvh w-full bg-background text-foreground">
            {/* HERO */}
            <section className="mx-auto grid w-full max-w-6xl gap-8 px-6 py-12 lg:grid-cols-2 lg:py-20">
                <div className="flex flex-col justify-center">
                    <span className="mb-3 inline-flex w-fit items-center gap-2 rounded-full border px-3 py-1 text-xs text-muted-foreground">
                        <span className="size-1.5 rounded-full bg-primary" />
                        Capstone Study • September 2025
                    </span>

                    <h1 className="text-balance text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl">
                        THESISGRADER
                    </h1>
                    <p className="mt-1 text-lg font-semibold text-primary">
                        A Web-Based Evaluation and Grading System for Thesis Panel Review
                    </p>

                    <p className="mt-4 max-w-prose text-pretty text-muted-foreground">
                        Digitize rubrics, streamline panel workflows, and produce audit-ready results.
                        Aligned with outcomes-based QA and the Data Privacy Act (RA 10173).
                    </p>

                    <div className="mt-6 flex flex-wrap items-center gap-3">
                        {/* Wire these to your actual routes */}
                        <Button asChild>
                            <a href="/auth">Get started</a>
                        </Button>
                        <Button asChild variant="outline">
                            <a href="/student-dashboard">Open student dashboard</a>
                        </Button>
                        <Button asChild variant="outline">
                            <a href="#about">Learn more</a>
                        </Button>
                    </div>

                    <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
                        <li>• Weighted rubric scoring</li>
                        <li>• Panel calibration & IRR</li>
                        <li>• Schedule & notify</li>
                        <li>• Audit-ready exports</li>
                    </ul>
                </div>

                {/* Quick feature grid */}
                <div className="grid content-center gap-4">
                    <div className="rounded-2xl border bg-card/70 p-6 shadow-xs backdrop-blur">
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h3 className="text-lg font-semibold">Outcomes-Aligned Rubrics</h3>
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Versioned criteria with weights and descriptors. Transparent computation traces.
                                </p>
                            </div>
                            <div className="rounded-xl border bg-muted p-3">
                                <IconChecklist className="size-6" />
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-sm">
                            <div className="rounded-lg border p-3">
                                <div className="text-2xl font-bold">100%</div>
                                <div className="text-muted-foreground">Weights</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-2xl font-bold">κ / ICC</div>
                                <div className="text-muted-foreground">IRR Targets</div>
                            </div>
                            <div className="rounded-lg border p-3">
                                <div className="text-2xl font-bold">1-Click</div>
                                <div className="text-muted-foreground">PDF Export</div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                        <Feature
                            icon={IconUsersGroup}
                            title="Role-aware workflows"
                            desc="Student, Adviser, Panel, Chair, and Admin journeys are streamlined."
                        />
                        <Feature
                            icon={IconShieldLock}
                            title="Privacy-by-design"
                            desc="RBAC, consent receipts, audit logs, and secure processing (RA 10173)."
                        />
                        <Feature
                            icon={IconCalendarEvent}
                            title="Defense scheduling"
                            desc="Conflict checks, notifications, attendance, and timeline tracking."
                        />
                        <Feature
                            icon={IconChartBar}
                            title="Analytics & evidence"
                            desc="Distributions, time-to-result, IRR summaries, AACCUP-ready packs."
                        />
                    </div>
                </div>
            </section>

            {/* ABOUT */}
            <section id="about" className="border-t bg-muted/30">
                <div className="mx-auto w-full max-w-6xl px-6 py-10">
                    <h2 className="text-xl font-bold">About the Study</h2>
                    <p className="mt-2 max-w-5xl text-sm leading-relaxed text-muted-foreground">
                        ThesisGrader standardizes rubric-based thesis assessment, supports rater calibration,
                        automates weighted scoring, anchors comments to criteria, integrates academic-integrity
                        checks, and preserves a complete audit trail for accreditation and appeals — improving
                        timeliness, fairness, and transparency of panel reviews.
                    </p>

                    <div className="mt-6 grid gap-4 lg:grid-cols-3">
                        <MiniCard
                            icon={IconFileCertificate}
                            title="Transparent results"
                            text="Per-criterion breakdowns, panel comments, and official PDFs with signatures."
                        />
                        <MiniCard
                            icon={IconChecklist}
                            title="Reliable scoring"
                            text="Calibration workflows and targets for κ/ICC ≥ 0.70."
                        />
                        <MiniCard
                            icon={IconShieldLock}
                            title="Compliance ready"
                            text="Consent, audit logging, retention labels, and DSAR exports."
                        />
                    </div>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <AnchorButton href="#objectives">Objectives</AnchorButton>
                        <AnchorButton href="#scope">Scope & Delimitation</AnchorButton>
                        <AnchorButton href="#significance">Significance</AnchorButton>
                    </div>
                </div>
            </section>

            {/* OBJECTIVES */}
            <section id="objectives" className="mx-auto w-full max-w-6xl px-6 py-10">
                <h2 className="text-xl font-bold">Objectives</h2>
                <ul className="mt-3 list-inside list-disc text-sm text-muted-foreground">
                    <li>
                        <strong>Fair, transparent assessment:</strong> outcome-aligned rubrics, automated weighted scoring with computation traces,
                        calibration tools (target κ/ICC ≥ 0.70), and integrity checks.
                    </li>
                    <li>
                        <strong>Efficient & secure operations:</strong> role-based workflows, scheduling, auditability, privacy/security compliance, and strong performance.
                    </li>
                    <li>
                        <strong>Adoption & impact:</strong> usability (SUS ≥ 80), improvements in reliability, timeliness, satisfaction, and audit readiness.
                    </li>
                    <li>
                        <strong>Quality evaluation (Garvin):</strong> performance, features, reliability, conformance, serviceability, aesthetics, perceived quality.
                    </li>
                </ul>
            </section>

            {/* SCOPE */}
            <section id="scope" className="mx-auto w-full max-w-6xl px-6 pb-10">
                <h2 className="text-xl font-bold">Scope & Delimitation</h2>
                <p className="mt-3 max-w-5xl text-sm text-muted-foreground">
                    Focused on undergraduate thesis panel reviews at the College of Computing Studies (JRMSU-TC).
                    Covers rubric scoring, scheduling, notifications, official result generation, and audit logging.
                    Excludes non-thesis programs, multi-campus deployment, and automated posting to external systems in this phase.
                </p>
            </section>

            {/* SIGNIFICANCE */}
            <section id="significance" className="mx-auto w-full max-w-6xl px-6 pb-16">
                <h2 className="text-xl font-bold">Significance</h2>
                <p className="mt-3 max-w-5xl text-sm text-muted-foreground">
                    Enhances fairness, speed, and accountability in thesis assessment. Students get criterion-linked feedback;
                    faculty reduce manual overhead; programs gain accreditation-ready evidence; and the institution meets privacy and audit requirements.
                </p>
            </section>

            {/* AUTHORS / FOOTER */}
            <footer className="border-t">
                <div className="mx-auto w-full max-w-6xl px-6 py-8 text-sm">
                    <div className="grid gap-2 sm:grid-cols-2">
                        <div>
                            <div className="font-semibold">Authors</div>
                            <p className="mt-1 text-muted-foreground">
                                EJ E. Amit • Rey F. Chavez • Jezrael A. Dumali • Veltran S. Espina Jr. • Jenie P. Pocong
                            </p>
                        </div>
                        <div>
                            <div className="font-semibold">Institution</div>
                            <p className="mt-1 text-muted-foreground">
                                College of Computing Studies, Jose Rizal Memorial State University — ZNAC, Tampilisan, Zamboanga del Norte
                            </p>
                        </div>
                    </div>
                    <div className="mt-4 text-muted-foreground">© {new Date().getFullYear()} ThesisGrader • JRMSU-TC</div>
                </div>
            </footer>
        </main>
    )
}

/* ---------- Small presentational helpers ---------- */

function Feature({
    icon: Icon,
    title,
    desc,
}: {
    icon: ComponentType<any>
    title: string
    desc: string
}) {
    return (
        <div className="rounded-2xl border bg-card p-5 shadow-xs transition-colors">
            <div className="flex items-center gap-3">
                <div className="rounded-xl border bg-muted p-2">
                    <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{desc}</p>
        </div>
    )
}

function MiniCard({
    icon: Icon,
    title,
    text,
}: {
    icon: ComponentType<any>
    title: string
    text: string
}) {
    return (
        <div className="rounded-2xl border bg-card p-5 shadow-xs">
            <div className="mb-2 flex items-center gap-3">
                <div className="rounded-xl border bg-muted p-2">
                    <Icon className="size-5" />
                </div>
                <h3 className="text-base font-semibold">{title}</h3>
            </div>
            <p className="text-sm text-muted-foreground">{text}</p>
        </div>
    )
}

function AnchorButton({ href, children }: { href: string; children: ReactNode }) {
    return (
        <a
            href={href}
            className="inline-flex items-center justify-center rounded-xl border bg-background px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted/60"
        >
            {children}
        </a>
    )
}
