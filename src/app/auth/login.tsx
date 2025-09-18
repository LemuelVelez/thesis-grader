import { Link } from "react-router-dom"
import { useState } from "react"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function LoginPage() {
    const [loading, setLoading] = useState(false)

    const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault()
        setLoading(true)
        const form = new FormData(e.currentTarget)
        const email = String(form.get("email") || "")
        const password = String(form.get("password") || "")
        // TODO: wire to real auth service
        console.log("login", { email, password })
        setLoading(false)
    }

    return (
        <main className="min-h-dvh grid place-items-center px-4 py-10">
            {/* Back to Welcome */}
            <div className="absolute left-4 top-4 sm:left-6 sm:top-6">
                <Button asChild variant="ghost" className="gap-2">
                    <Link to="/welcome" aria-label="Back to Welcome">
                        <ArrowLeft className="h-4 w-4" />
                        <span className="hidden sm:inline">Back to Welcome</span>
                    </Link>
                </Button>
            </div>

            <Card className="w-full max-w-md">
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
                            <Input id="password" name="password" type="password" required />
                        </div>
                        <div className="flex items-center justify-between text-sm">
                            <label className="flex items-center gap-2">
                                <input id="remember" name="remember" type="checkbox" className="size-4 rounded border" />
                                <span className="text-muted-foreground">Remember me</span>
                            </label>
                            <Link to="/auth/forgot" className="underline underline-offset-4 hover:text-foreground">
                                Forgot password?
                            </Link>
                        </div>
                        <Button type="submit" disabled={loading}>
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
