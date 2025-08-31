'use client'

import { useEffect, useRef, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useAuthStore } from '@/stores/auth-store'
import { useTenderStore } from '@/stores/tender-store'
import { useUIStore } from '@/stores/ui-store'
import type { Tender } from '@tenderflow/shared'

interface SocketEvents {
  // Tender events
  'tender:created': (tender: Tender) => void
  'tender:updated': (tender: Tender) => void
  'tender:deleted': (tenderId: string) => void
  'tender:status_changed': (data: { tenderId: string; status: string; userId: string }) => void
  
  // Document events
  'document:uploaded': (data: { tenderId: string; document: any }) => void
  'document:processed': (data: { tenderId: string; documentId: string; ocrStatus: string }) => void
  
  // Notification events
  'notification:new': (notification: {
    id: string
    type: 'info' | 'success' | 'warning' | 'error'
    title: string
    message: string
    data?: any
  }) => void
  
  // System events
  'system:maintenance': (data: { message: string; scheduledAt: Date }) => void
  'system:update': (data: { version: string; features: string[] }) => void
  
  // Collaboration events
  'user:joined': (data: { userId: string; userName: string; tenderId?: string }) => void
  'user:left': (data: { userId: string; tenderId?: string }) => void
  'tender:viewing': (data: { tenderId: string; userId: string; userName: string }) => void
}

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false)
  const [connectionError, setConnectionError] = useState<string | null>(null)
  const [lastPing, setLastPing] = useState<Date | null>(null)
  
  const socketRef = useRef<Socket | null>(null)
  const { token, user, isAuthenticated } = useAuthStore()
  const { addTender, updateTender, removeTender, addPendingChange } = useTenderStore()
  const { addNotification } = useUIStore()

  // Connect to socket
  useEffect(() => {
    if (!isAuthenticated || !token) {
      return
    }

    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3001'
    
    console.log('Connecting to socket:', socketUrl)
    
    const socket = io(socketUrl, {
      auth: {
        token: token,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 5,
      timeout: 20000,
    })

    socketRef.current = socket

    // Connection events
    socket.on('connect', () => {
      console.log('Socket connected:', socket.id)
      setIsConnected(true)
      setConnectionError(null)
      
      // Join user's personal room
      if (user?.id) {
        socket.emit('join:user', user.id)
      }
      
      addNotification({
        type: 'success',
        title: 'Connected',
        message: 'Real-time updates are now active',
      })
    })

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason)
      setIsConnected(false)
      
      if (reason === 'io server disconnect') {
        // Server disconnected, try to reconnect
        socket.connect()
      }
    })

    socket.on('connect_error', (error) => {
      console.error('Socket connection error:', error)
      setConnectionError(error.message)
      setIsConnected(false)
    })

    socket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts')
      setIsConnected(true)
      setConnectionError(null)
      
      addNotification({
        type: 'success',
        title: 'Reconnected',
        message: 'Real-time connection restored',
      })
    })

    socket.on('reconnect_error', (error) => {
      console.error('Socket reconnection failed:', error)
      setConnectionError(error.message)
    })

    // Ping/Pong for connection health
    socket.on('pong', () => {
      setLastPing(new Date())
    })

    // Tender events
    socket.on('tender:created', (tender: Tender) => {
      addTender(tender)
      addNotification({
        type: 'info',
        title: 'New Tender',
        message: `"${tender.title}" has been added`,
      })
    })

    socket.on('tender:updated', (tender: Tender) => {
      updateTender(tender.id, tender)
      addPendingChange(tender.id)
      addNotification({
        type: 'info',
        title: 'Tender Updated',
        message: `"${tender.title}" has been modified`,
      })
    })

    socket.on('tender:deleted', (tenderId: string) => {
      removeTender(tenderId)
      addNotification({
        type: 'warning',
        title: 'Tender Removed',
        message: 'A tender has been deleted',
      })
    })

    socket.on('tender:status_changed', (data) => {
      updateTender(data.tenderId, { status: data.status as any })
      addNotification({
        type: 'info',
        title: 'Status Changed',
        message: `Tender status updated to ${data.status}`,
      })
    })

    // Document events
    socket.on('document:uploaded', (data) => {
      addNotification({
        type: 'success',
        title: 'Document Uploaded',
        message: 'New document has been added to tender',
      })
    })

    socket.on('document:processed', (data) => {
      const status = data.ocrStatus === 'COMPLETED' ? 'success' : 
                    data.ocrStatus === 'FAILED' ? 'error' : 'info'
      
      addNotification({
        type: status as any,
        title: 'Document Processed',
        message: `OCR processing ${data.ocrStatus.toLowerCase()}`,
      })
    })

    // Notification events
    socket.on('notification:new', (notification) => {
      addNotification(notification)
    })

    // System events
    socket.on('system:maintenance', (data) => {
      addNotification({
        type: 'warning',
        title: 'Scheduled Maintenance',
        message: data.message,
      })
    })

    socket.on('system:update', (data) => {
      addNotification({
        type: 'info',
        title: 'System Update',
        message: `Version ${data.version} is now available`,
      })
    })

    // Collaboration events
    socket.on('user:joined', (data) => {
      if (data.tenderId) {
        addNotification({
          type: 'info',
          title: 'User Joined',
          message: `${data.userName} is now viewing this tender`,
        })
      }
    })

    socket.on('user:left', (data) => {
      if (data.tenderId) {
        console.log(`User ${data.userId} left tender ${data.tenderId}`)
      }
    })

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up socket connection')
      socket.disconnect()
      socketRef.current = null
    }
  }, [isAuthenticated, token, user?.id, addTender, updateTender, removeTender, addPendingChange, addNotification])

  // Ping every 30 seconds to check connection health
  useEffect(() => {
    if (!isConnected || !socketRef.current) return

    const pingInterval = setInterval(() => {
      socketRef.current?.emit('ping')
    }, 30000)

    return () => clearInterval(pingInterval)
  }, [isConnected])

  // Socket utility functions
  const emit = (event: string, data?: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data)
    } else {
      console.warn('Socket not connected, cannot emit:', event)
    }
  }

  const joinRoom = (room: string) => {
    emit('join:room', room)
  }

  const leaveRoom = (room: string) => {
    emit('leave:room', room)
  }

  const joinTender = (tenderId: string) => {
    emit('join:tender', tenderId)
  }

  const leaveTender = (tenderId: string) => {
    emit('leave:tender', tenderId)
  }

  const notifyTenderViewing = (tenderId: string) => {
    if (user) {
      emit('tender:viewing', {
        tenderId,
        userId: user.id,
        userName: user.name,
      })
    }
  }

  const subscribeToTenderUpdates = (tenderId: string) => {
    emit('subscribe:tender', tenderId)
  }

  const unsubscribeFromTenderUpdates = (tenderId: string) => {
    emit('unsubscribe:tender', tenderId)
  }

  return {
    isConnected,
    connectionError,
    lastPing,
    socket: socketRef.current,
    
    // Utility functions
    emit,
    joinRoom,
    leaveRoom,
    joinTender,
    leaveTender,
    notifyTenderViewing,
    subscribeToTenderUpdates,
    unsubscribeFromTenderUpdates,
  }
}

// Hook for tender-specific socket integration
export function useTenderSocket(tenderId?: string) {
  const socket = useSocket()
  
  useEffect(() => {
    if (!tenderId || !socket.isConnected) return

    // Join tender room
    socket.joinTender(tenderId)
    socket.subscribeToTenderUpdates(tenderId)
    socket.notifyTenderViewing(tenderId)

    return () => {
      socket.leaveTender(tenderId)
      socket.unsubscribeFromTenderUpdates(tenderId)
    }
  }, [tenderId, socket.isConnected])

  return socket
}