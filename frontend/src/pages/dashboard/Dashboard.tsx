import { useEffect, useState } from 'react'
import axios from 'axios'
import {
  Activity,
  Archive,
  BriefcaseBusiness,
  CheckCircle2,
  CircleAlert,
  FileSearch,
  FileText,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  ShieldX,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import {
  getDashboardAnalytics,
  type DashboardAnalytics,
  type FindingSeverity,
  type EvidenceVerificationOutcomes,
} from '../../services/dashboardService'

const severityColors: Record<FindingSeverity, string> = {
  CRITICAL: '#f87171',
  HIGH: '#fb923c',
  MEDIUM: '#fbbf24',
  LOW: '#34d399',
}

const severityOrder: FindingSeverity[] = [
  'CRITICAL',
  'HIGH',
  'MEDIUM',
  'LOW',
]

const recentFindingSeverityStyles: Record<string, string> = {
  LOW: 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300',
  MEDIUM: 'border-amber-400/20 bg-amber-400/10 text-amber-300',
  HIGH: 'border-orange-400/20 bg-orange-400/10 text-orange-300',
  CRITICAL: 'border-red-400/20 bg-red-400/10 text-red-300',
}

const tooltipStyle = {
  backgroundColor: '#242629',
  border: '1px solid rgba(255,255,255,0.12)',
  borderRadius: '12px',
  color: '#e5e7eb',
  fontSize: '12px',
  maxWidth: 'min(320px, calc(100vw - 32px))',
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return 'Unable to connect to CyberFusion. Check your connection and try again.'
    }

    if (error.response.status === 401) {
      return 'Your session may have expired. Please sign in again.'
    }

    if (error.response.status === 429) {
      return 'Too many requests. Wait a moment, then try again.'
    }
  }

  if (
    error instanceof Error &&
    error.message ===
      'Unable to connect. Please check your connection and try again.'
  ) {
    return 'Unable to connect to CyberFusion. Check your connection and try again.'
  }

  return 'Dashboard analytics could not be loaded. Please try again.'
}

function formatConfidence(confidence: number | null): string {
  if (confidence === null || !Number.isFinite(confidence)) return '—'
  const percentage = confidence <= 1 ? confidence * 100 : confidence
  return `${percentage.toFixed(1)}%`
}

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function formatUtcDate(dateString: string, dateStyle: 'medium' | 'short' = 'medium'): string {
  const date = new Date(`${dateString}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return dateString

  return new Intl.DateTimeFormat(undefined, {
    dateStyle,
    timeZone: 'UTC',
  }).format(date)
}

type StatCardProps = {
  label: string
  value: number
  icon: typeof BriefcaseBusiness
  accent: string
}

function StatCard({ label, value, icon: Icon, accent }: StatCardProps) {
  return (
    <article className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#303236] p-4 transition hover:border-white/[0.14] sm:p-5">
      <div className="flex min-h-[76px] items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium leading-5 text-slate-400 sm:text-sm">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white sm:mt-3 sm:text-3xl">
            {value.toLocaleString()}
          </p>
        </div>
        <span
          className={`flex size-9 shrink-0 items-center justify-center rounded-xl sm:size-10 ${accent}`}
        >
          <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
        </span>
      </div>
    </article>
  )
}

function StatSkeleton() {
  return (
    <div
      aria-hidden="true"
      className="h-[112px] animate-pulse rounded-2xl border border-white/[0.06] bg-[#303236]"
    />
  )
}

function ChartEmptyState() {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
        <Activity size={20} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-slate-300">No findings yet</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
        Findings will appear here after analysis has been recorded.
      </p>
    </div>
  )
}

function DashboardCharts({ analytics }: { analytics: DashboardAnalytics }) {
  const severityTotal = severityOrder.reduce(
    (total, severity) => total + analytics.severity_distribution[severity],
    0,
  )
  const severityData = severityOrder.map((name) => ({
    name,
    value: analytics.severity_distribution[name],
    percentage:
      severityTotal > 0
        ? (analytics.severity_distribution[name] / severityTotal) * 100
        : 0,
  }))
  const moduleData = Object.entries(analytics.module_findings)
    .map(([module, findings]) => ({ module, findings }))
    .sort((a, b) => b.findings - a.findings)
  const hasSeverity = severityData.some((item) => item.value > 0)
  const trendData = analytics.finding_trends

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Severity distribution
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Findings grouped by severity
          </p>
        </div>
        {hasSeverity ? (
          <ResponsiveContainer width="100%" height={235}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                innerRadius={66}
                outerRadius={98}
                paddingAngle={4}
                stroke="none"
              >
                {severityData.map((item) => (
                  <Cell
                    key={item.name}
                    fill={severityColors[item.name]}
                    fillOpacity={item.value ? 1 : 0.3}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [
                  `${value ?? 0} findings`,
                  name,
                ]}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {severityData.map((item) => (
            <div
              key={item.name}
              className="min-w-0 rounded-xl border border-white/[0.06] bg-[#292b2e] px-3 py-2.5"
            >
              <div className="flex items-center gap-2">
                <span
                  className="size-2 shrink-0 rounded-full"
                  style={{ backgroundColor: severityColors[item.name] }}
                  aria-hidden="true"
                />
                <span className="truncate text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {item.name}
                </span>
              </div>
              <p className="mt-1.5 text-sm font-semibold tabular-nums text-slate-100">
                {item.value.toLocaleString()}
                <span className="ml-1.5 text-[10px] font-normal text-slate-500">
                  {item.percentage.toFixed(1)}%
                </span>
              </p>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          Percentages are of findings with a recognized severity.
        </p>
      </section>

      <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            AI findings by module
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Recorded findings across detection modules
          </p>
        </div>
        {moduleData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(280, Math.min(moduleData.length * 38 + 48, 520))}
          >
            <BarChart
              data={moduleData}
              layout="vertical"
              margin={{ top: 8, right: 18, bottom: 8, left: 4 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.07)"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                allowDataOverflow={false}
              />
              <YAxis
                type="category"
                dataKey="module"
                width={144}
                tickFormatter={(value: string) =>
                  value.length > 20 ? `${value.slice(0, 19)}…` : value
                }
                tick={{ fill: '#94a3b8', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'rgba(255,255,255,0.035)' }}
                labelFormatter={(label) => String(label)}
                formatter={(value) => [value ?? 0, 'Findings']}
              />
              <Bar
                dataKey="findings"
                name="Findings"
                fill="#3B82F6"
                radius={[0, 5, 5, 0]}
                maxBarSize={24}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </section>

      <section className="min-w-0 rounded-2xl border border-white/[0.08] bg-[#303236] p-5 xl:col-span-2 sm:p-6">
        <div className="mb-3">
          <h2 className="text-sm font-semibold text-slate-100">
            Daily AI findings
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Findings recorded each day from{' '}
            {formatUtcDate(analytics.analytics_period.start_date)} to{' '}
            {formatUtcDate(analytics.analytics_period.end_date)} UTC.
          </p>
        </div>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart
              data={trendData}
              margin={{ top: 12, right: 12, bottom: 4, left: -16 }}
            >
              <CartesianGrid
                stroke="rgba(255,255,255,0.07)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatUtcDate(value, 'short')}
                tick={{ fill: '#64748b', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: '#64748b', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={40}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) =>
                  `Date: ${formatUtcDate(String(label))}`
                }
                formatter={(value) => [value ?? 0, 'Findings']}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Findings"
                stroke="#60a5fa"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#60a5fa', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#93c5fd', stroke: '#1e3a8a' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[300px] flex-col items-center justify-center text-center">
            <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
              <Activity size={20} aria-hidden="true" />
            </span>
            <p className="mt-3 text-sm font-medium text-slate-300">
              No trend data available
            </p>
            <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">
              Daily finding counts will appear here when the API returns trend
              data for this period.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function ForensicStatistics({
  analytics,
}: {
  analytics: DashboardAnalytics
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">
          Forensic statistics
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Persisted reports and integrity records for your investigations.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total Reports Generated"
          value={analytics.reports.total_generated}
          icon={FileText}
          accent="bg-blue-500/10 text-blue-400"
        />
        <StatCard
          label="Reports In Selected Period"
          value={analytics.reports.generated_in_period}
          icon={Activity}
          accent="bg-violet-400/10 text-violet-300"
        />
        <StatCard
          label="Total Integrity Records"
          value={analytics.total_integrity_records}
          icon={ShieldCheck}
          accent="bg-emerald-400/10 text-emerald-300"
        />
      </div>
      <p className="text-[11px] text-slate-500">
        Report period: {analytics.analytics_period.start_date} to{' '}
        {analytics.analytics_period.end_date} UTC.
      </p>
    </section>
  )
}

function EvidenceVerificationEvents({
  outcomes,
}: {
  outcomes: EvidenceVerificationOutcomes
}) {
  const events = [
    {
      label: 'Integrity verified',
      value: outcomes.INTEGRITY_VERIFIED,
      icon: ShieldCheck,
      accent: 'text-emerald-300 bg-emerald-400/10',
      marker: 'bg-emerald-400',
    },
    {
      label: 'Hash mismatch',
      value: outcomes.HASH_MISMATCH,
      icon: ShieldX,
      accent: 'text-rose-300 bg-rose-400/10',
      marker: 'bg-rose-400',
    },
    {
      label: 'File missing',
      value: outcomes.FILE_MISSING,
      icon: CircleAlert,
      accent: 'text-amber-300 bg-amber-400/10',
      marker: 'bg-amber-400',
    },
  ]

  return (
    <section className="rounded-2xl border border-white/[0.08] bg-[#303236] p-5 sm:p-6">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-slate-100">
          Evidence Verification Events
        </h2>
        <p className="mt-1 text-xs text-slate-500">
          Persisted verification events during the selected analytics period;
          these are not current evidence statuses.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {events.map(({ label, value, icon: Icon, accent, marker }) => (
          <article
            key={label}
            className="flex min-w-0 items-center gap-3 rounded-xl border border-white/[0.06] bg-[#292b2e] p-4"
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${accent}`}
            >
              <Icon size={18} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-xs font-medium text-slate-400">
                {label}
              </p>
              <p className="mt-1 flex items-center gap-2 text-xl font-semibold tabular-nums text-white">
                <span
                  className={`size-1.5 rounded-full ${marker}`}
                  aria-hidden="true"
                />
                {value.toLocaleString()}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function RecentFindings({
  findings,
}: {
  findings: DashboardAnalytics['recent_findings']
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#303236]">
      <div className="flex flex-col gap-2 border-b border-white/[0.07] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">
            Latest 10 Findings
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Most recent recorded detection results; this list is limited to 10.
          </p>
        </div>
        <span className="self-start rounded-lg border border-white/[0.08] bg-white/[0.025] px-2.5 py-1 text-xs text-slate-400 sm:self-auto">
          {findings.length} / 10
        </span>
      </div>

      {findings.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
          <span className="flex size-11 items-center justify-center rounded-xl bg-white/[0.04] text-slate-500">
            <FileSearch size={20} aria-hidden="true" />
          </span>
          <p className="mt-3 text-sm font-medium text-slate-300">
            No recent findings
          </p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-slate-500">
            When detection results are available, they will appear here.
          </p>
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto xl:block">
            <table className="w-full min-w-[1040px] text-left">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                <th scope="col" className="px-5 py-3">
                  Finding ID
                </th>
                <th scope="col" className="px-4 py-3">
                  Case ID
                </th>
                <th scope="col" className="px-4 py-3">
                  AI Module
                </th>
                <th scope="col" className="px-4 py-3">
                  Prediction
                </th>
                <th scope="col" className="px-4 py-3">
                  Confidence
                </th>
                <th scope="col" className="px-4 py-3">
                  Severity
                </th>
                <th scope="col" className="px-5 py-3">
                  Timestamp
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.05]">
              {findings.map((finding) => (
                <tr
                  key={finding.finding_id}
                  className="transition hover:bg-white/[0.025]"
                >
                  <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-400">
                    #{finding.finding_id}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 font-mono text-xs text-slate-400">
                    {finding.case_id}
                  </td>
                  <td className="max-w-56 truncate px-4 py-4 text-sm font-medium text-slate-200">
                    {finding.module}
                  </td>
                  <td
                    className="max-w-64 truncate px-4 py-4 text-sm text-slate-300"
                    title={finding.prediction}
                  >
                    {finding.prediction}
                  </td>
                  <td className="px-4 py-4 text-sm tabular-nums text-slate-300">
                    {formatConfidence(finding.confidence)}
                  </td>
                  <td className="px-4 py-4">
                    <SeverityBadge severity={finding.severity} />
                  </td>
                  <td className="whitespace-nowrap px-5 py-4 text-xs text-slate-400">
                    {formatTimestamp(finding.timestamp)}
                  </td>
                </tr>
              ))}
            </tbody>
            </table>
          </div>
          <div className="space-y-3 p-4 xl:hidden">
            {findings.map((finding) => (
            <article
              key={finding.finding_id}
              className="rounded-xl border border-white/[0.07] bg-[#252629] p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-xs text-slate-400">
                  Finding #{finding.finding_id}
                </span>
                <SeverityBadge severity={finding.severity} />
              </div>
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Case ID
                  </dt>
                  <dd className="mt-1 font-mono text-slate-300">
                    {finding.case_id}
                  </dd>
                </div>
                <div>
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Confidence
                  </dt>
                  <dd className="mt-1 tabular-nums text-slate-300">
                    {formatConfidence(finding.confidence)}
                  </dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    AI Module
                  </dt>
                  <dd className="mt-1 break-words font-medium text-slate-200">
                    {finding.module}
                  </dd>
                </div>
                <div className="col-span-2 min-w-0">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Prediction
                  </dt>
                  <dd className="mt-1 break-words text-slate-300">
                    {finding.prediction}
                  </dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                    Timestamp
                  </dt>
                  <dd className="mt-1 text-slate-400">
                    {formatTimestamp(finding.timestamp)}
                  </dd>
                </div>
              </dl>
            </article>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const normalizedSeverity = severity.toUpperCase()
  const style =
    recentFindingSeverityStyles[normalizedSeverity] ??
    'border-white/10 bg-white/[0.04] text-slate-300'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {severity || 'Unknown'}
    </span>
  )
}

export default function Dashboard() {
  const [analytics, setAnalytics] = useState<DashboardAnalytics | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    getDashboardAnalytics()
      .then((data) => {
        if (active) setAnalytics(data)
      })
      .catch((error: unknown) => {
        if (active) setErrorMessage(getErrorMessage(error))
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [retryCount])

  function retry() {
    setErrorMessage('')
    setIsLoading(true)
    setRetryCount((count) => count + 1)
  }

  if (errorMessage) {
    return (
      <section className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-amber-400/15 bg-amber-400/10 text-amber-300">
          <CircleAlert size={22} aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-white">
          Analytics unavailable
        </h1>
        <p role="alert" className="mt-2 text-sm leading-6 text-slate-400">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-5 inline-flex items-center gap-2 rounded-xl bg-blue-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-400/30"
        >
          <RefreshCw size={15} aria-hidden="true" />
          Try again
        </button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-400">
            Investigator workspace
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Dashboard
          </h1>
          <p className="mt-1.5 text-sm text-slate-400">
            Overview of your cases, evidence, and AI findings.
          </p>
        </div>
        {analytics && (
          <p className="text-xs text-slate-500">
            Showing live analytics
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }, (_, index) => (
            <StatSkeleton key={index} />
          ))
        ) : analytics ? (
          <>
            <StatCard
              label="Total Cases"
              value={analytics.total_cases}
              icon={BriefcaseBusiness}
              accent="bg-blue-500/10 text-blue-400"
            />
            <StatCard
              label="Open Cases"
              value={analytics.open_cases}
              icon={Archive}
              accent="bg-amber-400/10 text-amber-300"
            />
            <StatCard
              label="Closed Cases"
              value={analytics.closed_cases}
              icon={CheckCircle2}
              accent="bg-emerald-400/10 text-emerald-300"
            />
            <StatCard
              label="Total Evidence"
              value={analytics.total_evidence}
              icon={FileSearch}
              accent="bg-violet-400/10 text-violet-300"
            />
            <StatCard
              label="Total AI Findings"
              value={analytics.total_findings}
              icon={ShieldAlert}
              accent="bg-rose-400/10 text-rose-300"
            />
          </>
        ) : null}
      </div>

      {isLoading ? (
        <div className="grid gap-5 xl:grid-cols-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              aria-hidden="true"
              className={`animate-pulse rounded-2xl border border-white/[0.06] bg-[#303236] ${
                index === 2 ? 'h-[360px] xl:col-span-2' : 'h-[360px]'
              }`}
            />
          ))}
        </div>
      ) : (
        analytics && <DashboardCharts analytics={analytics} />
      )}

      {isLoading ? (
        <>
          <div
            aria-hidden="true"
            className="h-52 animate-pulse rounded-2xl border border-white/[0.06] bg-[#303236]"
          />
          <div
            aria-hidden="true"
            className="h-44 animate-pulse rounded-2xl border border-white/[0.06] bg-[#303236]"
          />
        </>
      ) : (
        analytics && (
          <>
            <ForensicStatistics analytics={analytics} />
            <EvidenceVerificationEvents
              outcomes={analytics.evidence_verification_outcomes}
            />
          </>
        )
      )}

      {isLoading ? (
        <div
          aria-hidden="true"
          className="h-64 animate-pulse rounded-2xl border border-white/[0.06] bg-[#303236]"
        />
      ) : (
        analytics && <RecentFindings findings={analytics.recent_findings} />
      )}
    </section>
  )
}
