'use client'

import React, { forwardRef, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { 
  ChevronUp, 
  ChevronDown, 
  X, 
  Trash2, 
  Circle,
  WifiOff,
  Wifi,
  Loader2
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useScraperLogs } from '@/hooks/use-scraper-logs'
import { ScraperLogEntry } from '@/types/scraper'

interface ScraperLogBarProps {
  className?: string
  jobId?: string
  autoConnect?: boolean
}

const getLogLevelColor = (level: ScraperLogEntry['level']) => {
  switch (level) {
    case 'success':
      return 'text-green-600 bg-green-50'
    case 'error':
      return 'text-red-600 bg-red-50'
    case 'warning':
      return 'text-yellow-600 bg-yellow-50'
    case 'info':
    default:
      return 'text-blue-600 bg-blue-50'
  }
}

const getStatusColor = (status: string) => {
  switch (status) {
    case 'running':
      return 'text-blue-600 bg-blue-100'
    case 'completed':
      return 'text-green-600 bg-green-100'
    case 'failed':
      return 'text-red-600 bg-red-100'
    case 'idle':
    default:
      return 'text-gray-600 bg-gray-100'
  }
}

const formatTime = (date: Date) => {
  return date.toLocaleTimeString('en-US', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

export const ScraperLogBar = forwardRef<HTMLDivElement, ScraperLogBarProps>(
  ({ className, jobId, autoConnect = false, ...props }, ref) => {
    const [isExpanded, setIsExpanded] = useState(false)
    const logContainerRef = useRef<HTMLDivElement>(null)
    
    const { 
      logs, 
      jobStatus, 
      isConnected, 
      connectionError, 
      connect, 
      disconnect, 
      clearLogs 
    } = useScraperLogs({ maxLogs: 100, autoConnect })

    // Auto-scroll to bottom when new logs arrive
    useEffect(() => {
      if (logContainerRef.current && isExpanded) {
        logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
      }
    }, [logs, isExpanded])

    // Auto-connect if jobId provided and autoConnect is true
    useEffect(() => {
      if (jobId && autoConnect && !isConnected && jobStatus.status === 'idle') {
        connect(jobId)
      }
    }, [jobId, autoConnect, isConnected, jobStatus.status, connect])

    const handleToggleExpand = () => {
      setIsExpanded(!isExpanded)
    }

    const handleClearLogs = () => {
      clearLogs()
    }

    const handleDisconnect = () => {
      disconnect()
    }

    // Don't render if no activity and no logs
    if (jobStatus.status === 'idle' && logs.length === 0) {
      return null
    }

    return (
      <div
        ref={ref}
        className={cn(
          'fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out',
          'border-t border-border bg-background shadow-lg',
          isExpanded ? 'h-80' : 'h-12',
          className
        )}
        {...props}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-muted/30">
          <div className="flex items-center gap-3">
            {/* Connection Status */}
            <div className="flex items-center gap-2">
              {isConnected ? (
                <Wifi className="w-4 h-4 text-green-600" />
              ) : (
                <WifiOff className="w-4 h-4 text-gray-400" />
              )}
              <span className="text-sm font-medium">Scraper Logs</span>
            </div>

            {/* Job Status */}
            {jobStatus.jobId && (
              <div className="flex items-center gap-2">
                <div className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
                  getStatusColor(jobStatus.status)
                )}>
                  {jobStatus.status === 'running' && (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  )}
                  <Circle className={cn(
                    'w-2 h-2',
                    jobStatus.status === 'running' && 'animate-pulse'
                  )} />
                  {jobStatus.status}
                </div>
                <span className="text-xs text-muted-foreground">
                  Job: {jobStatus.jobId.slice(-8)}
                </span>
              </div>
            )}

            {/* Progress */}
            {jobStatus.progress !== undefined && (
              <div className="text-xs text-muted-foreground">
                Progress: {Math.round(jobStatus.progress)}%
              </div>
            )}

            {/* Log Count */}
            {logs.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {logs.length} logs
              </span>
            )}
          </div>

          {/* Controls */}
          <div className="flex items-center gap-1">
            {logs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleClearLogs}
                className="h-8 w-8 p-0"
                title="Clear logs"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            )}
            
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleDisconnect}
                className="h-8 w-8 p-0"
                title="Disconnect"
              >
                <X className="w-3 h-3" />
              </Button>
            )}

            <Button
              variant="ghost"
              size="sm"
              onClick={handleToggleExpand}
              className="h-8 w-8 p-0"
              title={isExpanded ? 'Collapse' : 'Expand'}
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4" />
              ) : (
                <ChevronUp className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Expanded Log Content */}
        {isExpanded && (
          <div className="flex-1 overflow-hidden">
            <div
              ref={logContainerRef}
              className="h-full overflow-y-auto p-3 space-y-2 text-sm font-mono"
            >
              {connectionError && (
                <div className="p-2 bg-red-50 border border-red-200 rounded text-red-700 text-xs">
                  Connection Error: {connectionError}
                </div>
              )}
              
              {logs.length === 0 ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  No logs yet
                </div>
              ) : (
                logs.slice().reverse().map((log) => (
                  <div
                    key={log.id}
                    className={cn(
                      'flex items-start gap-3 p-2 rounded border',
                      getLogLevelColor(log.level)
                    )}
                  >
                    <span className="text-xs text-muted-foreground min-w-[60px]">
                      {formatTime(log.timestamp)}
                    </span>
                    <span className={cn(
                      'text-xs font-semibold uppercase min-w-[50px]',
                      log.level === 'error' && 'text-red-700',
                      log.level === 'warning' && 'text-yellow-700',
                      log.level === 'success' && 'text-green-700',
                      log.level === 'info' && 'text-blue-700'
                    )}>
                      {log.level}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="break-words">{log.message}</p>
                      {log.details && (
                        <pre className="mt-1 text-xs opacity-70 overflow-x-auto">
                          {JSON.stringify(log.details, null, 2)}
                        </pre>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    )
  }
)

ScraperLogBar.displayName = 'ScraperLogBar'