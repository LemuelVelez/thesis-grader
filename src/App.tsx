import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"

// Explicitly target the index file so TS resolves it in bundler mode
import WelcomePage from "@/app/welcome/welcome"

// Auth pages
import LoginPage from "@/app/auth/login"
import RegisterPage from "@/app/auth/register"
import ForgotPasswordPage from "@/app/auth/forgot-password"
import ResetPasswordPage from "@/app/auth/reset-password"

// Temporary placeholders so routing compiles while other pages are WIP.
// Replace these when your real pages are ready.
function StudentDashboardPlaceholder() {
  return (
    <main className="min-h-dvh grid place-items-center p-8">
      <div className="max-w-xl text-center">
        <h1 className="text-2xl font-bold">Student Dashboard</h1>
        <p className="mt-2 text-muted-foreground">
          Replace this with your <code>src/app/student-dashboard</code> page.
        </p>
        <a className="mt-4 inline-block underline" href="/welcome">Back to Welcome</a>
      </div>
    </main>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ✅ First page: redirect root to /welcome */}
        <Route path="/" element={<Navigate to="/welcome" replace />} />

        {/* Welcome route */}
        <Route path="/welcome" element={<WelcomePage />} />

        {/* ✅ Auth routes */}
        <Route path="/auth" element={<Navigate to="/auth/login" replace />} />
        <Route path="/auth/login" element={<LoginPage />} />
        <Route path="/auth/register" element={<RegisterPage />} />
        <Route path="/auth/forgot" element={<ForgotPasswordPage />} />
        <Route path="/auth/reset" element={<ResetPasswordPage />} />

        {/* Other stubs (safe to remove once real pages exist) */}
        <Route path="/student-dashboard" element={<StudentDashboardPlaceholder />} />

        {/* Catch-all → Welcome */}
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
