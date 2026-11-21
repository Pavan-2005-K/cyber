
import { useState } from 'react'
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  Shield,
  X,
} from 'lucide-react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/useAuth'
import { useTheme } from '../context/useTheme'
import { dashboardNavigation } from './dashboardNavigation'
import CyberFusionChatbot from '../components/CyberFusionChatbot'

function getPageTitle(pathname: string): string {
  const path = pathname.replace(/^\/dashboard\/?/, '')

  if (!path) return 'Dashboard'

  return (
    dashboardNavigation
      .flatMap((section) => section.items)
      .find((item) => item.path === path)?.label ?? 'Dashboard'
  )
}

export default function DashboardLayout() {
  const { user, logout } = useAuth()
  const { theme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const isDark = theme === 'dark'

  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)

  const pageTitle = getPageTitle(location.pathname)

  const colors = {
    appBg: 'var(--app-bg)',
    sidebarBg: 'var(--sidebar-bg)',
    surfaceBg: 'var(--surface-bg)',
    surfaceSecondary: 'var(--surface-secondary)',
    headerBg: 'var(--header-bg)',
    border: 'var(--border-color)',
    text: 'var(--text-primary)',
    secondary: 'var(--text-secondary)',
    muted: 'var(--text-muted)',
    accent: 'var(--accent)',
    accentBg: 'var(--accent-bg)',
  }

  function handleLogout() {
    setProfileOpen(false)
    setMobileOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div
      className="min-h-screen transition-colors duration-200"
      style={{
        backgroundColor: colors.appBg,
        color: colors.text,
      }}
    >
      {/* Mobile overlay */}
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r transition-all duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[248px]'
        } ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        }`}
        style={{
          backgroundColor: colors.sidebarBg,
          borderColor: colors.border,
        }}
      >
        {/* Logo / Branding */}
        <div
          className={`flex h-[72px] shrink-0 items-center border-b ${
            collapsed ? 'justify-center px-3' : 'px-5'
          }`}
          style={{ borderColor: colors.border }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#17151D] text-[#A48BEF]">
              <Shield size={21} strokeWidth={1.8} />
            </span>

            {!collapsed && (
              <div className="min-w-0">
                <p
                  className="truncate text-[15px] font-semibold tracking-wide"
                  style={{ color: colors.text }}
                >
                  CyberFusion
                </p>
                <p
                  className="truncate text-[10px] tracking-wide"
                  style={{ color: colors.muted }}
                >
                  Digital Forensics Workspace
                </p>
              </div>
            )}
          </div>

          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="ml-auto rounded-lg p-2 hover:bg-black/5 lg:hidden"
            style={{ color: colors.muted }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5"
        >
          {!collapsed && (
            <p
              className="px-3 text-[10px] font-medium uppercase tracking-[0.16em]"
              style={{ color: colors.muted }}
            >
              Menu
            </p>
          )}

          {dashboardNavigation.map((section) => (
            <div key={section.label}>
              {!collapsed && section.label !== 'Main' && (
                <p
                  className="mb-2 px-3 text-[10px] font-medium uppercase tracking-[0.14em]"
                  style={{ color: colors.muted }}
                >
                  {section.label}
                </p>
              )}

              <div className="space-y-1">
                {section.items.map(({ label, path, icon: Icon }) => (
                  <NavLink
                    key={label}
                    to={path ? `/dashboard/${path}` : '/dashboard'}
                    end={!path}
                    title={collapsed ? label : undefined}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `group flex min-h-10 items-center gap-3 rounded-lg border px-3 text-[13px] transition-all duration-150 ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        isActive
                          ? 'font-medium'
                          : 'border-transparent'
                      }`
                    }
                    style={({ isActive }) => ({
                      backgroundColor: isActive
                        ? colors.accentBg
                        : 'transparent',
                      borderColor: isActive
                        ? colors.border
                        : 'transparent',
                      color: isActive
                        ? colors.accent
                        : colors.secondary,
                    })}
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.7}
                      className="shrink-0"
                      aria-hidden="true"
                    />

                    {!collapsed && (
                      <span className="truncate">{label}</span>
                    )}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        {/* Sidebar collapse */}
        <div
          className="shrink-0 border-t p-3"
          style={{ borderColor: colors.border }}
        >
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className={`hidden min-h-10 w-full items-center gap-3 rounded-lg px-3 text-xs transition lg:flex ${
              collapsed ? 'justify-center' : ''
            }`}
            style={{ color: colors.secondary }}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={17} />
            ) : (
              <>
                <ChevronLeft size={17} />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Main area */}
      <div
        className={`min-h-screen transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[248px]'
        }`}
      >
        {/* Top bar */}
        <header
          className="sticky top-0 z-20 flex h-[64px] items-center justify-between border-b px-4 backdrop-blur-md sm:px-6"
          style={{
            backgroundColor: colors.headerBg,
            borderColor: colors.border,
          }}
        >
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 hover:bg-black/5 lg:hidden"
              style={{ color: colors.secondary }}
            >
              <Menu size={20} />
            </button>

            <div className="flex min-w-0 items-center gap-2 text-sm">
              <span
                className="hidden sm:block"
                style={{ color: colors.muted }}
              >
                CyberFusion
              </span>

              <ChevronRight
                size={14}
                className="hidden sm:block"
                style={{ color: colors.muted }}
              />

              <span className="truncate" style={{ color: colors.text }}>
                {pageTitle}
              </span>
            </div>
          </div>

          {/* Profile */}
          <div className="relative ml-3">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 transition hover:bg-black/5 sm:gap-3"
            >
              <span className="flex size-8 items-center justify-center rounded-lg border border-[#37313F] bg-[#1C1924] text-sm font-medium text-[#B7A0F3]">
                {user?.username.slice(0, 1).toUpperCase()}
              </span>

              <span
                className="hidden max-w-32 truncate text-xs sm:block"
                style={{ color: colors.secondary }}
              >
                {user?.username}
              </span>

              <ChevronDown
                size={14}
                className={`transition ${
                  profileOpen ? 'rotate-180' : ''
                }`}
                style={{ color: colors.muted }}
              />
            </button>

            {/* Dropdown */}
            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-60 rounded-xl border p-2 shadow-xl shadow-black/10"
                style={{
                  backgroundColor: colors.surfaceBg,
                  borderColor: colors.border,
                }}
              >
                <div
                  className="border-b px-3 py-3"
                  style={{ borderColor: colors.border }}
                >
                  <p
                    className="truncate text-sm font-medium"
                    style={{ color: colors.text }}
                  >
                    {user?.username}
                  </p>

                  <p
                    className="mt-1 truncate text-xs"
                    style={{ color: colors.muted }}
                  >
                    {user?.email}
                  </p>

                  <span className="mt-2 inline-flex rounded-md border border-[#383141] bg-[#211D29] px-2 py-1 text-[10px] font-medium text-[#B7A0F3]">
                    {user?.role.toUpperCase()}
                  </span>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm transition hover:bg-black/5"
                  style={{ color: colors.secondary }}
                >
                  <LogOut size={16} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        {/* Page content */}
        <main className="min-h-[calc(100vh-64px)] p-4 sm:p-5 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Chatbot */}
      <CyberFusionChatbot />
    </div>
  )
}

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-6xl">
      <div
        className="rounded-xl border p-5 sm:p-6"
        style={{
          backgroundColor: 'var(--surface-bg)',
          borderColor: 'var(--border-color)',
        }}
      >
        <h1
          className="text-lg font-semibold"
          style={{ color: 'var(--text-primary)' }}
        >
          {title}
        </h1>
      </div>
    </section>
  )
}
