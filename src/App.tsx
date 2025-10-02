// src\App.tsx
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
import StudentSchedule from "@/app/dashboard/student/schedule"
import StudentSettings from "@/app/dashboard/student/settings"

// Previously added pages
import StudentResults from "@/app/dashboard/student/results"
import StudentNotifications from "@/app/dashboard/student/notifications"

// ✅ New: Help & Support / FAQ
import StudentHelpSupport from "@/app/dashboard/student/help-support"

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* ✅ Root now serves the Welcome page directly */}
        <Route path="/" element={<WelcomePage />} />

        {/* Back-compat: old /welcome links now point to / */}
        <Route path="/welcome" element={<Navigate to="/" replace />} />

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
        <Route
          path="/dashboard/student/schedule"
          element={<StudentSchedule />}
        />
        <Route
          path="/dashboard/student/settings"
          element={<StudentSettings />}
        />

        {/* Previously added */}
        <Route
          path="/dashboard/student/results"
          element={<StudentResults />}
        />
        <Route
          path="/dashboard/student/notifications"
          element={<StudentNotifications />}
        />

        {/* ✅ New: Help & Support / FAQ */}
        <Route
          path="/dashboard/student/help"
          element={<StudentHelpSupport />}
        />

        {/* Back-compat for the Welcome "Student dashboard" button */}
        <Route
          path="/student-dashboard"
          element={<Navigate to="/dashboard/student" replace />}
        />

        {/* Catch-all → Root Welcome */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
