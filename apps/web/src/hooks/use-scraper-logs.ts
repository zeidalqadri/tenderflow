import { useState, useEffect, useRef, useCallback } from 'react'
import { ScraperLogEntry, ScraperJobStatus, ScraperWebSocketMessage } from '@/types/scraper'

interface UseScraperLogsOptions {
  maxLogs?: number
  autoConnect?: boolean
}

export function useScraperLogs(options: UseScraperLogsOptions = {}) {
  const { maxLogs = 100, autoConnect = false } = options
  
  const [logs, setLogs] = useState<ScraperLogEntry[]>([])
  const [jobStatus, setJobStatus] = useState<ScraperJobStatus>({
    jobId: '',
    status: 'idle'
  })
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  
  const wsRef = useRef<WebSocket | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttemptsRef = useRef(0)
  const maxReconnectAttempts = 5

  const addLog = useCallback((level: ScraperLogEntry['level'], message: string, details?: any) => {
    const newLog: ScraperLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details
    }

    setLogs(prev => {
      const updated = [newLog, ...prev]
      return updated.slice(0, maxLogs)
    })
  }, [maxLogs])

  const clearLogs = useCallback(() => {
    setLogs([])
  }, [])

  const connect = useCallback((jobId: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }

    try {
      const wsUrl = `ws://localhost:3457/api/v1/scraper/ws/${jobId}`
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      setJobStatus(prev => ({ ...prev, jobId, status: 'running' }))
      addLog('info', `Connecting to scraper job ${jobId}...`)

      ws.onopen = () => {
        setIsConnected(true)
        setConnectionError(null)
        reconnectAttemptsRef.current = 0
        addLog('success', `Connected to scraper WebSocket for job ${jobId}`)
      }

      ws.onmessage = (event) => {
        try {
          const message: ScraperWebSocketMessage = JSON.parse(event.data)
          
          switch (message.type) {
            case 'progress':
              setJobStatus(prev => ({
                ...prev,
                status: 'running',
                progress: message.data.progress
              }))
              addLog('info', message.data.message || 'Scraping in progress...')
              break
              
            case 'completed':
              setJobStatus(prev => ({
                ...prev,
                status: 'completed',
                endTime: new Date(),
                tendersFound: message.data.tendersFound
              }))
              addLog('success', `Scraping completed! Found ${message.data.tendersFound || 0} tenders`)
              break
              
            case 'failed':
              setJobStatus(prev => ({
                ...prev,
                status: 'failed',
                endTime: new Date(),
                error: message.data.error
              }))
              addLog('error', `Scraping failed: ${message.data.error || 'Unknown error'}`)
              break
              
            case 'log':
              addLog(
                message.data.level || 'info',
                message.data.message || 'Log message',
                message.data
              )
              break
              
            default:
              addLog('info', `Unknown message type: ${message.type}`)
          }
        } catch (error) {
          addLog('error', 'Failed to parse WebSocket message', error)
        }
      }

      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        setConnectionError('WebSocket connection error')
        addLog('error', 'WebSocket connection error')
      }

      ws.onclose = (event) => {
        setIsConnected(false)
        wsRef.current = null
        
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          // Unexpected close, try to reconnect
          reconnectAttemptsRef.current++
          const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 10000)
          
          addLog('warning', `Connection lost. Reconnecting in ${delay/1000}s... (attempt ${reconnectAttemptsRef.current}/${maxReconnectAttempts})`)
          
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(jobId)
          }, delay)
        } else {
          addLog('info', 'WebSocket connection closed')
          if (jobStatus.status === 'running') {
            setJobStatus(prev => ({ ...prev, status: 'idle' }))
          }
        }
      }

    } catch (error) {
      setConnectionError('Failed to create WebSocket connection')
      addLog('error', 'Failed to create WebSocket connection', error)
    }
  }, [addLog, jobStatus.status])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (wsRef.current) {
      wsRef.current.close(1000) // Normal closure
      wsRef.current = null
    }
    
    setIsConnected(false)
    setJobStatus(prev => ({ ...prev, status: 'idle' }))
    addLog('info', 'Disconnected from scraper')
  }, [addLog])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect()
    }
  }, [disconnect])

  return {
    logs,
    jobStatus,
    isConnected,
    connectionError,
    connect,
    disconnect,
    clearLogs,
    addLog
  }
}