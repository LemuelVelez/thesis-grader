import { Link } from "react-router-dom"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  const onSubmit: React.FormEventHandler<HTMLFormElement> = async (e) => {
    e.preventDefault()
    setLoading(true)
    const form = new FormData(e.currentTarget)
    const email = String(form.get("email") || "")
    // TODO: trigger real password reset email
    console.log("forgot-password send link", { email })
    setSent(true)
    setLoading(false)
  }

  return (
    <main className="min-h-dvh grid place-items-center px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl">Reset your password</CardTitle>
          <CardDescription>We&apos;ll send a password reset link to your email</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                If an account exists for that email, you&apos;ll receive a message with a link to reset your password.
              </p>
              <Button asChild variant="outline">
                <Link to="/auth/login">Back to login</Link>
              </Button>
            </div>
          ) : (
            <form className="grid gap-4" onSubmit={onSubmit}>
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" name="email" type="email" placeholder="you@school.edu" required />
              </div>
              <Button type="submit" disabled={loading}>
                {loading ? "Sending…" : "Send reset link"}
              </Button>
            </form>
          )}

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <Link to="/auth/login" className="underline underline-offset-4">
              Back to login
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  )
}
