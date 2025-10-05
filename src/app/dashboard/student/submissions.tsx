/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"
import data from "@/app/dashboard/data.json"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
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
import { IconDownload, IconEye, IconFilePlus, IconFilter } from "@tabler/icons-react"

type Submission = {
    id: number
    header: string
    type: string
    reviewer: string
    status: "Submitted" | "Draft"
}

function shapeSubmissions(): Submission[] {
    return data.map((d) => ({
        id: d.id,
        header: d.header,
        type: d.type,
        reviewer: d.reviewer,
        status: d.status === "Done" ? "Submitted" : "Draft",
    }))
}

export default function StudentSubmissions() {
    const [query, setQuery] = React.useState("")
    const [status, setStatus] = React.useState<"all" | Submission["status"]>("all")

    const submissions = React.useMemo(() => shapeSubmissions(), [])
    const filtered = submissions.filter((s) => {
        const matchesText =
            !query ||
            s.header.toLowerCase().includes(query.toLowerCase()) ||
            s.type.toLowerCase().includes(query.toLowerCase()) ||
            s.reviewer.toLowerCase().includes(query.toLowerCase())
        const matchesStatus = status === "all" ? true : s.status === status
        return matchesText && matchesStatus
    })

    const submittedCount = submissions.filter((s) => s.status === "Submitted").length
    const draftCount = submissions.filter((s) => s.status === "Draft").length

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                    {/* Page header */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">My Submissions</h1>
                            <p className="text-muted-foreground text-sm">
                                Upload, track, and download your submitted sections.
                            </p>
                        </div>
                        {/* Buttons: vertical on mobile, horizontal on sm+ */}
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                            <Button className="w-full cursor-pointer sm:w-auto">
                                <IconFilePlus className="mr-2 size-4" />
                                New Submission
                            </Button>
                        </div>
                    </div>

                    {/* Summary */}
                    <div className="grid gap-4 sm:grid-cols-3">
                        <SummaryCard title="Total" value={String(submissions.length)} hint="All sections in your outline" />
                        <SummaryCard title="Submitted" value={String(submittedCount)} hint="Marked done and queued for review" />
                        <SummaryCard title="Drafts" value={String(draftCount)} hint="Still being drafted or revised" />
                    </div>

                    {/* Controls */}
                    <Card>
                        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Submissions</CardTitle>
                                <CardDescription>Filter by status, reviewer, or section name.</CardDescription>
                            </div>

                            {/* Controls: vertical on mobile, horizontal on sm+ */}
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                {/* Status select */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <IconFilter className="size-4 text-muted-foreground" />
                                    <Label htmlFor="status" className="sr-only">
                                        Status
                                    </Label>
                                    <Select value={status} onValueChange={(v) => setStatus(v as any)}>
                                        <SelectTrigger id="status" className="w-full sm:w-36 cursor-pointer">
                                            <SelectValue placeholder="All statuses" />
                                        </SelectTrigger>
                                        <SelectContent align="end">
                                            <SelectItem value="all">All</SelectItem>
                                            <SelectItem value="Submitted">Submitted</SelectItem>
                                            <SelectItem value="Draft">Draft</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Search */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="q" className="sr-only">
                                        Search
                                    </Label>
                                    <Input
                                        id="q"
                                        value={query}
                                        placeholder="Search sections, reviewers…"
                                        onChange={(e) => setQuery(e.target.value)}
                                        className="w-full sm:w-64"
                                    />
                                </div>
                            </div>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            {/* Table: allow horizontal scroll on small screens */}
                            <div className="overflow-x-auto rounded-lg border">
                                <Table>
                                    <TableHeader className="bg-muted">
                                        <TableRow>
                                            <TableHead>Section</TableHead>
                                            <TableHead className="min-w-32">Type</TableHead>
                                            <TableHead>Reviewer</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filtered.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={5} className="py-10 text-center text-muted-foreground">
                                                    No submissions match your filters.
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filtered.map((s) => (
                                                <TableRow key={s.id}>
                                                    <TableCell>{s.header}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{s.type}</TableCell>
                                                    <TableCell className="whitespace-nowrap">{s.reviewer}</TableCell>
                                                    <TableCell className="whitespace-nowrap">
                                                        {s.status === "Submitted" ? (
                                                            <Badge variant="outline">Submitted</Badge>
                                                        ) : (
                                                            <Badge variant="secondary">Draft</Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {/* Actions: vertical on mobile, horizontal on sm+ */}
                                                        <div className="flex w-full flex-col items-stretch gap-2 sm:w-auto sm:flex-row sm:justify-end">
                                                            <Button size="sm" variant="outline" className="w-full cursor-pointer sm:w-auto">
                                                                <IconEye className="mr-2 size-4" />
                                                                View
                                                            </Button>
                                                            <Button size="sm" variant="outline" className="w-full cursor-pointer sm:w-auto">
                                                                <IconDownload className="mr-2 size-4" />
                                                                PDF
                                                            </Button>
                                                        </div>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}

function SummaryCard({ title, value, hint }: { title: string; value: string; hint: string }) {
    return (
        <Card>
            <CardHeader>
                <CardTitle className="text-sm">{title}</CardTitle>
                <CardDescription>{hint}</CardDescription>
            </CardHeader>
            <CardContent>
                <div className="text-2xl font-bold">{value}</div>
            </CardContent>
        </Card>
    )
}
