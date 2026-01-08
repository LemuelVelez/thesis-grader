import Image from "next/image"
import Link from "next/link"
import { Shield } from "lucide-react"
import { Separator } from "@/components/ui/separator"
import { Badge } from "@/components/ui/badge"

export default function Footer() {
    return (
        <footer className="border-t">
            <div className="mx-auto  px-4 py-10 sm:px-6">
                <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                        <div className="flex items-center gap-2">
                            <Image src="/logo.svg" alt="THESISGRADER logo" width={28} height={28} />
                            <div className="font-semibold tracking-tight">THESISGRADER</div>
                            <Badge variant="secondary" className="ml-2 hidden sm:inline-flex">
                                Thesis Panel Review
                            </Badge>
                        </div>
                        <p className="max-w-sm text-sm text-muted-foreground">
                            A web-based evaluation & grading system built around strict roles, locked evaluations, and audit-ready
                            administration.
                        </p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                            <Shield className="h-4 w-4" />
                            Role-based access control (RBAC) • Audit logs • Reports
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-6 sm:grid-cols-3">
                        <div className="space-y-2">
                            <div className="text-sm font-semibold">Product</div>
                            <div className="grid gap-1">
                                <Link className="text-sm text-muted-foreground hover:text-foreground" href="#features">
                                    Features
                                </Link>
                                <Link className="text-sm text-muted-foreground hover:text-foreground" href="#how-it-works">
                                    How it works
                                </Link>
                                <Link className="text-sm text-muted-foreground hover:text-foreground" href="#roles">
                                    Roles
                                </Link>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-sm font-semibold">System</div>
                            <div className="grid gap-1">
                                <span className="text-sm text-muted-foreground">Scheduling</span>
                                <span className="text-sm text-muted-foreground">Rubrics</span>
                                <span className="text-sm text-muted-foreground">Audit logs</span>
                            </div>
                        </div>
                    </div>
                </div>

                <Separator className="my-8" />

                <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <div>© {new Date().getFullYear()} THESISGRADER. All rights reserved.</div>
                    <div className="flex items-center gap-3">
                        <span>Student • Staff • Admin</span>
                        <span className="hidden sm:inline">•</span>
                        <span>Built with shadcn/ui + Tailwind</span>
                    </div>
                </div>
            </div>
        </footer>
    )
}
