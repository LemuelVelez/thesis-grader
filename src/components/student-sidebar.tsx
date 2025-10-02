import * as React from "react"
import {
  IconCalendarEvent,
  IconDashboard,
  IconFileDescription,
  IconInnerShadowTop,
  IconSettings,
} from "@tabler/icons-react"
import { NavUser } from "@/components/nav-user"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import { NavLink, useLocation, matchPath } from "react-router-dom"

const data = {
  user: {
    name: "Student User",
    email: "student@example.edu",
    avatar: "/avatars/shadcn.jpg",
  },
  // Focus the main nav on student flows
  navMain: [
    {
      title: "Dashboard",
      url: "/dashboard/student",
      icon: IconDashboard,
    },
    {
      title: "Submissions",
      url: "/dashboard/student/submissions",
      icon: IconFileDescription,
    },
    {
      title: "Schedule",
      url: "/dashboard/student/schedule",
      icon: IconCalendarEvent,
    },
  ],
  navSecondary: [
    {
      title: "Profile & Settings",
      url: "/dashboard/student/settings",
      icon: IconSettings,
    },
  ],
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const location = useLocation()

  return (
    <Sidebar collapsible="offcanvas" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              className="data-[slot=sidebar-menu-button]:!p-1.5 border-none"
            >
              <NavLink to="/dashboard/student">
                <IconInnerShadowTop className="!size-5" />
                <span className="text-base font-semibold">ThesisGrader</span>
              </NavLink>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        {/* Main nav with minimal active highlight */}
        <SidebarMenu>
          {data.navMain.map((item) => {
            const Icon = item.icon

            // Exact match for dashboard root; nested for others
            const isActive = !!matchPath(
              { path: item.url, end: item.url === "/dashboard/student" },
              location.pathname
            )

            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={`relative transition-colors ${isActive
                    ? "bg-muted/70 font-medium text-foreground"
                    : "hover:bg-muted/40"
                    }`}
                >
                  <NavLink
                    to={item.url}
                    aria-current={isActive ? "page" : undefined}
                    className="flex items-center gap-2 pl-3"
                  >
                    {/* Minimal left indicator bar */}
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1.5 rounded-full ${isActive ? "bg-primary" : "bg-transparent"
                        }`}
                      aria-hidden="true"
                    />
                    <Icon className="!size-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>

        {/* Secondary nav (Profile & Settings) with active indicator */}
        <SidebarMenu className="mt-auto">
          {data.navSecondary.map((item) => {
            const Icon = item.icon
            const isActive = !!matchPath(
              { path: item.url, end: false },
              location.pathname
            )
            return (
              <SidebarMenuItem key={item.title}>
                <SidebarMenuButton
                  asChild
                  className={`relative transition-colors ${isActive
                    ? "bg-muted/70 font-medium text-foreground"
                    : "hover:bg-muted/40"
                    }`}
                >
                  <NavLink
                    to={item.url}
                    aria-current={isActive ? "page" : undefined}
                    className="flex items-center gap-2 pl-3"
                  >
                    <span
                      className={`absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1.5 rounded-full ${isActive ? "bg-primary" : "bg-transparent"
                        }`}
                      aria-hidden="true"
                    />
                    <Icon className="!size-4" />
                    <span>{item.title}</span>
                  </NavLink>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter>
        <NavUser user={data.user} />
      </SidebarFooter>
    </Sidebar>
  )
}
