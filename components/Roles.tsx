"use client"

import { CheckCircle2, XCircle } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"

type RoleKey = "student" | "staff" | "admin"

const roleData: Record<
    RoleKey,
    {
        title: string
        subtitle: string
        can: string[]
        cannot: string[]
        highlight: string
    }
> = {
    student: {
        title: "STUDENT",
        subtitle: "View schedule + evaluate only",
        highlight: "No uploads. No schedules. No score edits.",
        can: [
            "View own thesis defense schedule (date/time/room/panelists)",
            "Answer the evaluation form (rubrics) during/after the allowed window",
            "View evaluation status (submitted / pending) and final result (if released by Admin)",
        ],
        cannot: [
            "Upload or submit thesis files",
            "Create, request, or modify schedules",
            "Edit scores or feedback",
            "View other students’ schedules, scores, or feedback",
        ],
    },
    staff: {
        title: "STAFF",
        subtitle: "Panelist / faculty evaluator",
        highlight: "Schedules + scoring + feedback + finalize lock.",
        can: [
            "Create/manage defense schedules (student/group + panel + time + venue)",
            "Encode scores per rubric criterion",
            "Provide feedback/comments (per criterion + overall)",
            "Finalize an evaluation (locks the submission)",
            "View assigned schedules and evaluation history for assignments",
        ],
        cannot: ["Manage global user accounts (Admin-only)", "Delete audit logs"],
    },
    admin: {
        title: "ADMIN",
        subtitle: "Thesis coordinator / system administrator",
        highlight: "Oversight, reports, settings, and audit-backed overrides.",
        can: [
            "Manage users (create accounts, reset passwords, assign roles)",
            "Manage thesis records (groups, titles, advisers, program, term)",
            "Manage rubrics/templates (criteria, weights, scoring rules, versions)",
            "View reports (program, semester, panelist, student/group)",
            "Override/unlock evaluations with required audit trail (reason + timestamp + actor)",
        ],
        cannot: ["Score as an evaluator by default (recommended separation of duties)"],
    },
}

function ListItem({ text, type }: { text: string; type: "can" | "cannot" }) {
    return (
        <li className="flex items-start gap-2">
            {type === "can" ? <CheckCircle2 className="mt-0.5 h-4 w-4" /> : <XCircle className="mt-0.5 h-4 w-4" />}
            <span className="text-sm text-muted-foreground">{text}</span>
        </li>
    )
}

export default function Roles() {
    return (
        <section id="roles" className="border-t">
            <div className="mx-auto px-4 py-12 sm:px-6 sm:py-16">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                        <Badge variant="secondary">Roles & permissions</Badge>
                        <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                            Exactly three roles. Clear boundaries.
                        </h2>
                        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                            Prevent role overreach with strict visibility rules and audit-backed administration.
                        </p>
                    </div>
                    <div className="hidden sm:block">
                        <Badge variant="outline">RBAC</Badge>
                    </div>
                </div>

                <Separator className="my-8" />

                {/* Desktop: Tabs (kept) */}
                <div className="hidden lg:block">
                    <Tabs defaultValue="student" className="w-full">
                        <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="student">Student</TabsTrigger>
                            <TabsTrigger value="staff">Staff</TabsTrigger>
                            <TabsTrigger value="admin">Admin</TabsTrigger>
                        </TabsList>

                        {(["student", "staff", "admin"] as RoleKey[]).map((key) => {
                            const r = roleData[key]
                            return (
                                <TabsContent key={key} value={key} className="mt-6">
                                    <div className="grid grid-cols-12 gap-4">
                                        <Card className="col-span-5">
                                            <CardHeader>
                                                <CardTitle className="flex items-center justify-between">
                                                    <span>{r.title}</span>
                                                    <Badge variant="secondary">{r.subtitle}</Badge>
                                                </CardTitle>
                                            </CardHeader>
                                            <CardContent className="space-y-3">
                                                <p className="text-sm text-muted-foreground">{r.highlight}</p>
                                                <Separator />
                                                <div className="grid gap-2">
                                                    <div className="text-sm font-medium">Key rule</div>
                                                    <p className="text-sm text-muted-foreground">
                                                        Visibility is scoped to the user’s assignments (students: self; staff: assigned; admin: all).
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>

                                        <Card className="col-span-7">
                                            <CardContent className="p-0">
                                                <div className="grid grid-cols-2">
                                                    <div className="border-r p-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-sm font-semibold">Can</div>
                                                            <Badge variant="outline">Allowed</Badge>
                                                        </div>
                                                        <ul className="mt-4 space-y-3">
                                                            {r.can.map((t) => (
                                                                <ListItem key={t} text={t} type="can" />
                                                            ))}
                                                        </ul>
                                                    </div>

                                                    <div className="p-6">
                                                        <div className="flex items-center justify-between">
                                                            <div className="text-sm font-semibold">Cannot</div>
                                                            <Badge variant="outline">Restricted</Badge>
                                                        </div>
                                                        <ul className="mt-4 space-y-3">
                                                            {r.cannot.map((t) => (
                                                                <ListItem key={t} text={t} type="cannot" />
                                                            ))}
                                                        </ul>
                                                    </div>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </div>
                                </TabsContent>
                            )
                        })}
                    </Tabs>
                </div>

                {/* Mobile: Accordion (no Tabs) */}
                <div className="lg:hidden">
                    <Accordion type="single" collapsible defaultValue="student" className="w-full">
                        {(["student", "staff", "admin"] as RoleKey[]).map((key) => {
                            const r = roleData[key]
                            return (
                                <AccordionItem key={key} value={key}>
                                    <AccordionTrigger className="text-left">
                                        {/* title + badge -> vertical */}
                                        <span className="flex w-full flex-col items-start gap-2">
                                            <span className="font-semibold">{r.title}</span>
                                            <Badge variant="secondary" className="text-xs">
                                                {r.subtitle}
                                            </Badge>
                                        </span>
                                    </AccordionTrigger>

                                    <AccordionContent>
                                        <Card className="border-0 shadow-none">
                                            <CardContent className="space-y-4 p-0 pt-2">
                                                <p className="text-sm text-muted-foreground">{r.highlight}</p>

                                                <Separator />

                                                <div className="grid gap-3">
                                                    {/* label + badge -> vertical */}
                                                    <div className="flex flex-col items-start gap-1">
                                                        <div className="text-sm font-semibold">Can</div>
                                                        <Badge variant="outline">Allowed</Badge>
                                                    </div>

                                                    <ScrollArea className="h-40 rounded-md border">
                                                        <ul className="space-y-3 p-4">
                                                            {r.can.map((t) => (
                                                                <ListItem key={t} text={t} type="can" />
                                                            ))}
                                                        </ul>
                                                    </ScrollArea>
                                                </div>

                                                <div className="grid gap-3">
                                                    {/* label + badge -> vertical */}
                                                    <div className="flex flex-col items-start gap-1">
                                                        <div className="text-sm font-semibold">Cannot</div>
                                                        <Badge variant="outline">Restricted</Badge>
                                                    </div>

                                                    <ScrollArea className="h-32 rounded-md border">
                                                        <ul className="space-y-3 p-4">
                                                            {r.cannot.map((t) => (
                                                                <ListItem key={t} text={t} type="cannot" />
                                                            ))}
                                                        </ul>
                                                    </ScrollArea>
                                                </div>

                                                <div className="rounded-md border bg-card p-4">
                                                    <div className="text-sm font-medium">Key rule</div>
                                                    <p className="mt-1 text-sm text-muted-foreground">
                                                        Visibility is scoped to the user’s assignments (students: self; staff: assigned; admin: all).
                                                    </p>
                                                </div>
                                            </CardContent>
                                        </Card>
                                    </AccordionContent>
                                </AccordionItem>
                            )
                        })}
                    </Accordion>
                </div>
            </div>
        </section>
    )
}
