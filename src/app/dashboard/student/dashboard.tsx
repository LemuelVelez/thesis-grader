import * as React from "react"
import { Link } from "react-router-dom"
import { AppSidebar } from "@/components/student-sidebar"
import { SiteHeader } from "@/components/site-header"
import { ChartAreaInteractive } from "@/components/chart-area-interactive"
import { DataTable } from "@/components/data-table"
import data from "@/app/dashboard/data.json"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  SidebarInset,
  SidebarProvider,
} from "@/components/ui/sidebar"
import { Badge } from "@/components/ui/badge"
import { IconClipboardText, IconFileDescription, IconHistory, IconPencil } from "@tabler/icons-react"

export default function StudentDashboard() {
  const total = data.length
  const done = data.filter((i) => i.status === "Done").length
  const inProcess = data.filter((i) => i.status !== "Done").length

  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset className="flex min-h-dvh flex-col">
        <SiteHeader />
        <main className="flex flex-1 flex-col gap-6 p-4 lg:p-6">
          {/* Page header */}
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Student Dashboard</h1>
              <p className="text-muted-foreground text-sm">
                Track your thesis sections, progress, and recent activity.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="outline" className="cursor-pointer">
                <Link to="/dashboard/student/submissions">
                  View Submissions
                </Link>
              </Button>
              <Button className="cursor-pointer">
                <IconPencil className="mr-2 size-4" />
                New Upload
              </Button>
            </div>
          </div>

          {/* Quick stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <StatCard
              title="Total Sections"
              value={String(total)}
              description="All required sections for your manuscript"
              icon={<IconClipboardText className="size-5" />}
            />
            <StatCard
              title="Completed"
              value={String(done)}
              description="Marked as done and ready for review"
              icon={<IconFileDescription className="size-5" />}
              chip={<Badge variant="secondary">Auto-saved</Badge>}
            />
            <StatCard
              title="In Process"
              value={String(inProcess)}
              description="Still being drafted or revised"
              icon={<IconHistory className="size-5" />}
            />
          </div>

          {/* Trend + Outline (VERTICAL LAYOUT) */}
          <div className="flex flex-col gap-6">
            <div>
              <ChartAreaInteractive />
            </div>

            <Card className="@container">
              {/* Stacked header for vertical flow */}
              <CardHeader className="flex flex-col gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg">Outline & Section Controls</CardTitle>
                  <CardDescription>Drag to reorder, edit targets, and assign reviewers.</CardDescription>
                </div>
                <div>
                  <Button asChild size="sm" variant="outline" className="cursor-pointer">
                    <Link to="/dashboard/student/submissions">Go to Submissions</Link>
                  </Button>
                </div>
              </CardHeader>

              <Separator />
              <CardContent className="pt-4">
                {/* Data table area */}
                <DataTable data={data} />
              </CardContent>
            </Card>
          </div>
        </main>
      </SidebarInset>
    </SidebarProvider>
  )
}

function StatCard({
  title,
  value,
  description,
  icon,
  chip,
}: {
  title: string
  value: string
  description: string
  icon?: React.ReactNode
  chip?: React.ReactNode
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between space-y-0">
        <div className="flex items-center gap-2">
          <div className="rounded-lg border bg-muted/40 p-2">{icon}</div>
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        {chip}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <p className="text-muted-foreground mt-1 text-xs">{description}</p>
      </CardContent>
    </Card>
  )
}
