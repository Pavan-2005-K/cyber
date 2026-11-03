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
import { dashboardNavigation } from './dashboardNavigation'

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
  const navigate = useNavigate()
  const location = useLocation()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const pageTitle = getPageTitle(location.pathname)

  function handleLogout() {
    setProfileOpen(false)
    setMobileOpen(false)
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen bg-[#1F2022] text-[#E5E7EB]">
      {mobileOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          onClick={() => setMobileOpen(false)}
          className="fixed inset-0 z-30 bg-black/60 lg:hidden"
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex flex-col border-r border-white/[0.07] bg-[#171819] transition-all duration-200 ${
          collapsed ? 'w-[76px]' : 'w-[264px]'
        } ${
          mobileOpen
            ? 'translate-x-0'
            : '-translate-x-full lg:translate-x-0'
        } lg:shadow-none`}
      >
        <div
          className={`flex h-[72px] shrink-0 items-center border-b border-white/[0.07] ${
            collapsed ? 'justify-center px-3' : 'justify-between px-5'
          }`}
        >
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-blue-400/20 bg-blue-500/10 text-blue-400">
              <Shield size={22} strokeWidth={1.8} aria-hidden="true" />
            </span>
            {!collapsed && (
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold tracking-wide text-white">
                  CyberFusion
                </p>
                <p className="mt-0.5 truncate text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Digital forensics
                </p>
              </div>
            )}
          </div>
          <button
            type="button"
            aria-label="Close navigation menu"
            onClick={() => setMobileOpen(false)}
            className="ml-2 rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <nav
          aria-label="Main navigation"
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-3 py-5"
        >
          {dashboardNavigation.map((section) => (
            <div key={section.label}>
              {!collapsed && (
                <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-slate-600">
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
                      `group flex min-h-10 items-center gap-3 rounded-xl px-3 text-[13px] transition-colors ${
                        collapsed ? 'justify-center' : ''
                      } ${
                        isActive
                          ? 'bg-blue-500/15 font-medium text-blue-300'
                          : 'text-slate-400 hover:bg-white/[0.045] hover:text-slate-100'
                      }`
                    }
                  >
                    <Icon
                      size={18}
                      strokeWidth={1.8}
                      className="shrink-0"
                      aria-hidden="true"
                    />
                    {!collapsed && <span className="truncate">{label}</span>}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="shrink-0 border-t border-white/[0.07] p-3">
          <button
            type="button"
            onClick={() => setCollapsed((value) => !value)}
            className="hidden min-h-10 w-full items-center gap-3 rounded-xl px-3 text-xs text-slate-500 transition hover:bg-white/[0.045] hover:text-slate-200 lg:flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight size={17} aria-hidden="true" />
            ) : (
              <>
                <ChevronLeft size={17} aria-hidden="true" />
                <span>Collapse sidebar</span>
              </>
            )}
          </button>
        </div>
      </aside>

      <div
        className={`min-h-screen transition-[padding] duration-200 ${
          collapsed ? 'lg:pl-[76px]' : 'lg:pl-[264px]'
        }`}
      >
        <header className="sticky top-0 z-20 flex h-[72px] items-center justify-between border-b border-white/[0.07] bg-[#1F2022]/95 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation menu"
              className="rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white lg:hidden"
            >
              <Menu size={20} aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-100">
                {pageTitle}
              </p>
              <p className="hidden text-[11px] text-slate-500 sm:block">
                CyberFusion <span className="px-1 text-slate-700">/</span>{' '}
                {pageTitle}
              </p>
            </div>
          </div>

          <div className="relative ml-3">
            <button
              type="button"
              onClick={() => setProfileOpen((value) => !value)}
              aria-haspopup="menu"
              aria-expanded={profileOpen}
              className="flex items-center gap-2 rounded-xl border border-transparent py-1.5 pl-2 pr-1.5 text-left transition hover:border-white/[0.08] hover:bg-white/[0.035] sm:gap-3 sm:pl-3 sm:pr-2"
            >
              <span className="block max-w-20 text-right sm:max-w-36">
                <span className="block truncate text-[11px] font-medium text-slate-200 sm:text-xs">
                  {user?.username}
                </span>
                <span className="mt-0.5 block text-[9px] font-medium tracking-wide text-blue-400 sm:text-[10px]">
                  {user?.role.toUpperCase()}
                </span>
              </span>
              <span className="flex size-9 items-center justify-center rounded-full border border-blue-400/20 bg-blue-500/10 text-sm font-semibold text-blue-300">
                {user?.username.slice(0, 1).toUpperCase()}
              </span>
              <ChevronDown
                size={15}
                className={`hidden text-slate-500 transition sm:block ${
                  profileOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {profileOpen && (
              <div
                role="menu"
                className="absolute right-0 top-full mt-2 w-64 rounded-2xl border border-white/[0.09] bg-[#282A2D] p-2 shadow-xl shadow-black/30"
              >
                <div className="border-b border-white/[0.07] px-3 py-3">
                  <p className="truncate text-sm font-medium text-slate-100">
                    {user?.username}
                  </p>
                  <p className="mt-1 truncate text-xs text-slate-500">
                    {user?.email}
                  </p>
                  <span className="mt-2 inline-flex rounded-md border border-blue-400/15 bg-blue-500/10 px-2 py-1 text-[10px] font-semibold tracking-wide text-blue-300">
                    {user?.role.toUpperCase()}
                  </span>
                </div>
                <button
                  type="button"
                  role="menuitem"
                  onClick={handleLogout}
                  className="mt-1 flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm text-slate-300 transition hover:bg-white/[0.05] hover:text-white"
                >
                  <LogOut size={16} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </header>

        <main className="min-h-[calc(100vh-72px)] p-4 sm:p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

export function ModulePlaceholder({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-6xl">
      <div className="rounded-2xl border border-white/[0.08] bg-[#303236] p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
          CyberFusion workspace
        </p>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-white">
          {title}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-400">
          This workspace module is not available yet.
        </p>
      </div>
    </section>
  )
}
