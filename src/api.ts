import type {
  CacheStatus,
  Events,
  LaunchDetail,
  Launches,
  StarlinkSummary,
  Stats,
} from './types'

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function getJson<T>(path: string): Promise<T> {
  const response = await fetch(path, { headers: { accept: 'application/json' } })
  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    let code = 'REQUEST_FAILED'
    try {
      const body = (await response.json()) as {
        error?: { message?: string; code?: string }
      }
      message = body.error?.message ?? message
      code = body.error?.code ?? code
    } catch {
      // Preserve the status-based error when the response is not JSON.
    }
    throw new ApiError(message, code, response.status)
  }
  return (await response.json()) as T
}

export const missionApi = {
  launches: () => getJson<Launches>('/api/launches'),
  launch: (id: string) =>
    getJson<LaunchDetail>(`/api/launches/${encodeURIComponent(id)}`),
  events: () => getJson<Events>('/api/events'),
  starlink: () => getJson<StarlinkSummary>('/api/starlink'),
  cacheStatus: () => getJson<CacheStatus>('/api/cache'),
  stats: () => getJson<Stats>('/api/stats'),
  nextLaunches: () => getJson<Launches>('/api/next-launches'),
}
