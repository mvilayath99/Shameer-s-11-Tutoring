import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthProvider'
import { SettingsProvider } from './lib/SettingsProvider'
import { isSuperAdmin } from './lib/roles'
import { PublicLayout } from './components/PublicLayout'
import { PortalLayout } from './components/PortalLayout'
import SettingsPage from './pages/admin/settings/SettingsPage'
import Enquiries from './pages/admin/Enquiries'
import { ModuleGate } from './components/ModuleGate'
import { Loading, RequirePortal } from './components/RequirePortal'
import Home from './pages/public/Home'
import { About, NotFound, Privacy, Terms } from './pages/public/Simple'
import Contact from './pages/public/Contact'
import { Courses, ExamBoards, Faq } from './pages/public/Courses'
import Login from './pages/auth/Login'
import Signup from './pages/auth/Signup'
import StudentLogin from './pages/auth/StudentLogin'
import ForgotPassword from './pages/auth/ForgotPassword'
import ResetPassword from './pages/auth/ResetPassword'
import { AdminDashboard, ModulePage, ParentDashboard, StudentDashboard } from './pages/Dashboards'

function RequireSuperAdmin({ children }: { children: ReactNode }) {
  const { roles, loading } = useAuth()
  if (loading) return <Loading />
  return isSuperAdmin(roles) ? <>{children}</> : <Navigate to="/admin" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <SettingsProvider>
        <AuthProvider>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<Home />} />
              <Route path="about" element={<About />} />
              <Route path="courses" element={<Courses />} />
              <Route path="exam-boards" element={<ExamBoards />} />
              <Route path="faq" element={<Faq />} />
              <Route path="contact" element={<Contact />} />
              <Route path="privacy" element={<Privacy />} />
              <Route path="terms" element={<Terms />} />
            </Route>

            <Route path="login" element={<Login />} />
            <Route path="signup" element={<Signup />} />
            <Route path="student-login" element={<StudentLogin />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />

            <Route path="admin" element={<RequirePortal portal="admin"><PortalLayout portal="admin" /></RequirePortal>}>
              <Route index element={<AdminDashboard />} />
              <Route path="settings/*" element={<RequireSuperAdmin><SettingsPage /></RequireSuperAdmin>} />
              <Route path="enquiries" element={<ModuleGate moduleKey="enquiries"><Enquiries /></ModuleGate>} />
              <Route path=":moduleKey" element={<ModulePage />} />
            </Route>
            <Route path="parent" element={<RequirePortal portal="parent"><PortalLayout portal="parent" /></RequirePortal>}>
              <Route index element={<ParentDashboard />} />
              <Route path=":moduleKey" element={<ModulePage />} />
            </Route>
            <Route path="student" element={<RequirePortal portal="student"><PortalLayout portal="student" /></RequirePortal>}>
              <Route index element={<StudentDashboard />} />
              <Route path=":moduleKey" element={<ModulePage />} />
            </Route>

            <Route element={<PublicLayout />}><Route path="*" element={<NotFound />} /></Route>
          </Routes>
        </AuthProvider>
      </SettingsProvider>
    </BrowserRouter>
  )
}
