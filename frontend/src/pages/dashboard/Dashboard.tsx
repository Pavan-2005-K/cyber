
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
  LOW: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-300',
  MEDIUM: 'border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300',
  HIGH: 'border-orange-500/20 bg-orange-500/10 text-orange-600 dark:text-orange-300',
  CRITICAL: 'border-red-500/20 bg-red-500/10 text-red-600 dark:text-red-300',
}

const tooltipStyle = {
  backgroundColor: 'var(--bg-card)',
  border: '1px solid var(--border-color)',
  borderRadius: '10px',
  color: 'var(--text-primary)',
  fontSize: '12px',
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

function formatUtcDate(
  dateString: string,
  dateStyle: 'medium' | 'short' = 'medium',
): string {
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
    <article className="theme-card group flex min-w-0 items-center justify-between p-4 transition hover:opacity-90">
      <div className="min-w-0">
        <p className="text-xs font-medium theme-text-secondary">
          {label}
        </p>
        <p className="mt-2 text-2xl font-semibold tracking-tight theme-text">
          {value.toLocaleString()}
        </p>
      </div>
      <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${accent}`}>
        <Icon size={19} strokeWidth={1.8} />
      </span>
    </article>
  )
}

function StatSkeleton() {
  return <div className="theme-card h-[88px] animate-pulse" />
}

function ChartEmptyState() {
  return (
    <div className="flex h-[250px] items-center justify-center">
      <div className="text-center">
        <Activity size={22} className="mx-auto theme-text-muted" />
        <p className="mt-3 text-sm theme-text-secondary">
          No data available
        </p>
      </div>
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-sm font-semibold theme-text">
        {title}
      </h2>
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
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Severity */}
      <section className="theme-card min-w-0 p-4 sm:p-5">
        <SectionHeader title="Severity distribution" />

        {hasSeverity ? (
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={severityData}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={86}
                paddingAngle={3}
                stroke="none"
              >
                {severityData.map((item) => (
                  <Cell
                    key={item.name}
                    fill={severityColors[item.name]}
                    fillOpacity={item.value ? 1 : 0.25}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={tooltipStyle}
                formatter={(value, name) => [`${value ?? 0}`, name]}
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
              className="theme-card-secondary rounded-lg p-2.5"
            >
              <div className="flex items-center gap-1.5">
                <span
                  className="size-2 rounded-full"
                  style={{ background: severityColors[item.name] }}
                />
                <span className="text-[10px] font-medium theme-text-secondary">
                  {item.name}
                </span>
              </div>
              <p className="mt-1.5 text-base font-semibold theme-text">
                {item.value.toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Module Findings */}
      <section className="theme-card min-w-0 p-4 sm:p-5">
        <SectionHeader title="Findings by module" />

        {moduleData.length > 0 ? (
          <ResponsiveContainer
            width="100%"
            height={Math.max(260, Math.min(moduleData.length * 34 + 30, 500))}
          >
            <BarChart
              data={moduleData}
              layout="vertical"
              margin={{ top: 4, right: 12, bottom: 4, left: 0 }}
            >
              <CartesianGrid
                stroke="var(--border-color)"
                horizontal={false}
              />
              <XAxis
                type="number"
                allowDecimals={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="module"
                width={130}
                tickFormatter={(value: string) =>
                  value.length > 19 ? `${value.slice(0, 18)}…` : value
                }
                tick={{ fill: 'var(--text-secondary)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                cursor={{ fill: 'rgba(155,130,232,0.08)' }}
                formatter={(value) => [value ?? 0, 'Findings']}
              />
              <Bar
                dataKey="findings"
                name="Findings"
                fill="#9b82e8"
                radius={[0, 4, 4, 0]}
                maxBarSize={20}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}
      </section>

      {/* Daily Trends */}
      <section className="theme-card min-w-0 p-4 sm:p-5 xl:col-span-2">
        <SectionHeader title="Finding trends" />

        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart
              data={trendData}
              margin={{ top: 10, right: 10, bottom: 4, left: -15 }}
            >
              <CartesianGrid
                stroke="var(--border-color)"
                vertical={false}
              />
              <XAxis
                dataKey="date"
                tickFormatter={(value: string) => formatUtcDate(value, 'short')}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                minTickGap={20}
                interval="preserveStartEnd"
              />
              <YAxis
                allowDecimals={false}
                tick={{ fill: 'var(--text-muted)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={38}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={(label) => formatUtcDate(String(label))}
                formatter={(value) => [value ?? 0, 'Findings']}
              />
              <Line
                type="monotone"
                dataKey="count"
                name="Findings"
                stroke="#9b82e8"
                strokeWidth={2}
                dot={{ r: 2.5, fill: '#9b82e8', strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#b6a1f5' }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ChartEmptyState />
        )}

        <p className="mt-1 text-right text-[10px] theme-text-muted">
          {formatUtcDate(analytics.analytics_period.start_date)} –{' '}
          {formatUtcDate(analytics.analytics_period.end_date)} UTC
        </p>
      </section>
    </div>
  )
}

function ForensicStatistics({ analytics }: { analytics: DashboardAnalytics }) {
  return (
    <section>
      <SectionHeader title="Forensic statistics" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total reports"
          value={analytics.reports.total_generated}
          icon={FileText}
          accent="bg-blue-400/10 text-blue-500"
        />
        <StatCard
          label="Reports this period"
          value={analytics.reports.generated_in_period}
          icon={Activity}
          accent="bg-violet-400/10 text-violet-500"
        />
        <StatCard
          label="Integrity records"
          value={analytics.total_integrity_records}
          icon={ShieldCheck}
          accent="bg-emerald-400/10 text-emerald-500"
        />
      </div>
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
      label: 'Verified',
      value: outcomes.INTEGRITY_VERIFIED,
      icon: ShieldCheck,
      accent: 'text-emerald-500 bg-emerald-400/10',
      marker: 'bg-emerald-400',
    },
    {
      label: 'Hash mismatch',
      value: outcomes.HASH_MISMATCH,
      icon: ShieldX,
      accent: 'text-rose-500 bg-rose-400/10',
      marker: 'bg-rose-400',
    },
    {
      label: 'File missing',
      value: outcomes.FILE_MISSING,
      icon: CircleAlert,
      accent: 'text-amber-500 bg-amber-400/10',
      marker: 'bg-amber-400',
    },
  ]

  return (
    <section className="theme-card p-4 sm:p-5">
      <SectionHeader title="Evidence verification" />

      <div className="grid gap-3 sm:grid-cols-3">
        {events.map(({ label, value, icon: Icon, accent, marker }) => (
          <article
            key={label}
            className="theme-card-secondary flex items-center gap-3 p-3.5"
          >
            <span className={`flex size-9 items-center justify-center rounded-lg ${accent}`}>
              <Icon size={17} />
            </span>
            <div>
              <p className="text-xs theme-text-secondary">{label}</p>
              <p className="mt-1 flex items-center gap-2 text-lg font-semibold theme-text">
                <span className={`size-1.5 rounded-full ${marker}`} />
                {value.toLocaleString()}
              </p>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}

function SeverityBadge({ severity }: { severity: string }) {
  const normalizedSeverity = severity.toUpperCase()
  const style =
    recentFindingSeverityStyles[normalizedSeverity] ??
    'border-[var(--border-color)] bg-[var(--bg-card-hover)] theme-text-secondary'

  return (
    <span
      className={`inline-flex rounded-md border px-2 py-1 text-[10px] font-semibold uppercase tracking-wide ${style}`}
    >
      {severity || 'Unknown'}
    </span>
  )
}

function RecentFindings({
  findings,
}: {
  findings: DashboardAnalytics['recent_findings']
})  {
  return (
    <section className="theme-card overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--border-color)] px-4 py-3.5 sm:px-5">
        <h2 className="text-sm font-semibold theme-text">
          Recent findings
        </h2>
        <span className="theme-card-secondary rounded-md px-2 py-1 text-[10px] theme-text-secondary">
          {findings.length} / 10
        </span>
      </div>

      {findings.length === 0 ? (
        <div className="flex h-44 items-center justify-center text-sm theme-text-muted">
          No findings yet
        </div>
      ) : (
        <>
          <div className="hidden overflow-x-auto xl:block">
            <table className="theme-table w-full min-w-[950px] text-left">
              <thead>
                <tr className="theme-table-header border-b text-[10px] uppercase tracking-wider">
                  <th className="px-5 py-3">Finding</th>
                  <th className="px-4 py-3">Case</th>
                  <th className="px-4 py-3">Module</th>
                  <th className="px-4 py-3">Prediction</th>
                  <th className="px-4 py-3">Confidence</th>
                  <th className="px-4 py-3">Severity</th>
                  <th className="px-5 py-3">Timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-color)]">
                {findings.map((finding) => (
                  <tr
                    key={finding.finding_id}
                    className="transition theme-hover"
                  >
                    <td className="px-5 py-3.5 font-mono text-xs theme-text-secondary">
                      #{finding.finding_id}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-xs theme-text-secondary">
                      {finding.case_id}
                    </td>
                    <td className="max-w-52 truncate px-4 py-3.5 text-sm theme-text">
                      {finding.module}
                    </td>
                    <td
                      className="max-w-64 truncate px-4 py-3.5 text-sm theme-text-secondary"
                      title={finding.prediction}
                    >
                      {finding.prediction}
                    </td>
                    <td className="px-4 py-3.5 text-xs theme-text-secondary">
                      {formatConfidence(finding.confidence)}
                    </td>
                    <td className="px-4 py-3.5">
                      <SeverityBadge severity={finding.severity} />
                    </td>
                    <td className="whitespace-nowrap px-5 py-3.5 text-xs theme-text-secondary">
                      {formatTimestamp(finding.timestamp)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="space-y-2.5 p-3 xl:hidden">
            {findings.map((finding) => (
              <article
                key={finding.finding_id}
                className="theme-card-secondary rounded-lg p-3.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs theme-text-secondary">
                    #{finding.finding_id}
                  </span>
                  <SeverityBadge severity={finding.severity} />
                </div>

                <p className="mt-2 text-sm font-medium theme-text">
                  {finding.module}
                </p>
                <p className="mt-1 break-words text-xs theme-text-secondary">
                  {finding.prediction}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] theme-text-muted">
                  <span>Case: {finding.case_id}</span>
                  <span>Confidence: {formatConfidence(finding.confidence)}</span>
                  <span>{formatTimestamp(finding.timestamp)}</span>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
    </section>
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
      <section className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center text-center theme-text">
        <span className="flex size-11 items-center justify-center rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-300">
          <CircleAlert size={21} />
        </span>
        <h1 className="mt-3 text-base font-semibold theme-text">
          Analytics unavailable
        </h1>
        <p role="alert" className="mt-2 text-sm theme-text-secondary">
          {errorMessage}
        </p>
        <button
          type="button"
          onClick={retry}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-purple-700"
        >
          <RefreshCw size={14} />
          Try again
        </button>
      </section>
    )
  }

  return (
    <section className="mx-auto max-w-7xl space-y-5 theme-text">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          
          <h1 className="mt-1 text-2xl font-semibold tracking-tight theme-text">
            CyberFusion
          </h1>
          <p className="mt-1 max-w-2xl text-sm theme-text-secondary">
            Unified AI-powered cybersecurity, investigation, and digital forensics workspace.
          </p>
        </div>
        {analytics && !isLoading && (
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-500/20 bg-emerald-500/5 px-2.5 py-1 text-[11px] text-emerald-600 dark:text-emerald-300 sm:self-center">
            <span className="size-1.5 rounded-full bg-emerald-400" />
            Live analytics
          </span>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
        {isLoading ? (
          Array.from({ length: 5 }, (_, index) => <StatSkeleton key={index} />)
        ) : analytics ? (
          <>
            <StatCard
              label="Total cases"
              value={analytics.total_cases}
              icon={BriefcaseBusiness}
              accent="bg-blue-400/10 text-blue-500"
            />
            <StatCard
              label="Open cases"
              value={analytics.open_cases}
              icon={Archive}
              accent="bg-amber-400/10 text-amber-500"
            />
            <StatCard
              label="Closed cases"
              value={analytics.closed_cases}
              icon={CheckCircle2}
              accent="bg-emerald-400/10 text-emerald-500"
            />
            <StatCard
              label="Evidence"
              value={analytics.total_evidence}
              icon={FileSearch}
              accent="bg-violet-400/10 text-violet-500"
            />
            <StatCard
              label="AI findings"
              value={analytics.total_findings}
              icon={ShieldAlert}
              accent="bg-rose-400/10 text-rose-500"
            />
          </>
        ) : null}
      </div>

      {/* Charts */}
      {isLoading ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {Array.from({ length: 3 }, (_, index) => (
            <div
              key={index}
              className={`theme-card animate-pulse ${
                index === 2 ? 'h-[330px] xl:col-span-2' : 'h-[330px]'
              }`}
            />
          ))}
        </div>
      ) : (
        analytics && <DashboardCharts analytics={analytics} />
      )}

      {/* Forensic statistics */}
      {isLoading ? (
        <div className="theme-card h-32 animate-pulse" />
      ) : (
        analytics && <ForensicStatistics analytics={analytics} />
      )}

      {/* Verification */}
      {isLoading ? (
        <div className="theme-card h-32 animate-pulse" />
      ) : (
        analytics && (
          <EvidenceVerificationEvents
            outcomes={analytics.evidence_verification_outcomes}
          />
        )
      )}

      {/* Recent findings */}
      {isLoading ? (
        <div className="theme-card h-64 animate-pulse" />
      ) : (
        analytics && <RecentFindings findings={analytics.recent_findings} />
      )}
    </section>
  )
}
