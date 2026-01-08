import Header from "@/components/Header"
import Hero from "@/components/Hero"
import Features from "@/components/Features"
import HowItWorks from "@/components/HowItWorks"
import Roles from "@/components/Roles"
import Footer from "@/components/Footer"

export default function Page() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header />

      {/* overflow-x-hidden prevents the blurred background blob from creating horizontal scroll */}
      <main className="relative overflow-x-hidden">
        {/* subtle background decoration */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 mask-[radial-gradient(60%_40%_at_50%_0%,black,transparent)]"
        >
          <div className="absolute inset-0 bg-[linear-gradient(to_right,hsl(var(--border))_1px,transparent_1px),linear-gradient(to_bottom,hsl(var(--border))_1px,transparent_1px)] bg-size-[48px_48px] opacity-40" />
          <div className="absolute -top-40 left-1/2 h-105 w-180 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
        </div>

        <Hero />
        <Features />
        <HowItWorks />
        <Roles />
      </main>

      <Footer />
    </div>
  )
}
