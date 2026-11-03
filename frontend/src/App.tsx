import { lazy, Suspense } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './context/AuthContext'
import { useAuth } from './context/useAuth'
import DashboardLayout, {
  ModulePlaceholder,
} from './layouts/DashboardLayout'
import { dashboardNavigation } from './layouts/dashboardNavigation'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
const Cases = lazy(() => import('./pages/cases/Cases'))
const EvidenceManagement = lazy(
  () => import('./pages/evidence/EvidenceManagement'),
)
const PhishingURL = lazy(() => import('./pages/ai-analysis/PhishingURL'))
const FakeProfile = lazy(() => import('./pages/ai-analysis/FakeProfile'))
const ScamDetection = lazy(
  () => import('./pages/ai-analysis/ScamDetection'),
)
const ImageForgery = lazy(
  () => import('./pages/ai-analysis/ImageForgery'),
)
const ApkAnalysis = lazy(
  () => import('./pages/ai-analysis/ApkAnalysis'),
)
const ChatEmailForensics = lazy(
  () => import('./pages/ai-analysis/ChatEmailForensics'),
)
const CreditCardFraud = lazy(
  () => import('./pages/ai-analysis/CreditCardFraud'),
)
const NetworkIntrusion = lazy(
  () => import('./pages/ai-analysis/NetworkIntrusion'),
)
const ServerLogAnalysis = lazy(
  () => import('./pages/ai-analysis/ServerLogAnalysis'),
)
const FakeEmail = lazy(() => import('./pages/ai-analysis/FakeEmail'))
const FindingsManagement = lazy(
  () => import('./pages/findings/FindingsManagement'),
)
const InvestigationReports = lazy(
  () => import('./pages/reports/InvestigationReports'),
)
const AuditLogs = lazy(() => import('./pages/audit/AuditLogs'))
const Profile = lazy(() => import('./pages/profile/Profile'))
const Settings = lazy(() => import('./pages/settings/Settings'))

const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'))

function ProtectedDashboard() {
  const { user, status } = useAuth()

  if (status === 'loading') {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#1F2022] text-sm text-slate-400">
        Checking your session…
      </main>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  return <DashboardLayout />
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/dashboard" element={<ProtectedDashboard />}>
            <Route
              index
              element={
                <Suspense
                  fallback={
                    <div className="py-12 text-center text-sm text-slate-400">
                      Loading dashboard…
                    </div>
                  }
                >
                  <Dashboard />
                </Suspense>
              }
            />
              <Route
                path="cases"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading cases…
                      </div>
                    }
                  >
                    <Cases />
                  </Suspense>
                }
              />
              <Route
                path="evidence-management"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading evidence…
                      </div>
                    }
                  >
                    <EvidenceManagement />
                  </Suspense>
                }
              />
              <Route
                path="evidence-integrity-verification"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading evidence integrity verification…
                      </div>
                    }
                  >
                    <EvidenceManagement integrityOnly />
                  </Suspense>
                }
              />
              <Route
                path="phishing-url-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading phishing URL detection…
                      </div>
                    }
                  >
                    <PhishingURL />
                  </Suspense>
                }
              />
              <Route
                path="fake-profile-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading fake profile detection…
                      </div>
                    }
                  >
                    <FakeProfile />
                  </Suspense>
                }
              />
              <Route
                path="scam-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading scam and spam detection…
                      </div>
                    }
                  >
                    <ScamDetection />
                  </Suspense>
                }
              />
              <Route
                path="image-forgery-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading image forgery detection…
                      </div>
                    }
                  >
                    <ImageForgery />
                  </Suspense>
                }
              />
              <Route
                path="apk-malware-analysis"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading APK malware analysis…
                      </div>
                    }
                  >
                    <ApkAnalysis />
                  </Suspense>
                }
              />
              <Route
                path="chat-email-forensics"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading Chat &amp; Email Forensics…
                      </div>
                    }
                  >
                    <ChatEmailForensics />
                  </Suspense>
                }
              />
              <Route
                path="credit-card-fraud-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading credit card fraud detection…
                      </div>
                    }
                  >
                    <CreditCardFraud />
                  </Suspense>
                }
              />
              <Route
                path="network-intrusion-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading network intrusion detection…
                      </div>
                    }
                  >
                    <NetworkIntrusion />
                  </Suspense>
                }
              />
              <Route
                path="server-log-analysis"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading server log analysis…
                      </div>
                    }
                  >
                    <ServerLogAnalysis />
                  </Suspense>
                }
              />
              <Route
                path="fake-email-detection"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading Fake Email Detection…
                      </div>
                    }
                  >
                    <FakeEmail />
                  </Suspense>
                }
              />
              <Route
                path="detection-findings"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading detection findings…
                      </div>
                    }
                  >
                    <FindingsManagement />
                  </Suspense>
                }
              />
              <Route
                path="investigation-reports"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading investigation reports…
                      </div>
                    }
                  >
                    <InvestigationReports />
                  </Suspense>
                }
              />
              <Route
                path="audit-logs"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading audit logs…
                      </div>
                    }
                  >
                    <AuditLogs />
                  </Suspense>
                }
              />
              <Route
                path="profile"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading profile…
                      </div>
                    }
                  >
                    <Profile />
                  </Suspense>
                }
              />
              <Route
                path="settings"
                element={
                  <Suspense
                    fallback={
                      <div className="py-12 text-center text-sm text-slate-400">
                        Loading settings…
                      </div>
                    }
                  >
                    <Settings />
                  </Suspense>
                }
              />
              {dashboardNavigation
                .flatMap((section) => section.items)
                .filter(
                  (item) =>
                    item.path &&
                    item.path !== 'cases' &&
                    item.path !== 'profile' &&
                    item.path !== 'settings' &&
                    item.path !== 'audit-logs' &&
                    item.path !== 'detection-findings' &&
                    item.path !== 'investigation-reports' &&
                    item.path !== 'evidence-management' &&
                    item.path !== 'evidence-integrity-verification' &&
                    item.path !== 'phishing-url-detection' &&
                    item.path !== 'fake-profile-detection' &&
                    item.path !== 'scam-detection' &&
                    item.path !== 'image-forgery-detection' &&
                    item.path !== 'apk-malware-analysis' &&
                    item.path !== 'chat-email-forensics' &&
                    item.path !== 'credit-card-fraud-detection' &&
                    item.path !== 'network-intrusion-detection' &&
                    item.path !== 'server-log-analysis' &&
                    item.path !== 'fake-email-detection',
                )
              .map((item) => (
                <Route
                  key={item.path}
                  path={item.path}
                  element={<ModulePlaceholder title={item.label} />}
                />
              ))}
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
