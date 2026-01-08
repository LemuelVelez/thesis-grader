import { Skeleton } from "@/components/ui/skeleton"
import { Card, CardContent } from "@/components/ui/card"

export default function Loading() {
    return (
        <div className="mx-auto  px-4 py-10 sm:px-6">
            {/* Header skeleton */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-36" />
                        <Skeleton className="h-3 w-44" />
                    </div>
                </div>
                <div className="hidden gap-2 sm:flex">
                    <Skeleton className="h-9 w-24" />
                    <Skeleton className="h-9 w-28" />
                </div>
                <Skeleton className="h-9 w-9 sm:hidden" />
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-2 lg:items-center">
                <div className="space-y-4">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-10 w-[90%]" />
                    <Skeleton className="h-10 w-[75%]" />
                    <Skeleton className="h-4 w-[88%]" />
                    <Skeleton className="h-4 w-[82%]" />
                    <div className="flex gap-3 pt-2">
                        <Skeleton className="h-10 w-28" />
                        <Skeleton className="h-10 w-32" />
                    </div>
                </div>

                <Card className="overflow-hidden">
                    <CardContent className="p-0">
                        <Skeleton className="h-65 w-full sm:h-80" />
                    </CardContent>
                </Card>
            </div>

            <div className="mt-10 grid gap-3 md:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                    <Card key={i}>
                        <CardContent className="space-y-3 p-4">
                            <Skeleton className="h-9 w-9 rounded-lg" />
                            <Skeleton className="h-4 w-40" />
                            <Skeleton className="h-3 w-[90%]" />
                            <Skeleton className="h-3 w-[70%]" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    )
}
