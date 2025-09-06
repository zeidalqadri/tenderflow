'use client'

import { create } from 'zustand'
import { devtools } from 'zustand/middleware'

export interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'down' | 'unknown'
  uptime: number
  lastCheck: Date
  components: Record<string, ComponentHealth>
}

export interface ComponentHealth {
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  health: number
  message?: string
}

export interface Component {
  id: string
  name: string
  type: 'scraper' | 'ingestion' | 'api' | 'database' | 'frontend' | 'cache' | 'queue' | 'storage'
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  health: number
  lastCheck: Date
  metrics?: {
    requests?: number
    errors?: number
    latency?: number
    throughput?: number
    cpu?: number
    memory?: number
    disk?: number
  }
  details?: Record<string, any>
}

export interface Alert {
  id: string
  level: 'info' | 'warning' | 'error' | 'critical'
  component: string
  message: string
  timestamp: Date
  details?: any
  acknowledged?: boolean
}

export interface ErrorPattern {
  id: string
  component: string
  message: string
  count: number
  lastOccurrence: Date
  pattern?: string
  remediation?: {
    id: string
    name: string
    description: string
    automated: boolean
  }
}

export interface Metrics {
  cpu: number
  memory: number
  disk: number
  network: {
    in: number
    out: number
  }
  timestamp: number
}

interface MonitoringState {
  // System Health
  systemHealth: SystemHealth
  
  // Components
  components: Component[]
  selectedComponent: Component | null
  
  // Alerts & Errors
  alerts: Alert[]
  errors: ErrorPattern[]
  
  // Metrics History
  metricsHistory: Metrics[]
  
  // Connection Status
  connectionStatus: 'connected' | 'disconnected' | 'connecting' | 'error'
  
  // Actions
  updateSystemHealth: (health: SystemHealth) => void
  updateComponent: (id: string, updates: Partial<Component>) => void
  setSelectedComponent: (component: Component | null) => void
  addAlert: (alert: Alert) => void
  acknowledgeAlert: (id: string) => void
  addError: (error: ErrorPattern) => void
  updateMetrics: (metrics: Metrics) => void
  setConnectionStatus: (status: 'connected' | 'disconnected' | 'connecting' | 'error') => void
  clearAlerts: () => void
  clearErrors: () => void
}

// Initial mock data for development
const mockComponents: Component[] = [
  {
    id: 'scraper',
    name: 'Local Scraper',
    type: 'scraper',
    status: 'healthy',
    health: 95,
    lastCheck: new Date(),
    metrics: {
      requests: 1234,
      errors: 2,
      latency: 250,
      throughput: 10
    }
  },
  {
    id: 'ingestion',
    name: 'Ingestion API',
    type: 'ingestion',
    status: 'healthy',
    health: 98,
    lastCheck: new Date(),
    metrics: {
      requests: 5678,
      errors: 5,
      latency: 150,
      throughput: 50
    }
  },
  {
    id: 'api',
    name: 'Main API',
    type: 'api',
    status: 'warning',
    health: 75,
    lastCheck: new Date(),
    metrics: {
      requests: 10234,
      errors: 45,
      latency: 320,
      throughput: 100
    }
  },
  {
    id: 'database',
    name: 'PostgreSQL',
    type: 'database',
    status: 'healthy',
    health: 92,
    lastCheck: new Date(),
    metrics: {
      requests: 25000,
      errors: 10,
      latency: 25,
      cpu: 45,
      memory: 60,
      disk: 35
    }
  },
  {
    id: 'frontend',
    name: 'Web App',
    type: 'frontend',
    status: 'healthy',
    health: 100,
    lastCheck: new Date(),
    metrics: {
      requests: 8500,
      errors: 0,
      latency: 50
    }
  }
]

const mockAlerts: Alert[] = [
  {
    id: '1',
    level: 'warning',
    component: 'api',
    message: 'High response time detected (>300ms average)',
    timestamp: new Date(Date.now() - 5 * 60 * 1000),
    details: { avgLatency: 320, threshold: 300 }
  },
  {
    id: '2',
    level: 'info',
    component: 'scraper',
    message: 'Scraper scheduled maintenance in 2 hours',
    timestamp: new Date(Date.now() - 30 * 60 * 1000)
  }
]

const mockErrors: ErrorPattern[] = [
  {
    id: '1',
    component: 'api',
    message: 'Connection timeout to database',
    count: 12,
    lastOccurrence: new Date(Date.now() - 10 * 60 * 1000),
    pattern: 'ECONNREFUSED',
    remediation: {
      id: 'reset-db-connections',
      name: 'Reset Database Connection Pool',
      description: 'Close and re-establish all database connections',
      automated: true
    }
  }
]

export const useMonitoringStore = create<MonitoringState>()(
  devtools(
    (set) => ({
      // Initial state
      systemHealth: {
        overall: 'healthy',
        uptime: 86400,
        lastCheck: new Date(),
        components: {
          scraper: { status: 'healthy', health: 95 },
          ingestion: { status: 'healthy', health: 98 },
          api: { status: 'warning', health: 75 },
          database: { status: 'healthy', health: 92 },
          frontend: { status: 'healthy', health: 100 }
        }
      },
      components: mockComponents,
      selectedComponent: null,
      alerts: mockAlerts,
      errors: mockErrors,
      metricsHistory: [],
      connectionStatus: 'disconnected',

      // Actions
      updateSystemHealth: (health) => 
        set((state) => ({ systemHealth: health })),

      updateComponent: (id, updates) =>
        set((state) => ({
          components: state.components.map((c) =>
            c.id === id ? { ...c, ...updates } : c
          )
        })),

      setSelectedComponent: (component) =>
        set(() => ({ selectedComponent: component })),

      addAlert: (alert) =>
        set((state) => ({
          alerts: [alert, ...state.alerts].slice(0, 100) // Keep last 100 alerts
        })),

      acknowledgeAlert: (id) =>
        set((state) => ({
          alerts: state.alerts.map((a) =>
            a.id === id ? { ...a, acknowledged: true } : a
          )
        })),

      addError: (error) =>
        set((state) => {
          const existingError = state.errors.find(e => e.id === error.id)
          if (existingError) {
            return {
              errors: state.errors.map(e =>
                e.id === error.id 
                  ? { ...e, count: e.count + 1, lastOccurrence: error.lastOccurrence }
                  : e
              )
            }
          }
          return {
            errors: [error, ...state.errors].slice(0, 50) // Keep last 50 error patterns
          }
        }),

      updateMetrics: (metrics) =>
        set((state) => ({
          metricsHistory: [...state.metricsHistory, metrics].slice(-60) // Keep last 60 data points
        })),

      setConnectionStatus: (status) =>
        set((state) => {
          // Only update if status actually changed
          if (state.connectionStatus === status) {
            return state
          }
          return { connectionStatus: status }
        }),

      clearAlerts: () =>
        set(() => ({ alerts: [] })),

      clearErrors: () =>
        set(() => ({ errors: [] }))
    }),
    {
      name: 'monitoring-store'
    }
  )
)