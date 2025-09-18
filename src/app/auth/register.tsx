import { Link } from "react-router-dom"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function RegisterPage() {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        const form = new FormData(e.currentTarget)
        const name = String(form.get("name") || "")
        const email = String(form.get("email") || "")
        const password = String(form.get("password") || "")
        const confirm = String(form.get("confirm") || "")

        if (password !== confirm) {
            setError("Passwords do not match.")
            setLoading(false)
            return
        }

        // TODO: wire to real registration service
        console.log("register", { name, email, password })
        setLoading(false)
    }

    return (
        <main className="min-h-dvh grid place-items-center px-4 py-10">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl">Create account</CardTitle>
                    <CardDescription>Join ThesisGrader to streamline thesis evaluations</CardDescription>
                </CardHeader>
                <CardContent>
                    <form className="grid gap-4" onSubmit={onSubmit}>
                        <div className="grid gap-2">
                            <Label htmlFor="name">Full name</Label>
                            <Input id="name" name="name" placeholder="Juan Dela Cruz" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" name="email" type="email" placeholder="you@school.edu" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="password">Password</Label>
                            <Input id="password" name="password" type="password" required />
                        </div>
                        <div className="grid gap-2">
                            <Label htmlFor="confirm">Confirm password</Label>
                            <Input id="confirm" name="confirm" type="password" required />
                        </div>
                        <div className="flex items-start gap-2 text-sm">
                            <input id="tos" name="tos" type="checkbox" required className="mt-1 size-4 rounded border" />
                            <Label htmlFor="tos" className="text-muted-foreground">
                                I agree to the Terms of Service and Privacy Policy.
                            </Label>
                        </div>
                        {error ? <p className="text-sm text-destructive">{error}</p> : null}
                        <Button type="submit" disabled={loading}>
                            {loading ? "Creating…" : "Create account"}
                        </Button>
                    </form>

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Already have an account?{" "}
                        <Link to="/auth/login" className="underline underline-offset-4">
                            Sign in
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    )
}
