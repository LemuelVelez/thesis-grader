"use client"

import Image from "next/image"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { Menu, ArrowRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import {
    NavigationMenu,
    NavigationMenuItem,
    NavigationMenuList,
    navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu"

const nav = [
    { label: "Features", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Roles", href: "#roles" },
] as const

export default function Header() {
    const [activeHref, setActiveHref] = useState<string>("")
    const [sheetOpen, setSheetOpen] = useState(false)

    const sectionIds = useMemo(() => nav.map((n) => n.href.replace("#", "")), [])

    useEffect(() => {
        const sections = sectionIds
            .map((id) => document.getElementById(id))
            .filter(Boolean) as HTMLElement[]

        if (!sections.length) return

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0))

                if (visible.length) {
                    const id = (visible[0].target as HTMLElement).id
                    setActiveHref(`#${id}`)
                }
            },
            {
                root: null,
                threshold: [0.15, 0.25, 0.4, 0.6],
                rootMargin: "-20% 0px -65% 0px",
            }
        )

        sections.forEach((s) => observer.observe(s))
        return () => observer.disconnect()
    }, [sectionIds])

    const activeClass = "bg-accent text-accent-foreground font-semibold"

    return (
        <header className="sticky top-0 z-40 w-full border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
            <div className="mx-auto flex h-16  items-center justify-between px-4 sm:px-6">
                <div className="flex items-center gap-3">
                    <Link href="#" className="flex items-center gap-2">
                        <Image src="/logo.svg" alt="THESISGRADER logo" width={32} height={32} priority />
                        <div className="leading-tight">
                            <div className="text-sm font-semibold tracking-tight sm:text-base">THESISGRADER</div>
                            <div className="hidden text-xs text-muted-foreground sm:block">Web-Based Evaluation & Grading</div>
                        </div>
                    </Link>

                    <Separator orientation="vertical" className="hidden h-7 sm:block" />
                    <Badge className="hidden sm:inline-flex" variant="secondary">
                        Thesis Panel Review
                    </Badge>
                </div>

                {/* Desktop nav */}
                <div className="hidden items-center gap-3 md:flex">
                    <NavigationMenu>
                        <NavigationMenuList>
                            {nav.map((item) => (
                                <NavigationMenuItem key={item.href}>
                                    <Link
                                        href={item.href}
                                        onClick={() => setActiveHref(item.href)}
                                        className={cn(navigationMenuTriggerStyle(), activeHref === item.href && activeClass)}
                                        aria-current={activeHref === item.href ? "page" : undefined}
                                    >
                                        {item.label}
                                    </Link>
                                </NavigationMenuItem>
                            ))}
                        </NavigationMenuList>
                    </NavigationMenu>

                    <Separator orientation="vertical" className="h-7" />
                    <Button asChild>
                        <Link href="/login" className="inline-flex items-center gap-2">
                            Open app <ArrowRight className="h-4 w-4" />
                        </Link>
                    </Button>
                </div>

                {/* Mobile nav */}
                <div className="sticky flex items-center gap-2 top-0 z-40 md:hidden">
                    <Button asChild variant="secondary" className="hidden xs:inline-flex">
                        <Link href="/login">Open app</Link>
                    </Button>

                    <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
                        <SheetTrigger asChild>
                            <Button variant="outline" size="icon" aria-label="Open menu">
                                <Menu className="h-5 w-5" />
                            </Button>
                        </SheetTrigger>

                        <SheetContent side="right" className="w-60 sm:w-90">
                            <SheetHeader>
                                <SheetTitle className="flex items-center gap-2">
                                    <Image src="/logo.svg" alt="Logo" width={28} height={28} />
                                    THESISGRADER
                                </SheetTitle>
                            </SheetHeader>

                            <div className="mt-6 mx-2 grid gap-2">
                                {nav.map((item) => (
                                    <Button
                                        key={item.href}
                                        asChild
                                        variant={activeHref === item.href ? "secondary" : "ghost"}
                                        className={cn("justify-start", activeHref === item.href && "font-semibold")}
                                        onClick={() => {
                                            setActiveHref(item.href)
                                            setSheetOpen(false) // ✅ close sheet after click
                                        }}
                                    >
                                        <Link href={item.href}>{item.label}</Link>
                                    </Button>
                                ))}

                                <Separator className="my-2" />

                                <Button
                                    asChild
                                    onClick={() => {
                                        setSheetOpen(false) // ✅ close sheet after click
                                    }}
                                >
                                    <Link href="/login" className="inline-flex items-center justify-between">
                                        Open app <ArrowRight className="h-4 w-4" />
                                    </Link>
                                </Button>

                                <p className="mt-3 text-xs text-muted-foreground">
                                    Students evaluate only. Staff score & feedback. Admin manages system & reports.
                                </p>
                            </div>
                        </SheetContent>
                    </Sheet>
                </div>
            </div>
        </header>
    )
}
