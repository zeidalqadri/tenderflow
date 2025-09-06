// Real-time Tender Updates Hook
import { useEffect, useState, useCallback, useRef } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth-store'
import { useTenderStore } from '@/stores/tender-store'
import { useToast } from '@/hooks/use-toast'

interface RealtimeConfig {
  autoConnect?: boolean
  reconnectAttempts?: number
  reconnectDelay?: number
}

interface TenderUpdate {
  id: string
  status?: string
  priority?: string
  isNew?: boolean
  [key: string]: any
}

interface ScraperStatus {
  type: 'started' | 'progress' | 'completed' | 'error'
  message?: string
  tendersFound?: number
  duration?: number
  timestamp?: string
  jobId?: string
  progress?: number
}

interface Statistics {
  total: number
  newToday: number
  pendingReview: number
  highPriority: number
  totalValue: number
  byCategory: Record<string, number>
  byStatus: Record<string, number>
}

export function useRealtimeTenders(config: RealtimeConfig = {}) {
  const { 
    autoConnect = false, // Default to false to avoid connection errors in development
    reconnectAttempts = 5, 
    reconnectDelay = 3000 
  } = config

  const [socket, setSocket] = useState<Socket | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [scraperStatus, setScraperStatus] = useState<ScraperStatus | null>(null)
  const [statistics, setStatistics] = useState<Statistics | null>(null)
  const [realtimeUpdates, setRealtimeUpdates] = useState<TenderUpdate[]>([])

  const { token, user } = useAuthStore()
  const { updateTender, addTender } = useTenderStore()
  const { toast } = useToast()

  // Initialize Socket.IO connection
  const connect = useCallback(() => {
    if (socket?.connected) return socket

    const newSocket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3457', {
      path: '/ws',
      transports: ['websocket', 'polling'],
      auth: {
        token,
        userId: user?.id,
        tenantId: user?.tenantId
      },
      reconnection: true,
      reconnectionAttempts: reconnectAttempts,
      reconnectionDelay: reconnectDelay
    })

    // Connection event handlers
    newSocket.on('connect', () => {
      setIsConnected(true)
      setConnectionError(null)
      console.log('Socket.IO connected')
      
      // Auto-subscribe to scraper updates
      newSocket.emit('subscribe:scraper')
    })

    newSocket.on('disconnect', (reason) => {
      setIsConnected(false)
      console.log('Socket.IO disconnected:', reason)
    })

    newSocket.on('connect_error', (error) => {
      setConnectionError(error.message)
      console.error('Socket.IO connection error:', error)
    })

    // Handle welcome message
    newSocket.on('connected', (data) => {
      console.log('Connected to server:', data)
    })

    // Tender event handlers
    newSocket.on('tender:new', (tender: TenderUpdate) => {
      console.log('New tender received:', tender)
      addTender(tender)
      setRealtimeUpdates(prev => [tender, ...prev].slice(0, 50)) // Keep last 50 updates
      
      // Show notification for high-value tenders
      if (tender.value && tender.value > 500000) {
        toast({
          title: 'High-Value Tender Alert',
          description: `New ${tender.currency || 'USD'} ${(tender.value / 1000).toFixed(0)}K tender: ${tender.title}`,
        })
      }
    })

    newSocket.on('tender:update', (update: TenderUpdate) => {
      console.log('Tender updated:', update)
      updateTender(update.id, update)
      setRealtimeUpdates(prev => [update, ...prev].slice(0, 50))
    })

    // Scraper event handlers
    newSocket.on('scraper:status', (status: ScraperStatus) => {
      console.log('Scraper status:', status)
      setScraperStatus(status)
    })

    newSocket.on('scraper:tender_found', (tender: any) => {
      console.log('Scraper found tender:', tender)
      
      // Add animation or highlight for newly scraped tenders
      const tenderElement = document.getElementById(`tender-${tender.id}`)
      if (tenderElement) {
        tenderElement.classList.add('animate-pulse', 'bg-green-50')
        setTimeout(() => {
          tenderElement.classList.remove('animate-pulse', 'bg-green-50')
        }, 3000)
      }
    })

    newSocket.on('scraper:completed', (data) => {
      const { jobId, tendersFound, duration, timestamp } = data
      setScraperStatus({
        type: 'completed',
        jobId,
        tendersFound,
        duration,
        timestamp: timestamp || new Date().toISOString()
      })
      
      if (tendersFound > 0) {
        toast({
          title: 'Scraping Complete',
          description: `Found ${tendersFound} new tenders`,
        })
      }
    })

    newSocket.on('scraper:error', ({ jobId, message, timestamp }) => {
      setScraperStatus({
        type: 'error',
        jobId,
        message,
        timestamp: timestamp || new Date().toISOString()
      })
      
      toast({
        title: 'Scraper Error',
        description: message,
        variant: 'destructive'
      })
    })

    // Statistics updates
    newSocket.on('statistics:update', (stats: Statistics) => {
      setStatistics(stats)
    })

    // Server shutdown handler
    newSocket.on('server:shutdown', ({ message }) => {
      toast({
        title: 'Server Shutdown',
        description: message,
        variant: 'destructive'
      })
    })

    setSocket(newSocket)
    return newSocket
  }, [token, user, socket, reconnectAttempts, reconnectDelay, toast, addTender, updateTender])

  // Disconnect socket
  const disconnect = useCallback(() => {
    if (socket) {
      socket.disconnect()
      setSocket(null)
      setIsConnected(false)
    }
  }, [socket])

  // Subscribe to specific tender updates
  const subscribeTender = useCallback((tenderId: string) => {
    if (socket?.connected) {
      socket.emit('subscribe:tender', tenderId)
    }
  }, [socket])

  // Unsubscribe from tender updates
  const unsubscribeTender = useCallback((tenderId: string) => {
    if (socket?.connected) {
      socket.emit('unsubscribe:tender', tenderId)
    }
  }, [socket])

  // Search tenders in real-time
  const searchTenders = useCallback((query: string): Promise<any[]> => {
    return new Promise((resolve, reject) => {
      if (!socket?.connected) {
        reject(new Error('Socket not connected'))
        return
      }

      const timeout = setTimeout(() => {
        reject(new Error('Search timeout'))
      }, 5000)

      socket.once('search:results', (results) => {
        clearTimeout(timeout)
        resolve(results)
      })

      socket.once('search:error', (error) => {
        clearTimeout(timeout)
        reject(new Error(error.message))
      })

      socket.emit('search:tenders', query)
    })
  }, [socket])

  // Clear realtime updates
  const clearUpdates = useCallback(() => {
    setRealtimeUpdates([])
  }, [])

  // Auto-connect on mount if enabled
  useEffect(() => {
    if (autoConnect && token && !socket) {
      const newSocket = connect()
      return () => {
        newSocket?.disconnect()
      }
    }
  }, [autoConnect, token, connect, socket])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socket) {
        socket.disconnect()
      }
    }
  }, [socket])

  return {
    // Connection state
    socket,
    isConnected,
    connectionError,
    
    // Connection methods
    connect,
    disconnect,
    
    // Tender methods
    subscribeTender,
    unsubscribeTender,
    searchTenders,
    
    // Real-time data
    scraperStatus,
    statistics,
    realtimeUpdates,
    clearUpdates
  }
}

// Hook for scraper-specific real-time updates
export function useScraperStatus() {
  const [status, setStatus] = useState<ScraperStatus | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const { socket, isConnected } = useRealtimeTenders({ autoConnect: false })

  useEffect(() => {
    if (!socket || !isConnected) return

    const handleStatus = (newStatus: ScraperStatus) => {
      setStatus(newStatus)
    }

    const handleLog = (log: string) => {
      setLogs(prev => [...prev, log].slice(-100)) // Keep last 100 logs
    }

    socket.on('scraper:status', handleStatus)
    socket.on('scraper:log', handleLog)

    return () => {
      socket.off('scraper:status', handleStatus)
      socket.off('scraper:log', handleLog)
    }
  }, [socket, isConnected])

  return { status, logs, isConnected }
}

// Hook for tender-specific real-time updates
export function useTenderSubscription(tenderId: string | null) {
  const [tenderUpdates, setTenderUpdates] = useState<TenderUpdate[]>([])
  const { socket, isConnected, subscribeTender, unsubscribeTender } = useRealtimeTenders()

  useEffect(() => {
    if (!socket || !isConnected || !tenderId) return

    subscribeTender(tenderId)

    const handleChange = (update: TenderUpdate) => {
      setTenderUpdates(prev => [...prev, update])
    }

    socket.on('tender:change', handleChange)

    return () => {
      unsubscribeTender(tenderId)
      socket.off('tender:change', handleChange)
    }
  }, [socket, isConnected, tenderId, subscribeTender, unsubscribeTender])

  return tenderUpdates
}