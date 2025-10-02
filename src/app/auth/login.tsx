import { Link, useNavigate } from "react-router-dom"
import { useState } from "react"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
    const navigate = useNavigate()
    const [loading, setLoading] = useState(false)
    const [showPassword, setShowPassword] = useState(false)

    const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault()
        setLoading(true)
        const form = new FormData(e.currentTarget)
        const email = String(form.get("email") || "")
        const password = String(form.get("password") || "")
        // TODO: wire to real auth service; backend will handle role-based redirect.
        console.log("login", { email, password })

        // For now, route students to the Student Dashboard after "login"
        navigate("/dashboard/student", { replace: true })
        setLoading(false)
    }

    return (
        <main className="relative min-h-dvh grid place-items-center px-4 py-10">
            {/* Blue ambient background */}
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
                <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_-10%,hsl(var(--primary)/0.18),transparent_60%)]" />
                <div className="absolute inset-0 opacity-[0.06] [background:linear-gradient(to_right,transparent_0,transparent_31px,hsl(var(--ring)/.5)_32px),linear-gradient(to_bottom,transparent_0,transparent_31px,hsl(var(--ring)/.5)_32px)] [background-size:32px_32px]" />
            </div>

            {/* Back to Welcome */}
            <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
                <Button asChild variant="ghost" className="gap-2 cursor-pointer">
                    <Link to="/welcome" aria-label="Back to Welcome">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Back to Welcome</span>
                    </Link>
                </Button>
            </div>

            <Card className="w-full max-w-md transition-all hover:shadow-xl hover:shadow-[hsl(var(--ring)/.18)]">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl">Welcome back</CardTitle>
                    <CardDescription>Sign in to your ThesisGrader account</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-4" onSubmit={onSubmit}>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="you@school.edu" required />
                        </div>

                        <div className="grid gap-2">
                            <Label htmlFor="password">Password</Label>
                            <div className="relative">
                                <Input
                                    id="password"
                                    name="password"
                                    placeholder="••••••••"
                                    type={showPassword ? "text" : "password"}
                                    required
                                    className="pr-10"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? "Hide password" : "Show password"}
                                    aria-pressed={showPassword}
                                    className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-md px-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                                >
                                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                </button>
                            </div>
                        </div>

                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input id="remember" name="remember" type="checkbox" className="size-4 rounded border" />
                                <span className="text-muted-foreground">Remember me</span>
                            </label>
                            <Link to="/auth/forgot" className="underline underline-offset-4 hover:text-foreground">
                                Forgot password?
                            </Link>
                        </div>

                        <Button type="submit" disabled={loading} className="cursor-pointer">
                            {loading ? "Signing in…" : "Sign in"}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Don&apos;t have an account?{" "}
                        <Link to="/auth/register" className="underline underline-offset-4">
                            Create one
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    )
}
