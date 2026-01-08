import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { Suspense } from "react"
import "./globals.css"

import Loading from "@/components/loading"
import { Toaster } from "@/components/ui/sonner"
import NotFoundPage from "./404/page"

export { NotFoundPage }

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: {
    default: "THESISGRADER",
    template: "%s | THESISGRADER",
  },
  description:
    "Web-Based Evaluation & Grading System for Thesis Panel Review. Built for Students, Staff, and Admin with rubric scoring, scheduling, reports, and audit logs.",
  applicationName: "THESISGRADER",
  keywords: [
    "thesis grader",
    "thesis evaluation",
    "rubric scoring",
    "thesis defense",
    "panel review",
    "grading system",
    "scheduling",
    "audit logs",
    "reports",
    "RBAC",
  ],
  authors: [{ name: "THESISGRADER Team" }],
  creator: "THESISGRADER Team",
  publisher: "THESISGRADER",
  metadataBase: new URL("http://localhost:3000"),
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "THESISGRADER",
    description:
      "Web-Based Evaluation & Grading System for Thesis Panel Review with strict role-based access (Student, Staff, Admin).",
    type: "website",
    url: "/",
    siteName: "THESISGRADER",
  },
  twitter: {
    card: "summary_large_image",
    title: "THESISGRADER",
    description:
      "Web-Based Evaluation & Grading System for Thesis Panel Review with strict role-based access (Student, Staff, Admin).",
  },
  robots: {
    index: true,
    follow: true,
  },
  category: "education",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <Suspense fallback={<Loading />}>{children}</Suspense>

        {/* shadcn/ui sonner toaster */}
        <Toaster richColors closeButton />
      </body>
    </html>
  )
}
