import Image from "next/image"
import { Loader2 } from "lucide-react"

export default function Loading() {
    return (
        <div className="flex min-h-[60vh] w-full flex-col items-center justify-center gap-4 bg-background px-4 py-10">
            <div className="grid place-items-center">
                {/* Logo */}
                <div className="rounded-2xl border bg-card p-3 shadow-sm">
                    <Image
                        src="/logo.svg"
                        alt="Logo"
                        width={56}
                        height={56}
                        priority
                        className="select-none"
                    />
                </div>
            </div>

            {/* Loader + text using theme tokens */}
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <span className="text-foreground/80">Loading…</span>
            </div>
        </div>
    )
}
