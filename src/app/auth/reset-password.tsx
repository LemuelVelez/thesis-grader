import { Link, useSearchParams } from "react-router-dom"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowLeft, Eye, EyeOff } from "lucide-react"

export default function ResetPasswordPage() {
    const [params] = useSearchParams()
    const token = params.get("token") || ""
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)
    const [showPassword, setShowPassword] = useState(false)
    const [showConfirm, setShowConfirm] = useState(false)

    const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        const form = new FormData(e.currentTarget)
        const newPassword = String(form.get("password") || "")
        const confirm = String(form.get("confirm") || "")

        if (newPassword !== confirm) {
            setError("Passwords do not match.")
            setLoading(false)
            return
        }

        if (!token) {
            setError("Invalid or missing reset token in the URL.")
            setLoading(false)
            return
        }

        // TODO: call your backend to verify token and set the new password
        console.log("reset-password", { token, newPassword })
        setDone(true)
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
                    <CardTitle className="text-2xl">Choose a new password</CardTitle>
                    <CardDescription>Enter your new password below</CardDescription>
                </CardHeader>
                <CardContent>
                    {done ? (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">Your password has been updated.</p>
                            <Button asChild className="cursor-pointer">
                                <Link to="/auth/login">Go to login</Link>
                            </Button>
                        </div>
                    ) : (
                        <form className="grid gap-4" onSubmit={onSubmit}>
                            <div className="grid gap-2">
                                <Label htmlFor="password">New password</Label>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        name="password"
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter a strong new password"
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

                            <div className="grid gap-2">
                                <Label htmlFor="confirm">Confirm password</Label>
                                <div className="relative">
                                    <Input
                                        id="confirm"
                                        name="confirm"
                                        type={showConfirm ? "text" : "password"}
                                        placeholder="Re-enter your new password"
                                        required
                                        className="pr-10"
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowConfirm((v) => !v)}
                                        aria-label={showConfirm ? "Hide confirm password" : "Show confirm password"}
                                        aria-pressed={showConfirm}
                                        className="absolute inset-y-0 right-2 inline-flex items-center justify-center rounded-md px-2 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                                    >
                                        {showConfirm ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                                    </button>
                                </div>
                            </div>

                            {error ? <p className="text-sm text-destructive" role="alert" aria-live="polite">{error}</p> : null}

                            <Button type="submit" disabled={loading} className="cursor-pointer">
                                {loading ? "Saving…" : "Save new password"}
                            </Button>
                        </form>
                    )}

                    <p className="mt-6 text-center text-sm text-muted-foreground">
                        Back to{" "}
                        <Link to="/auth/login" className="underline underline-offset-4">
                            login
                        </Link>
                    </p>
                </CardContent>
            </Card>
        </main>
    )
}
