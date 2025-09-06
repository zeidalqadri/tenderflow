'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { useQueueStats, useQueueHealth, useRetryFailedJobs } from '@/hooks/use-queues'
import { 
  ChevronDown,
  ChevronUp,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Loader2,
  AlertCircle,
  Zap
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface QueueMonitorProps {
  className?: string
  defaultExpanded?: boolean
}

export function QueueMonitor({ className, defaultExpanded = false }: QueueMonitorProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const { data: stats, isLoading: statsLoading } = useQueueStats()
  const { data: health } = useQueueHealth()
  const retryMutation = useRetryFailedJobs()

  const queueNames = {
    SCRAPING: 'Scraping',
    PROCESSING: 'Processing', 
    NOTIFICATIONS: 'Notifications',
    DOCUMENTS: 'Documents',
    CLEANUP: 'Maintenance'
  }

  const getQueueIcon = (name: string) => {
    switch (name) {
      case 'SCRAPING': return <Zap className="w-4 h-4" />
      case 'PROCESSING': return <Activity className="w-4 h-4" />
      case 'NOTIFICATIONS': return <AlertCircle className="w-4 h-4" />
      case 'DOCUMENTS': return <Clock className="w-4 h-4" />
      case 'CLEANUP': return <RefreshCw className="w-4 h-4" />
      default: return <Activity className="w-4 h-4" />
    }
  }

  const getQueueColor = (name: string) => {
    switch (name) {
      case 'SCRAPING': return 'text-blue-600 bg-blue-50'
      case 'PROCESSING': return 'text-purple-600 bg-purple-50'
      case 'NOTIFICATIONS': return 'text-yellow-600 bg-yellow-50'
      case 'DOCUMENTS': return 'text-green-600 bg-green-50'
      case 'CLEANUP': return 'text-gray-600 bg-gray-50'
      default: return 'text-gray-600 bg-gray-50'
    }
  }

  const totalActive = stats?.queues ? 
    Object.values(stats.queues).reduce((sum: number, q: any) => sum + (q.active || 0), 0) : 0
  
  const totalPending = stats?.queues ?
    Object.values(stats.queues).reduce((sum: number, q: any) => sum + (q.waiting || 0), 0) : 0

  const totalFailed = stats?.queues ?
    Object.values(stats.queues).reduce((sum: number, q: any) => sum + (q.failed || 0), 0) : 0

  const isHealthy = health?.status === 'healthy'

  return (
    <Card className={cn("overflow-hidden", className)}>
      <CardHeader 
        className="cursor-pointer select-none"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CardTitle className="text-lg font-semibold">Processing Status</CardTitle>
            <div className="flex items-center gap-2">
              {isHealthy ? (
                <Badge variant="outline" className="gap-1 text-green-600 border-green-200">
                  <CheckCircle2 className="w-3 h-3" />
                  Healthy
                </Badge>
              ) : (
                <Badge variant="outline" className="gap-1 text-red-600 border-red-200">
                  <XCircle className="w-3 h-3" />
                  Issues Detected
                </Badge>
              )}
              {totalActive > 0 && (
                <Badge className="gap-1 bg-blue-600">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  {totalActive} Active
                </Badge>
              )}
              {totalPending > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Clock className="w-3 h-3" />
                  {totalPending} Pending
                </Badge>
              )}
              {totalFailed > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <XCircle className="w-3 h-3" />
                  {totalFailed} Failed
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? <ChevronUp /> : <ChevronDown />}
          </Button>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0">
          {statsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : (
            <div className="space-y-3">
              {stats?.queues && Object.entries(stats.queues).map(([key, queue]: [string, any]) => {
                const displayName = queueNames[key as keyof typeof queueNames] || key
                const total = (queue.waiting || 0) + (queue.active || 0) + 
                            (queue.delayed || 0) + (queue.completed || 0) + (queue.failed || 0)
                const progressPercent = total > 0 ? 
                  ((queue.completed || 0) / total) * 100 : 0

                return (
                  <div key={key} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={cn("p-1 rounded", getQueueColor(key))}>
                          {getQueueIcon(key)}
                        </div>
                        <span className="font-medium text-sm">{displayName}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {queue.active > 0 && (
                          <Badge variant="outline" className="text-xs gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" />
                            {queue.active} processing
                          </Badge>
                        )}
                        {queue.waiting > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {queue.waiting} waiting
                          </Badge>
                        )}
                        {queue.failed > 0 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs text-red-600 hover:text-red-700"
                            onClick={(e) => {
                              e.stopPropagation()
                              retryMutation.mutate(key)
                            }}
                            disabled={retryMutation.isPending}
                          >
                            <RefreshCw className="w-3 h-3 mr-1" />
                            Retry {queue.failed} failed
                          </Button>
                        )}
                      </div>
                    </div>
                    
                    {(queue.active > 0 || queue.waiting > 0) && (
                      <Progress value={progressPercent} className="h-1.5" />
                    )}
                    
                    <div className="flex gap-4 text-xs text-gray-500">
                      <span>Completed: {queue.completed || 0}</span>
                      <span>•</span>
                      <span>Delayed: {queue.delayed || 0}</span>
                      {queue.failed > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-red-500">Failed: {queue.failed}</span>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}

              {/* Redis Status */}
              {stats?.redis && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Activity className="w-4 h-4" />
                      <span>Cache Status</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span>Keys: {stats.redis.stats?.keyCount || 0}</span>
                      <span>•</span>
                      <span>Memory: {stats.redis.stats?.usedMemory || 0}MB</span>
                      <Badge variant="outline" className="text-xs gap-1">
                        <CheckCircle2 className="w-3 h-3 text-green-500" />
                        {stats.redis.status}
                      </Badge>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}