'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Activity,
  ChevronRight,
  Clock,
  Cpu,
  HardDrive,
  Network,
  Zap,
  Database,
  Server,
  Globe,
  FileCode,
  RefreshCw
} from 'lucide-react'

interface ComponentStatus {
  id: string
  name: string
  category: string
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  responseTime: number
  errorRate: number
  throughput: number
  cpu?: number
  memory?: number
  lastCheck: Date
  details?: {
    version?: string
    region?: string
    instances?: number
  }
  metrics: {
    p50ResponseTime: number
    p95ResponseTime: number
    p99ResponseTime: number
    requestsPerSecond: number
    activeConnections?: number
  }
}

interface ComponentStatusGridProps {
  components?: ComponentStatus[]
  selectedCategory?: string | null
  onComponentSelect?: (componentId: string) => void
  className?: string
}

export function ComponentStatusGrid({
  components = [],
  selectedCategory,
  onComponentSelect,
  className
}: ComponentStatusGridProps) {
  const [expandedComponent, setExpandedComponent] = useState<string | null>(null)

  // Filter components by selected category
  const filteredComponents = selectedCategory
    ? components.filter(c => c.category === selectedCategory)
    : components

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-400" />
    }
  }

  const getComponentIcon = (category: string) => {
    switch (category) {
      case 'api':
        return <Server className="w-4 h-4" />
      case 'database':
        return <Database className="w-4 h-4" />
      case 'scraper':
        return <FileCode className="w-4 h-4" />
      case 'ingestion':
        return <Network className="w-4 h-4" />
      case 'frontend':
        return <Globe className="w-4 h-4" />
      default:
        return <Activity className="w-4 h-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'border-green-200 bg-green-50'
      case 'warning':
        return 'border-yellow-200 bg-yellow-50'
      case 'critical':
        return 'border-red-200 bg-red-50'
      default:
        return 'border-gray-200 bg-gray-50'
    }
  }

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800'
      case 'warning':
        return 'bg-yellow-100 text-yellow-800'
      case 'critical':
        return 'bg-red-100 text-red-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const handleComponentClick = (componentId: string) => {
    setExpandedComponent(expandedComponent === componentId ? null : componentId)
    onComponentSelect?.(componentId)
  }

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {filteredComponents.map((component) => {
        const isExpanded = expandedComponent === component.id
        const healthScore = Math.max(0, 100 - (component.errorRate * 10))

        return (
          <Card
            key={component.id}
            className={cn(
              "transition-all cursor-pointer hover:shadow-lg",
              getStatusColor(component.status),
              isExpanded && "md:col-span-2 lg:col-span-3"
            )}
            onClick={() => handleComponentClick(component.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleComponentClick(component.id)
              }
            }}
            aria-expanded={isExpanded}
            aria-label={`${component.name} component status: ${component.status}`}
          >
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {getComponentIcon(component.category)}
                  <CardTitle className="text-base">{component.name}</CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {getStatusIcon(component.status)}
                  <Badge className={cn("text-xs", getStatusBadgeColor(component.status))}>
                    {component.status.toUpperCase()}
                  </Badge>
                  <ChevronRight 
                    className={cn(
                      "w-4 h-4 transition-transform",
                      isExpanded && "rotate-90"
                    )}
                  />
                </div>
              </div>
            </CardHeader>

            <CardContent className="space-y-3">
              {/* Quick Metrics */}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <div>
                  <div className="text-muted-foreground text-xs">Response</div>
                  <div className="font-medium">{component.responseTime}ms</div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Error Rate</div>
                  <div className={cn(
                    "font-medium",
                    component.errorRate > 5 ? "text-red-600" : 
                    component.errorRate > 1 ? "text-yellow-600" : 
                    "text-green-600"
                  )}>
                    {component.errorRate.toFixed(2)}%
                  </div>
                </div>
                <div>
                  <div className="text-muted-foreground text-xs">Throughput</div>
                  <div className="font-medium">{component.throughput}/s</div>
                </div>
              </div>

              {/* Health Score Progress */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Health Score</span>
                  <span className="font-medium">{healthScore}%</span>
                </div>
                <Progress 
                  value={healthScore} 
                  className="h-2"
                  aria-label={`Health score: ${healthScore}%`}
                />
              </div>

              {/* Resource Usage (if available) */}
              {(component.cpu !== undefined || component.memory !== undefined) && (
                <div className="grid grid-cols-2 gap-2">
                  {component.cpu !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Cpu className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">CPU:</span>
                      <span className="font-medium">{component.cpu.toFixed(1)}%</span>
                    </div>
                  )}
                  {component.memory !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <HardDrive className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Memory:</span>
                      <span className="font-medium">{component.memory.toFixed(1)}%</span>
                    </div>
                  )}
                </div>
              )}

              {/* Expanded Details */}
              {isExpanded && (
                <div className="pt-3 border-t space-y-3">
                  {/* Performance Metrics */}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Performance Metrics</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                      <div>
                        <div className="text-muted-foreground text-xs">P50 Latency</div>
                        <div className="font-medium">{component.metrics.p50ResponseTime}ms</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">P95 Latency</div>
                        <div className="font-medium">{component.metrics.p95ResponseTime}ms</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">P99 Latency</div>
                        <div className="font-medium">{component.metrics.p99ResponseTime}ms</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground text-xs">Requests/sec</div>
                        <div className="font-medium">{component.metrics.requestsPerSecond}</div>
                      </div>
                    </div>
                  </div>

                  {/* Component Details */}
                  {component.details && (
                    <div>
                      <h4 className="text-sm font-medium mb-2">Component Details</h4>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        {component.details.version && (
                          <div>
                            <div className="text-muted-foreground text-xs">Version</div>
                            <div className="font-medium">{component.details.version}</div>
                          </div>
                        )}
                        {component.details.region && (
                          <div>
                            <div className="text-muted-foreground text-xs">Region</div>
                            <div className="font-medium">{component.details.region}</div>
                          </div>
                        )}
                        {component.details.instances !== undefined && (
                          <div>
                            <div className="text-muted-foreground text-xs">Instances</div>
                            <div className="font-medium">{component.details.instances}</div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Active Connections */}
                  {component.metrics.activeConnections !== undefined && (
                    <div className="flex items-center gap-2 text-sm">
                      <Network className="w-3 h-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Active Connections:</span>
                      <span className="font-medium">{component.metrics.activeConnections}</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        // Trigger component refresh
                        console.log('Refreshing component:', component.id)
                      }}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Refresh
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        // View detailed logs
                        console.log('Viewing logs for:', component.id)
                      }}
                    >
                      View Logs
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation()
                        // View metrics dashboard
                        console.log('Viewing metrics for:', component.id)
                      }}
                    >
                      Metrics
                    </Button>
                  </div>
                </div>
              )}

              {/* Last Check Time */}
              <div className="flex items-center gap-1 text-xs text-muted-foreground pt-2 border-t">
                <Clock className="w-3 h-3" />
                Last checked: {new Date(component.lastCheck).toLocaleTimeString()}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {filteredComponents.length === 0 && (
        <Card className="md:col-span-2 lg:col-span-3">
          <CardContent className="p-12 text-center">
            <Activity className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No components found</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}