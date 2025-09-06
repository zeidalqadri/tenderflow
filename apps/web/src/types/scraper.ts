export interface ScraperLogEntry {
  id: string
  timestamp: Date
  level: 'info' | 'success' | 'warning' | 'error'
  message: string
  details?: any
}

export interface ScraperJobStatus {
  jobId: string
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress?: number
  startTime?: Date
  endTime?: Date
  tendersFound?: number
  error?: string
}

export interface ScraperWebSocketMessage {
  type: 'progress' | 'completed' | 'failed' | 'log'
  data: {
    message?: string
    progress?: number
    tendersFound?: number
    error?: string
    level?: 'info' | 'success' | 'warning' | 'error'
  }
}