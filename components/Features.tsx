import {
    CalendarDays,
    ClipboardCheck,
    Lock,
    FileText,
    Users,
    ScrollText,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

const features = [
    {
        icon: CalendarDays,
        title: "Scheduling (Staff)",
        desc: "Create and manage defense schedules, assign panelists, and control visibility rules.",
    },
    {
        icon: ClipboardCheck,
        title: "Rubrics & criteria (Admin)",
        desc: "Templates with weights, score ranges, and version history to prevent mid-term inconsistencies.",
    },
    {
        icon: FileText,
        title: "Scoring & feedback (Staff)",
        desc: "Criterion-level scoring, per-criterion comments, and overall feedback in one flow.",
    },
    {
        icon: Lock,
        title: "Finalize & lock",
        desc: "Finalize an evaluation to lock it; Admin can override with a required audit trail.",
    },
    {
        icon: ScrollText,
        title: "Audit logs (Admin)",
        desc: "Track schedule edits, rubric changes, locks/unlocks, and user management actions.",
    },
    {
        icon: Users,
        title: "Strict role boundaries",
        desc: "Students only see their schedule & evaluation. Staff only see assigned schedules. Admin oversees all.",
    },
] as const

export default function Features() {
    return (
        <section id="features" className="border-t">
            <div className="mx-auto  px-4 py-12 sm:px-6 sm:py-16">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <Badge variant="secondary">Core features</Badge>
                        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                            Everything you need for panel review.
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                            Designed around your process: schedules, rubrics, evaluations, and admin oversight—without feature creep.
                        </p>
                    </div>

                    <div className="hidden sm:block">
                        <Badge variant="outline">Student • Staff • Admin</Badge>
                    </div>
                </div>

                <Separator className="my-8" />

                {/* Desktop grid */}
                <div className="hidden gap-4 md:grid md:grid-cols-3">
                    {features.map((f) => (
                        <Card key={f.title} className="h-full">
                            <CardHeader className="space-y-2">
                                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border bg-card">
                                    <f.icon className="h-5 w-5" />
                                </div>
                                <CardTitle className="text-base">{f.title}</CardTitle>
                            </CardHeader>
                            <CardContent className="text-sm text-muted-foreground">{f.desc}</CardContent>
                        </Card>
                    ))}
                </div>

                {/* Mobile stack */}
                <div className="grid gap-3 md:hidden">
                    {features.map((f) => (
                        <Card key={f.title}>
                            <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                    <div className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-card">
                                        <f.icon className="h-5 w-5" />
                                    </div>
                                    <div>
                                        <div className="text-sm font-medium">{f.title}</div>
                                        <div className="mt-1 text-xs text-muted-foreground">{f.desc}</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    ))}
                </div>
            </div>
        </section>
    )
}
