import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom"

// Explicitly target the index file so TS resolves it in bundler mode
import WelcomePage from "@/app/welcome/welcome"

// Auth pages
import LoginPage from "@/app/auth/login"
import RegisterPage from "@/app/auth/register"
import ForgotPasswordPage from "@/app/auth/forgot-password"
import ResetPasswordPage from "@/app/auth/reset-password"

// Student pages
import StudentDashboard from "@/app/dashboard/student/dashboard"
import StudentSubmissions from "@/app/dashboard/student/submissions"

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

        {/* ✅ Student routes */}
        <Route path="/dashboard/student" element={<StudentDashboard />} />
        <Route
          path="/dashboard/student/submissions"
          element={<StudentSubmissions />}
        />

        {/* Back-compat for the Welcome "Student dashboard" button */}
        <Route
          path="/student-dashboard"
          element={<Navigate to="/dashboard/student" replace />}
        />

        {/* Catch-all → Welcome */}
        <Route path="*" element={<Navigate to="/welcome" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
