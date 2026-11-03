import { api } from './api'

export interface AuditRecord {
  id: number
  user_id: number | null
  action: string
  details: Record<string, unknown>
  created_at: string | null
}

export interface AuditLogPage {
  total: number
  limit: number
  offset: number
  logs: AuditRecord[]
}

export async function getAuditLogs(
  limit: number,
  offset: number,
): Promise<AuditLogPage> {
  const response = await api.get<AuditLogPage>('/api/audit/logs', {
    params: { limit, offset },
  })
  return response.data
}
