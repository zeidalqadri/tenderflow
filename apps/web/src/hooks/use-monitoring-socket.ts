'use client'

import { useEffect, useCallback, useRef } from 'react'
import { useSocket } from '@/hooks/use-socket'
import { useMonitoringStore } from '@/stores/monitoring-store'

interface SystemMetrics {
  cpu: number
  memory: number
  disk: number
  network: {
    in: number
    out: number
  }
}

interface ComponentStatus {
  id: string
  name: string
  status: 'healthy' | 'warning' | 'error' | 'unknown'
  health: number
  lastCheck: Date
  metrics?: {
    requests?: number
    errors?: number
    latency?: number
    throughput?: number
  }
}

interface AlertEvent {
  id: string
  level: 'info' | 'warning' | 'error' | 'critical'
  component: string
  message: string
  timestamp: Date
  details?: any
}

export function useMonitoringSocket() {
  const socket = useSocket()
  const {
    updateSystemHealth,
    updateComponent,
    addAlert,
    addError,
    updateMetrics,
    setConnectionStatus
  } = useMonitoringStore()
  
  // Track connection status to prevent redundant updates
  const lastConnectionStatusRef = useRef<string | null>(null)

  // Handle system health updates
  const handleSystemHealth = useCallback((data: any) => {
    updateSystemHealth({
      overall: data.overall || 'unknown',
      uptime: data.uptime || 0,
      lastCheck: new Date(data.lastCheck || Date.now()),
      components: data.components || {}
    })
  }, [updateSystemHealth])

  // Handle component status updates
  const handleComponentUpdate = useCallback((data: ComponentStatus) => {
    updateComponent(data.id, {
      ...data,
      lastCheck: new Date(data.lastCheck)
    })
  }, [updateComponent])

  // Handle alert events
  const handleAlert = useCallback((alert: AlertEvent) => {
    addAlert({
      ...alert,
      timestamp: new Date(alert.timestamp)
    })
  }, [addAlert])

  // Handle error events
  const handleError = useCallback((error: any) => {
    addError({
      id: error.id || Date.now().toString(),
      component: error.component || 'unknown',
      message: error.message || 'Unknown error',
      timestamp: new Date(error.timestamp || Date.now()),
      count: error.count || 1,
      lastOccurrence: new Date(error.lastOccurrence || Date.now()),
      pattern: error.pattern,
      remediation: error.remediation
    })
  }, [addError])

  // Handle metrics updates
  const handleMetrics = useCallback((metrics: SystemMetrics) => {
    updateMetrics({
      cpu: metrics.cpu,
      memory: metrics.memory,
      disk: metrics.disk,
      network: metrics.network,
      timestamp: Date.now()
    })
  }, [updateMetrics])

  // Handle connection status separately to prevent infinite loops
  useEffect(() => {
    const newStatus = (!socket || typeof socket.on !== 'function') ? 'disconnected' : 'connected'
    
    // Only update if status actually changed
    if (lastConnectionStatusRef.current !== newStatus) {
      lastConnectionStatusRef.current = newStatus
      setConnectionStatus(newStatus)
    }
  }, [socket, setConnectionStatus])

  // Setup socket listeners
  useEffect(() => {
    // Early return if socket is not available
    if (!socket || typeof socket.on !== 'function') {
      return
    }

    // Connection events
    socket.on('connect', () => {
      if (lastConnectionStatusRef.current !== 'connected') {
        lastConnectionStatusRef.current = 'connected'
        setConnectionStatus('connected')
      }
      console.log('Monitoring socket connected')
    })

    socket.on('disconnect', () => {
      if (lastConnectionStatusRef.current !== 'disconnected') {
        lastConnectionStatusRef.current = 'disconnected'
        setConnectionStatus('disconnected')
      }
      console.log('Monitoring socket disconnected')
    })

    socket.on('error', (error) => {
      if (lastConnectionStatusRef.current !== 'error') {
        lastConnectionStatusRef.current = 'error'
        setConnectionStatus('error')
      }
      console.error('Monitoring socket error:', error)
    })

    // Monitoring events
    socket.on('health:update', handleSystemHealth)
    socket.on('component:update', handleComponentUpdate)
    socket.on('alert:new', handleAlert)
    socket.on('error:new', handleError)
    socket.on('metrics:update', handleMetrics)

    // Request initial data
    socket.emit('monitoring:subscribe')

    return () => {
      // Safe cleanup - check socket methods exist before calling
      if (socket && typeof socket.off === 'function') {
        socket.off('connect')
        socket.off('disconnect')
        socket.off('error')
        socket.off('health:update')
        socket.off('component:update')
        socket.off('alert:new')
        socket.off('error:new')
        socket.off('metrics:update')
      }
      if (socket && typeof socket.emit === 'function') {
        socket.emit('monitoring:unsubscribe')
      }
    }
  }, [
    socket,
    handleSystemHealth,
    handleComponentUpdate,
    handleAlert,
    handleError,
    handleMetrics,
    setConnectionStatus
  ])

  // Public methods
  const refreshHealth = useCallback(() => {
    if (socket && typeof socket.emit === 'function') {
      socket.emit('monitoring:refresh:health')
    }
  }, [socket])

  const refreshComponent = useCallback((componentId: string) => {
    if (socket && typeof socket.emit === 'function') {
      socket.emit('monitoring:refresh:component', { componentId })
    }
  }, [socket])

  const executeRemediation = useCallback((actionId: string) => {
    if (socket && typeof socket.emit === 'function') {
      socket.emit('monitoring:remediation:execute', { actionId })
    }
  }, [socket])

  return {
    socket,
    refreshHealth,
    refreshComponent,
    executeRemediation
  }
}