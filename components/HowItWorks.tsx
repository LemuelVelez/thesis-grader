"use client"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion"

const steps = [
    {
        n: "01",
        title: "Admin sets the standards",
        desc: "Create users, configure rubric templates (criteria + weights + ranges), and enable system-wide settings and reports.",
    },
    {
        n: "02",
        title: "Staff schedules & evaluates",
        desc: "Assign schedules, encode scores per criterion, add feedback, then finalize to lock evaluations for integrity.",
    },
    {
        n: "03",
        title: "Students view & evaluate (only)",
        desc: "Students only see their own schedule and answer the evaluation form within allowed windows—no uploads, no edits, no scheduling.",
    },
] as const

export default function HowItWorks() {
    return (
        <section id="how-it-works" className="border-t">
            <div className="mx-auto  px-4 py-12 sm:px-6 sm:py-16">
                <Badge variant="secondary">How it works</Badge>
                <h2 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
                    A clean workflow from setup to final results.
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
                    Three roles. Clear responsibilities. Locked evaluations and audit logs for accountability.
                </p>

                <Separator className="my-8" />

                {/* Desktop / Large: step cards */}
                <div className="hidden gap-4 lg:grid lg:grid-cols-3">
                    {steps.map((s) => (
                        <Card key={s.n} className="relative overflow-hidden">
                            <div className="pointer-events-none absolute -right-12 -top-10 h-36 w-36 rounded-full bg-primary/15 blur-2xl" />
                            <CardContent className="p-6">
                                <div className="flex items-center justify-between">
                                    <Badge variant="outline">{s.n}</Badge>
                                    <Badge variant="secondary">Step</Badge>
                                </div>
                                <div className="mt-4 text-base font-semibold">{s.title}</div>
                                <div className="mt-2 text-sm text-muted-foreground">{s.desc}</div>
                            </CardContent>
                        </Card>
                    ))}
                </div>

                {/* Mobile / Small: accordion */}
                <div className="lg:hidden">
                    <Accordion type="single" collapsible className="w-full">
                        {steps.map((s) => (
                            <AccordionItem key={s.n} value={s.n}>
                                <AccordionTrigger className="text-left">
                                    <span className="flex items-center gap-3">
                                        <Badge variant="outline">{s.n}</Badge>
                                        <span className="font-medium">{s.title}</span>
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent className="text-sm text-muted-foreground">
                                    {s.desc}
                                </AccordionContent>
                            </AccordionItem>
                        ))}
                    </Accordion>
                </div>
            </div>
        </section>
    )
}
