import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
    IconAward,
    IconDownload,
    IconFileCheck,
    IconInfoCircle,
    IconReportAnalytics,
} from "@tabler/icons-react"

type Criterion = {
    id: string
    name: string
    weight: number // percent (e.g., 25 = 25%)
    score: number // 0-100
}

type PanelVote = {
    id: string
    name: string
    role: "Chair" | "Member"
    vote: "Pass" | "Pass w/ Revisions" | "Re-defend"
    remarks?: string
}

const CRITERIA: Criterion[] = [
    { id: "c1", name: "Problem Significance & Originality", weight: 20, score: 88 },
    { id: "c2", name: "Literature & Theoretical Grounding", weight: 15, score: 90 },
    { id: "c3", name: "Methodology & Design Rigor", weight: 25, score: 86 },
    { id: "c4", name: "Analysis & Results Quality", weight: 20, score: 84 },
    { id: "c5", name: "Presentation & Q&A", weight: 20, score: 92 },
]

const PANEL_VOTES: PanelVote[] = [
    { id: "p1", name: "Dr. Andrea Santos", role: "Chair", vote: "Pass w/ Revisions", remarks: "Clarify sampling frame." },
    { id: "p2", name: "Prof. Joel Reyes", role: "Member", vote: "Pass w/ Revisions", remarks: "Tighten limitations." },
    { id: "p3", name: "Dr. L. Unito", role: "Member", vote: "Pass w/ Revisions", remarks: "Polish figures/tables." },
]

function computeWeightedTotal(criteria: Criterion[]) {
    const total = criteria.reduce((acc, c) => acc + (c.score * c.weight) / 100, 0)
    return Math.round((total + Number.EPSILON) * 100) / 100
}

function getDecision(grade: number) {
    // Example thresholds; align with your backend rubric if different.
    if (grade >= 85) return { label: "Passed (with Minor Revisions)", tone: "ok" as const }
    if (grade >= 75) return { label: "Conditional Pass (Major Revisions)", tone: "warn" as const }
    return { label: "Failed / Re-defend", tone: "err" as const }
}

export default function StudentResults() {
    const overall = computeWeightedTotal(CRITERIA)
    const decision = getDecision(overall)

    const votesSummary = React.useMemo(() => {
        const tallies = PANEL_VOTES.reduce<Record<PanelVote["vote"], number>>(
            (acc, v) => ({ ...acc, [v.vote]: (acc[v.vote] ?? 0) + 1 }),
            { "Pass": 0, "Pass w/ Revisions": 0, "Re-defend": 0 }
        )
        return tallies
    }, [])

    const release = {
        releasedAt: "2025-10-02T18:45:00+08:00",
        referenceNo: "RG-2025-1002-0007",
    }

    const inFavor = votesSummary["Pass"] + votesSummary["Pass w/ Revisions"]
    const totalVotes = PANEL_VOTES.length

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                    {/* Page header */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Results</h1>
                            <p className="text-muted-foreground text-sm">
                                Official grade, decision, and rubric breakdown from the panel review.
                            </p>
                        </div>
                        {/* Buttons: vertical on mobile, horizontal on sm+ */}
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                            <Button variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <IconDownload className="mr-2 size-4" />
                                Download Result Slip (PDF)
                            </Button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border bg-muted/40 p-2">
                                        <IconReportAnalytics className="size-5" />
                                    </div>
                                    <CardTitle className="text-sm font-medium">Overall Grade</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">{overall}%</div>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    Weighted average across all rubric criteria.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border bg-muted/40 p-2">
                                        <IconFileCheck className="size-5" />
                                    </div>
                                    <CardTitle className="text-sm font-medium">Decision</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="flex flex-wrap items-center gap-3">
                                    {decision.tone === "ok" && <Badge className="whitespace-nowrap">Passed (Minor Revisions)</Badge>}
                                    {decision.tone === "warn" && (
                                        <Badge variant="secondary" className="whitespace-nowrap">
                                            Conditional Pass (Major Revisions)
                                        </Badge>
                                    )}
                                    {decision.tone === "err" && (
                                        <Badge variant="destructive" className="whitespace-nowrap">
                                            Failed / Re-defend
                                        </Badge>
                                    )}
                                    <span className="text-sm text-muted-foreground">Ref #: {release.referenceNo}</span>
                                </div>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    Released on {new Date(release.releasedAt).toLocaleString(undefined, { hour12: true })}.
                                </p>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="flex flex-row items-start justify-between space-y-0">
                                <div className="flex items-center gap-2">
                                    <div className="rounded-lg border bg-muted/40 p-2">
                                        <IconAward className="size-5" />
                                    </div>
                                    <CardTitle className="text-sm font-medium">Panel Votes</CardTitle>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <div className="text-2xl font-bold">
                                    {inFavor}/{totalVotes} in favor
                                </div>
                                <p className="text-muted-foreground mt-1 text-xs">
                                    Chair + members tallies (see detail below).
                                </p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Rubric breakdown */}
                    <Card>
                        {/* Header: stack on mobile, horizontal on sm+ */}
                        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Rubric Breakdown</CardTitle>
                                <CardDescription>Weighted per-criterion scores based on the official rubric.</CardDescription>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                <Button variant="outline" className="w-full cursor-pointer sm:w-auto">
                                    <IconDownload className="mr-2 size-4" />
                                    Download Detailed Rubric (PDF)
                                </Button>
                            </div>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow>
                                            <TableHead>Criterion</TableHead>
                                            <TableHead className="whitespace-nowrap">Weight (%)</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead>Weighted</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {CRITERIA.map((c) => {
                                            const weighted =
                                                Math.round(((c.score * c.weight) / 100 + Number.EPSILON) * 100) / 100
                                            return (
                                                <TableRow key={c.id}>
                                                    <TableCell>{c.name}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{c.weight}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{c.score}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{weighted}</TableCell>
                                                </TableRow>
                                            )
                                        })}
                                        <TableRow>
                                            <TableCell className="font-medium">Total</TableCell>
                                            <TableCell />
                                            <TableCell />
                                            <TableCell className="font-semibold">{overall}</TableCell>
                                        </TableRow>
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Panel votes detail */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="text-base sm:text-lg">Panel Votes & Remarks</CardTitle>
                            <CardDescription>Individual votes and short remarks from each panelist.</CardDescription>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow>
                                            <TableHead>Panelist</TableHead>
                                            <TableHead>Role</TableHead>
                                            <TableHead>Vote</TableHead>
                                            <TableHead>Remarks</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {PANEL_VOTES.map((p) => (
                                            <TableRow key={p.id}>
                                                <TableCell className="whitespace-nowrap">{p.name}</TableCell>
                                                <TableCell className="whitespace-nowrap">{p.role}</TableCell>
                                                <TableCell className="whitespace-nowrap">
                                                    {p.vote === "Pass" && <Badge>Pass</Badge>}
                                                    {p.vote === "Pass w/ Revisions" && (
                                                        <Badge variant="secondary">Pass w/ Revisions</Badge>
                                                    )}
                                                    {p.vote === "Re-defend" && <Badge variant="destructive">Re-defend</Badge>}
                                                </TableCell>
                                                <TableCell className="text-muted-foreground">{p.remarks ?? "—"}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>

                            <div className="mt-4 flex items-start gap-2 rounded-md border p-3 text-sm text-muted-foreground">
                                <IconInfoCircle className="mt-0.5 size-4" />
                                <span>
                                    For revision items, please see the annotated PDF from your panel and the comments
                                    thread in{" "}
                                    <Link to="/dashboard/student/notifications" className="underline underline-offset-2">
                                        Notifications
                                    </Link>
                                    .
                                </span>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
