import Image from "next/image"
import Link from "next/link"
import { Sparkles, ShieldCheck, ClipboardList, BarChart3 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"

export default function Hero() {
    return (
        <section className="relative">
            <div className="mx-auto  px-4 pb-10 pt-10 sm:px-6 sm:pb-14 sm:pt-14 lg:pb-18">
                {/* Desktop / Large */}
                <div className="hidden items-center gap-10 lg:grid lg:grid-cols-2">
                    <div>
                        <Badge variant="secondary" className="mb-4 inline-flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5" />
                            Web-Based Evaluation & Grading System
                        </Badge>

                        <h1 className="text-balance text-4xl font-semibold tracking-tight xl:text-5xl">
                            Grade thesis defenses faster, fairer, and fully auditable.
                        </h1>

                        <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground">
                            THESISGRADER streamlines scheduling, rubric scoring, feedback, finalization locks, and admin reporting—
                            with strict role-based access for Students, Staff, and Admin.
                        </p>

                        <div className="mt-7 flex flex-wrap items-center gap-3">
                            <Button asChild size="lg">
                                <Link href="/login">Get started</Link>
                            </Button>
                            <Button asChild size="lg" variant="outline">
                                <Link href="#how-it-works">See how it works</Link>
                            </Button>
                        </div>

                        <Separator className="my-8" />

                        <div className="grid grid-cols-2 gap-4">
                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="h-5 w-5" />
                                        <div>
                                            <div className="text-sm font-medium">RBAC by design</div>
                                            <div className="text-xs text-muted-foreground">Exactly 3 roles. No overreach.</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <ClipboardList className="h-5 w-5" />
                                        <div>
                                            <div className="text-sm font-medium">Rubric scoring</div>
                                            <div className="text-xs text-muted-foreground">Criteria, weights, versioning.</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <BarChart3 className="h-5 w-5" />
                                        <div>
                                            <div className="text-sm font-medium">Admin reports</div>
                                            <div className="text-xs text-muted-foreground">Program & semester insights.</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardContent className="p-4">
                                    <div className="flex items-center gap-3">
                                        <ShieldCheck className="h-5 w-5" />
                                        <div>
                                            <div className="text-sm font-medium">Audit trail</div>
                                            <div className="text-xs text-muted-foreground">Immutable action logging.</div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>

                    <div className="relative">
                        <div className="absolute -inset-6 -z-10 rounded-3xl bg-primary/10 blur-2xl" />

                        <Card className="overflow-hidden">
                            <CardContent className="p-0">
                                {/* Rounded corners ensured here */}
                                <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl">
                                    <Image
                                        src="/Hero.svg"
                                        alt="THESISGRADER hero illustration"
                                        fill
                                        className="object-cover"
                                        priority
                                    />
                                </div>
                            </CardContent>
                        </Card>

                        <div className="mt-4 grid grid-cols-3 gap-3">
                            <Card>
                                <CardContent className="p-3 text-center">
                                    <div className="text-sm font-semibold">Schedules</div>
                                    <div className="text-xs text-muted-foreground">Staff-managed</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-3 text-center">
                                    <div className="text-sm font-semibold">Evaluations</div>
                                    <div className="text-xs text-muted-foreground">Lock on finalize</div>
                                </CardContent>
                            </Card>
                            <Card>
                                <CardContent className="p-3 text-center">
                                    <div className="text-sm font-semibold">Reports</div>
                                    <div className="text-xs text-muted-foreground">Admin-only</div>
                                </CardContent>
                            </Card>
                        </div>
                    </div>
                </div>

                {/* Mobile / Extra small */}
                <div className="grid gap-6 lg:hidden">
                    <div className="flex flex-col items-start gap-2">
                        <Badge variant="secondary" className="inline-flex items-center gap-2">
                            <Sparkles className="h-3.5 w-3.5" />
                            THESISGRADER
                        </Badge>
                        <Badge variant="outline">3 Roles</Badge>
                    </div>

                    <h1 className="text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
                        Grade thesis defenses with structure and speed.
                    </h1>

                    <p className="text-pretty text-sm text-muted-foreground sm:text-base">
                        Scheduling, rubrics, scoring, feedback, finalization locks, reports, and audit logs—built around strict role
                        permissions.
                    </p>

                    <Card className="overflow-hidden">
                        <CardContent className="p-0">
                            {/* Rounded corners ensured here */}
                            <div className="relative aspect-4/3 w-full overflow-hidden rounded-xl">
                                <Image
                                    src="/Hero.svg"
                                    alt="THESISGRADER hero illustration"
                                    fill
                                    className="object-cover"
                                    priority
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <div className="grid gap-3">
                        <Button asChild className="w-full">
                            <Link href="/login">Get started</Link>
                        </Button>
                        <Button asChild variant="outline" className="w-full">
                            <Link href="#roles">View roles</Link>
                        </Button>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <ShieldCheck className="h-5 w-5" />
                                    <div>
                                        <div className="text-sm font-medium">Role-based access</div>
                                        <div className="text-xs text-muted-foreground">Student • Staff • Admin</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="p-4">
                                <div className="flex items-center gap-3">
                                    <ClipboardList className="h-5 w-5" />
                                    <div>
                                        <div className="text-sm font-medium">Rubric scoring</div>
                                        <div className="text-xs text-muted-foreground">Weighted criteria & comments</div>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </div>
            </div>
        </section>
    )
}
