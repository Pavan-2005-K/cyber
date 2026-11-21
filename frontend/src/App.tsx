import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AuthProvider } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { useAuth } from './context/useAuth'

import DashboardLayout, {
  ModulePlaceholder,
} from './layouts/DashboardLayout'

import { dashboardNavigation } from './layouts/dashboardNavigation'

import Login from './pages/auth/Login'
import Register from './pages/auth/Register'

// --------------------------------------------------
// Dynamic lazy page loader
// --------------------------------------------------

const pageModules = import.meta.glob('./pages/**/*.tsx')

function lazyPage(pageName: string) {
  const matchingPath = Object.keys(pageModules).find((path) =>
    path.endsWith(`/${pageName}.tsx`),
  )

  if (!matchingPath) {
    console.error(`Page not found: ${pageName}`)
    return lazy(() =>
      Promise.resolve({
        default: () => (
          <div className="p-6 text-center text-red-400">
            Page not found: {pageName}
          </div>
        ),
      }),
    )
  }

  return lazy(async () => {
    const loader = pageModules[matchingPath]

    if (!loader) {
      throw new Error(`Unable to load page: ${pageName}`)
    }

    const module = (await loader()) as {
      default: React.ComponentType<any>
    }

    return {
      default: module.default,
    }
  })
}

// --------------------------------------------------
// Lazy loaded pages
// --------------------------------------------------

const Cases = lazyPage('Cases')
const EvidenceManagement = lazyPage('EvidenceManagement')
const PhishingURL = lazyPage('PhishingURL')
const FakeProfile = lazyPage('FakeProfile')
const ScamDetection = lazyPage('ScamDetection')
const ImageForgery = lazyPage('ImageForgery')
const ApkAnalysis = lazyPage('ApkAnalysis')
const ChatEmailForensics = lazyPage('ChatEmailForensics')
const CreditCardFraud = lazyPage('CreditCardFraud')
const NetworkIntrusion = lazyPage('NetworkIntrusion')
const ServerLogAnalysis = lazyPage('ServerLogAnalysis')
const FakeEmail = lazyPage('FakeEmail')
const FindingsManagement = lazyPage('FindingsManagement')
const InvestigationReports = lazyPage('InvestigationReports')
const AuditLogs = lazyPage('AuditLogs')
const Profile = lazyPage('Profile')
const Settings = lazyPage('Settings')
const Dashboard = lazyPage('Dashboard')

// --------------------------------------------------
// Protected dashboard
// --------------------------------------------------

function ProtectedDashboard() {
  const { user, status } = useAuth()

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0b0b0d] text-sm text-slate-400">
        Checking your session…
      </main>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return <DashboardLayout />
}

// --------------------------------------------------
// Loading fallback
// --------------------------------------------------

function PageLoading({ label = 'Loading page...' }: { label?: string }) {
  return (
    <div className="py-12 text-center text-sm text-slate-400">
      {label}
    </div>
  )
}

// --------------------------------------------------
// App
// --------------------------------------------------

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            {/* Public routes */}
            <Route path="/" element={<Navigate to="/login" replace />} />

            <Route path="/login" element={<Login />} />

            <Route path="/register" element={<Register />} />

            {/* Protected dashboard routes */}
            <Route path="/dashboard" element={<ProtectedDashboard />}>
              <Route
                index
                element={
                  <Suspense fallback={<PageLoading label="Loading dashboard..." />}>
                    <Dashboard />
                  </Suspense>
                }
              />

              <Route
                path="cases"
                element={
                  <Suspense fallback={<PageLoading label="Loading cases..." />}>
                    <Cases />
                  </Suspense>
                }
              />

              <Route
                path="evidence-management"
                element={
                  <Suspense fallback={<PageLoading label="Loading evidence..." />}>
                    <EvidenceManagement />
                  </Suspense>
                }
              />

              <Route
                path="evidence-integrity-verification"
                element={
                  <Suspense fallback={<PageLoading label="Loading integrity verification..." />}>
                    <EvidenceManagement integrityOnly />
                  </Suspense>
                }
              />

              <Route
                path="phishing-url-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading phishing detection..." />}>
                    <PhishingURL />
                  </Suspense>
                }
              />

              <Route
                path="fake-profile-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading fake profile detection..." />}>
                    <FakeProfile />
                  </Suspense>
                }
              />

              <Route
                path="scam-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading scam detection..." />}>
                    <ScamDetection />
                  </Suspense>
                }
              />

              <Route
                path="image-forgery-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading image forgery detection..." />}>
                    <ImageForgery />
                  </Suspense>
                }
              />

              <Route
                path="apk-malware-analysis"
                element={
                  <Suspense fallback={<PageLoading label="Loading APK analysis..." />}>
                    <ApkAnalysis />
                  </Suspense>
                }
              />

              <Route
                path="chat-email-forensics"
                element={
                  <Suspense fallback={<PageLoading label="Loading chat and email forensics..." />}>
                    <ChatEmailForensics />
                  </Suspense>
                }
              />

              <Route
                path="credit-card-fraud-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading credit card fraud detection..." />}>
                    <CreditCardFraud />
                  </Suspense>
                }
              />

              <Route
                path="network-intrusion-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading network intrusion detection..." />}>
                    <NetworkIntrusion />
                  </Suspense>
                }
              />

              <Route
                path="server-log-analysis"
                element={
                  <Suspense fallback={<PageLoading label="Loading server log analysis..." />}>
                    <ServerLogAnalysis />
                  </Suspense>
                }
              />

              <Route
                path="fake-email-detection"
                element={
                  <Suspense fallback={<PageLoading label="Loading fake email detection..." />}>
                    <FakeEmail />
                  </Suspense>
                }
              />

              <Route
                path="detection-findings"
                element={
                  <Suspense fallback={<PageLoading label="Loading detection findings..." />}>
                    <FindingsManagement />
                  </Suspense>
                }
              />

              <Route
                path="investigation-reports"
                element={
                  <Suspense fallback={<PageLoading label="Loading investigation reports..." />}>
                    <InvestigationReports />
                  </Suspense>
                }
              />

              <Route
                path="audit-logs"
                element={
                  <Suspense fallback={<PageLoading label="Loading audit logs..." />}>
                    <AuditLogs />
                  </Suspense>
                }
              />

              <Route
                path="profile"
                element={
                  <Suspense fallback={<PageLoading label="Loading profile..." />}>
                    <Profile />
                  </Suspense>
                }
              />

              <Route
                path="settings"
                element={
                  <Suspense fallback={<PageLoading label="Loading settings..." />}>
                    <Settings />
                  </Suspense>
                }
              />

              {/* Automatically generated placeholder routes */}
              {dashboardNavigation
                .flatMap((section) => section.items)
                .filter(
                  (item) =>
                    item.path &&
                    ![
                      'cases',
                      'evidence-management',
                      'evidence-integrity-verification',
                      'phishing-url-detection',
                      'fake-profile-detection',
                      'scam-detection',
                      'image-forgery-detection',
                      'apk-malware-analysis',
                      'chat-email-forensics',
                      'credit-card-fraud-detection',
                      'network-intrusion-detection',
                      'server-log-analysis',
                      'fake-email-detection',
                      'detection-findings',
                      'investigation-reports',
                      'audit-logs',
                      'profile',
                      'settings',
                    ].includes(item.path),
                )
                .map((item) => (
                  <Route
                    key={item.path}
                    path={item.path}
                    element={<ModulePlaceholder title={item.label} />}
                  />
                ))}
            </Route>

            {/* Unknown route */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}