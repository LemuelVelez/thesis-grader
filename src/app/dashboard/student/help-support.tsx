/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"
import {
    IconAlertCircle,
    IconFileDescription,
    IconMail,
    IconMessageCircle2,
    IconPhone,
    IconSearch,
} from "@tabler/icons-react"

type FAQ = {
    id: string
    q: string
    a: string
    cat: "submissions" | "schedule" | "results" | "notifications" | "privacy" | "account"
}

const FAQS: FAQ[] = [
    {
        id: "f1",
        q: "What file formats are accepted for submissions?",
        a: "Upload PDF for final documents and DOCX for drafts. Supplementary materials (CSV, ZIP) are allowed where requested by your adviser.",
        cat: "submissions",
    },
    {
        id: "f2",
        q: "Can I reschedule my defense slot?",
        a: "Yes. Go to Schedule → select your booking → choose Reschedule. Slots depend on availability and coordinator approval.",
        cat: "schedule",
    },
    {
        id: "f3",
        q: "When are results released after defense?",
        a: "Typically within 24–72 hours once all panel votes and rubric entries are finalized by the chair.",
        cat: "results",
    },
    {
        id: "f4",
        q: "I’m not receiving emails. How do I fix notifications?",
        a: "Open Settings → Notifications to verify channels (email/SMS/push) and delivery frequency. Check your spam folder and school email filters.",
        cat: "notifications",
    },
    {
        id: "f5",
        q: "Who can access my files and grades?",
        a: "By default: you, your adviser, panel members, and authorized program heads. Public access is disabled unless you opt-in for schedule boards.",
        cat: "privacy",
    },
    {
        id: "f6",
        q: "I can’t sign in to my account.",
        a: "Use Forgot Password on the login screen. If the issue persists, contact support with your Student ID and program.",
        cat: "account",
    },
]

export default function StudentHelpSupport() {
    const [q, setQ] = React.useState("")
    const [cat, setCat] = React.useState<"all" | FAQ["cat"]>("all")

    const filtered = FAQS.filter((f) => (cat === "all" ? true : f.cat === cat)).filter((f) => {
        const hay = `${f.q} ${f.a}`.toLowerCase()
        return !q || hay.includes(q.toLowerCase())
    })

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="flex min-h-dvh flex-col">
                <SiteHeader />
                <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
                    {/* Header */}
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                        <div>
                            <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Help &amp; Support</h1>
                            <p className="text-muted-foreground text-sm">Find answers quickly or reach out to us.</p>
                        </div>
                        {/* Buttons: vertical on mobile, horizontal on sm+ */}
                        <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                            <Button asChild variant="outline" className="w-full cursor-pointer sm:w-auto">
                                <Link to="/dashboard/student">Back to Dashboard</Link>
                            </Button>
                        </div>
                    </div>

                    {/* Controls (vertical on mobile) */}
                    <Card>
                        <CardHeader className="gap-3 sm:flex-row sm:items-end sm:justify-between">
                            <div>
                                <CardTitle className="text-base sm:text-lg">Search FAQs</CardTitle>
                                <CardDescription>Filter by category or search keywords.</CardDescription>
                            </div>
                            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center">
                                {/* Search */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <IconSearch className="size-4 text-muted-foreground" />
                                    <Label htmlFor="q" className="sr-only">
                                        Search
                                    </Label>
                                    <Input
                                        id="q"
                                        placeholder="Search questions…"
                                        value={q}
                                        onChange={(e) => setQ(e.target.value)}
                                        className="w-full sm:w-64"
                                    />
                                </div>

                                {/* Category */}
                                <div className="flex w-full items-center gap-2 sm:w-auto">
                                    <Label htmlFor="cat" className="sr-only">
                                        Category
                                    </Label>
                                    <Select value={cat} onValueChange={(v) => setCat(v as any)}>
                                        <SelectTrigger id="cat" className="w-full cursor-pointer sm:w-48">
                                            <SelectValue placeholder="All categories" />
                                        </SelectTrigger>
                                        <SelectContent align="end">
                                            <SelectItem value="all">All categories</SelectItem>
                                            <SelectItem value="submissions">Submissions</SelectItem>
                                            <SelectItem value="schedule">Schedule</SelectItem>
                                            <SelectItem value="results">Results</SelectItem>
                                            <SelectItem value="notifications">Notifications</SelectItem>
                                            <SelectItem value="privacy">Privacy</SelectItem>
                                            <SelectItem value="account">Account</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <Separator />
                        <CardContent className="pt-4">
                            {/* Responsive grid: single column on mobile, 3 cols on lg+ */}
                            <div className="grid gap-6 lg:grid-cols-3">
                                {/* Quick actions */}
                                <div className="space-y-4">
                                    <Card>
                                        <CardHeader className="pb-2">
                                            <CardTitle className="text-sm">Quick Actions</CardTitle>
                                            <CardDescription>Fast ways to get help</CardDescription>
                                        </CardHeader>
                                        <CardContent className="grid gap-2">
                                            <Button variant="outline" className="w-full justify-start cursor-pointer">
                                                <IconMessageCircle2 className="mr-2 size-4" />
                                                Open a Ticket
                                            </Button>
                                            <Button variant="outline" className="w-full justify-start cursor-pointer">
                                                <IconMail className="mr-2 size-4" />
                                                Email Support
                                            </Button>
                                            <Button variant="outline" className="w-full justify-start cursor-pointer">
                                                <IconPhone className="mr-2 size-4" />
                                                Call Coordinator
                                            </Button>
                                            <Button asChild variant="ghost" className="w-full justify-start cursor-pointer">
                                                <Link to="/dashboard/student/submissions">
                                                    <IconFileDescription className="mr-2 size-4" />
                                                    Go to Submissions
                                                </Link>
                                            </Button>
                                        </CardContent>
                                    </Card>

                                    <div className="flex items-start gap-2 rounded-md border p-3 text-xs text-muted-foreground">
                                        <IconAlertCircle className="mt-0.5 size-4" />
                                        <span>
                                            Tip: For revision items after defense, check{" "}
                                            <Link to="/dashboard/student/results" className="underline underline-offset-2">
                                                Results
                                            </Link>{" "}
                                            and{" "}
                                            <Link to="/dashboard/student/notifications" className="underline underline-offset-2">
                                                Notifications
                                            </Link>
                                            .
                                        </span>
                                    </div>
                                </div>

                                {/* FAQ accordion (spans 2 columns on desktop) */}
                                <div className="lg:col-span-2">
                                    <Accordion type="single" collapsible className="w-full">
                                        {filtered.length === 0 ? (
                                            <div className="rounded-md border p-4 text-sm text-muted-foreground">
                                                No FAQs matched your search.
                                            </div>
                                        ) : (
                                            filtered.map((f) => (
                                                <AccordionItem key={f.id} value={f.id}>
                                                    <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                                                    <AccordionContent>
                                                        <div className="space-y-2">
                                                            <p className="text-sm">{f.a}</p>
                                                            <Badge variant="secondary" className="mt-1">
                                                                {f.cat}
                                                            </Badge>
                                                        </div>
                                                    </AccordionContent>
                                                </AccordionItem>
                                            ))
                                        )}
                                    </Accordion>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </main>
            </SidebarInset>
        </SidebarProvider>
    )
}
