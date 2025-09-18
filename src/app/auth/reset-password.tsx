import { Link, useSearchParams } from "react-router-dom"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ResetPasswordPage() {
    const [params] = useSearchParams()
    const token = params.get("token") || ""
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [done, setDone] = useState(false)

    const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
        e.preventDefault()
        setLoading(true)
        setError(null)
        const form = new FormData(e.currentTarget)
        const newPassword = String(form.get("password") || "")
        const confirm = String(form.get("confirm") || "")
        const formToken = String(form.get("token") || token)

        if (newPassword !== confirm) {
            setError("Passwords do not match.")
            setLoading(false)
            return
        }

        if (!formToken) {
            setError("Invalid or missing reset token.")
            setLoading(false)
            return
        }

        // TODO: call your backend to verify token and set the new password
        console.log("reset-password", { token: formToken, newPassword })
        setDone(true)
        setLoading(false)
    }

    return (
        <main className="min-h-dvh grid place-items-center px-4 py-10">
            <Card className="w-full max-w-md">
                <CardHeader className="space-y-1">
                    <CardTitle className="text-2xl">Choose a new password</CardTitle>
                    <CardDescription>Enter your new password below</CardDescription>
                </CardHeader>
                <CardContent>
                    {done ? (
                        <div className="space-y-4">
                            <p className="text-sm text-muted-foreground">Your password has been updated.</p>
                            <Button asChild>
                                <Link to="/auth/login">Go to login</Link>
                            </Button>
                        </div>
                    ) : (
                        <form className="grid gap-4" onSubmit={onSubmit}>
                            {!token && (
                                <div className="grid gap-2">
                                    <Label htmlFor="token">Reset token</Label>
                                    <Input id="token" name="token" placeholder="Paste your reset token" required />
                                </div>
                            )}
                            <div className="grid gap-2">
                                <Label htmlFor="password">New password</Label>
                                <Input id="password" name="password" type="password" required />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="confirm">Confirm password</Label>
                                <Input id="confirm" name="confirm" type="password" required />
                            </div>
                            {error ? <p className="text-sm text-destructive">{error}</p> : null}
                            <Button type="submit" disabled={loading}>
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
