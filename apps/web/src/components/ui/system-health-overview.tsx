'use client'

import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  Activity,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus
} from 'lucide-react'

interface SystemHealth {
  overall: 'healthy' | 'degraded' | 'critical'
  components: ComponentHealth[]
  lastUpdated: Date
  uptime: number
  trend: 'improving' | 'stable' | 'degrading'
}

interface ComponentHealth {
  id: string
  name: string
  category: 'scraper' | 'ingestion' | 'api' | 'database' | 'frontend'
  status: 'healthy' | 'warning' | 'critical' | 'unknown'
  healthScore: number
  activeIssues: number
}

interface SystemHealthOverviewProps {
  systemHealth?: SystemHealth | null
  components?: ComponentHealth[]
  lastUpdate?: Date | null
  onComponentClick?: (componentId: string) => void
  className?: string
}

export function SystemHealthOverview({ 
  systemHealth,
  components = [],
  lastUpdate,
  onComponentClick,
  className 
}: SystemHealthOverviewProps) {
  
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'healthy':
        return <CheckCircle2 className="w-5 h-5 text-green-500" aria-label="Healthy status" />
      case 'warning':
      case 'degraded':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" aria-label="Warning status" />
      case 'critical':
        return <XCircle className="w-5 h-5 text-red-500" aria-label="Critical status" />
      default:
        return <Activity className="w-5 h-5 text-gray-400" aria-label="Unknown status" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'bg-green-100 text-green-800 border-green-200'
      case 'warning':
      case 'degraded':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'improving':
        return <TrendingUp className="w-4 h-4 text-green-500" />
      case 'degrading':
        return <TrendingDown className="w-4 h-4 text-red-500" />
      default:
        return <Minus className="w-4 h-4 text-gray-500" />
    }
  }

  // Group components by category
  const categoryGroups = components.reduce((groups, component) => {
    const category = component.category
    if (!groups[category]) groups[category] = []
    groups[category].push(component)
    return groups
  }, {} as Record<string, ComponentHealth[]>)

  // Calculate category health
  const getCategoryHealth = (categoryComponents: ComponentHealth[]) => {
    const criticalCount = categoryComponents.filter(c => c.status === 'critical').length
    const warningCount = categoryComponents.filter(c => c.status === 'warning').length
    const healthyCount = categoryComponents.filter(c => c.status === 'healthy').length
    
    if (criticalCount > 0) return 'critical'
    if (warningCount > 0) return 'warning'
    if (healthyCount === categoryComponents.length) return 'healthy'
    return 'unknown'
  }

  // Pipeline visualization order
  const pipelineOrder = ['scraper', 'ingestion', 'api', 'database', 'frontend']

  return (
    <Card className={cn("", className)} role="region" aria-label="System Health Overview">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            {systemHealth && getStatusIcon(systemHealth.overall)}
            System Health Overview
          </CardTitle>
          <div className="flex items-center gap-4">
            {systemHealth && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Trend:</span>
                {getTrendIcon(systemHealth.trend)}
                <span className="text-sm capitalize">{systemHealth.trend}</span>
              </div>
            )}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              {lastUpdate ? `Updated ${new Date(lastUpdate).toLocaleTimeString()}` : 'No recent updates'}
            </div>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Status Card */}
        <div className="p-4 border-2 rounded-lg bg-gradient-to-r from-transparent to-transparent hover:from-muted/20 hover:to-muted/10 transition-all">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {systemHealth && getStatusIcon(systemHealth.overall)}
              <div>
                <h3 className="font-semibold text-lg">Overall System Status</h3>
                <p className="text-sm text-muted-foreground">
                  {systemHealth ? `System uptime: ${Math.floor(systemHealth.uptime / 3600)}h ${Math.floor((systemHealth.uptime % 3600) / 60)}m` : 'Loading...'}
                </p>
              </div>
            </div>
            <Badge 
              className={cn(
                "text-sm font-medium px-3 py-1",
                systemHealth && getStatusColor(systemHealth.overall)
              )}
            >
              {systemHealth?.overall.toUpperCase() || 'UNKNOWN'}
            </Badge>
          </div>
        </div>

        {/* Pipeline Visualization */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Data Pipeline Status</h3>
          <div className="flex items-center justify-between gap-2">
            {pipelineOrder.map((category, index) => {
              const categoryComponents = categoryGroups[category] || []
              const status = getCategoryHealth(categoryComponents)
              const healthScore = categoryComponents.length > 0 
                ? Math.round(categoryComponents.reduce((sum, c) => sum + c.healthScore, 0) / categoryComponents.length)
                : 0

              return (
                <React.Fragment key={category}>
                  <div
                    className="flex-1 p-3 border rounded-lg cursor-pointer hover:shadow-md transition-all"
                    onClick={() => onComponentClick?.(category)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        onComponentClick?.(category)
                      }
                    }}
                    aria-label={`${category} component status: ${status}`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium capitalize">{category}</span>
                      {getStatusIcon(status)}
                    </div>
                    <Progress 
                      value={healthScore} 
                      className="h-2"
                      aria-label={`Health score: ${healthScore}%`}
                    />
                    <div className="mt-2 text-xs text-muted-foreground">
                      {categoryComponents.length} components
                    </div>
                  </div>
                  {index < pipelineOrder.length - 1 && (
                    <div className="text-muted-foreground">→</div>
                  )}
                </React.Fragment>
              )
            })}
          </div>
        </div>

        {/* Component Grid */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Component Health Matrix</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {Object.entries(categoryGroups).map(([category, categoryComponents]) => {
              const healthyCount = categoryComponents.filter(c => c.status === 'healthy').length
              const warningCount = categoryComponents.filter(c => c.status === 'warning').length
              const criticalCount = categoryComponents.filter(c => c.status === 'critical').length
              const totalIssues = categoryComponents.reduce((sum, c) => sum + c.activeIssues, 0)
              
              const overallStatus = getCategoryHealth(categoryComponents)

              return (
                <div
                  key={category}
                  className={cn(
                    "p-3 border rounded-lg cursor-pointer transition-all",
                    "hover:shadow-md hover:scale-105",
                    "focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  )}
                  onClick={() => onComponentClick?.(category)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onComponentClick?.(category)
                    }
                  }}
                  aria-label={`${category} components: ${healthyCount} healthy, ${warningCount} warning, ${criticalCount} critical`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium capitalize text-sm">{category}</span>
                    {getStatusIcon(overallStatus)}
                  </div>
                  
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <div className="w-2 h-2 rounded-full bg-green-500" />
                      <span className="text-green-600">{healthyCount} OK</span>
                    </div>
                    {warningCount > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-yellow-500" />
                        <span className="text-yellow-600">{warningCount} Warning</span>
                      </div>
                    )}
                    {criticalCount > 0 && (
                      <div className="flex items-center gap-2 text-xs">
                        <div className="w-2 h-2 rounded-full bg-red-500" />
                        <span className="text-red-600">{criticalCount} Critical</span>
                      </div>
                    )}
                  </div>
                  
                  {totalIssues > 0 && (
                    <div className="mt-2 pt-2 border-t">
                      <span className="text-xs text-muted-foreground">
                        {totalIssues} active {totalIssues === 1 ? 'issue' : 'issues'}
                      </span>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* System Metrics Summary */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t">
          <div>
            <div className="text-2xl font-bold">
              {components.filter(c => c.status === 'healthy').length}
            </div>
            <p className="text-xs text-muted-foreground">Healthy Components</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-yellow-600">
              {components.filter(c => c.status === 'warning').length}
            </div>
            <p className="text-xs text-muted-foreground">Warnings</p>
          </div>
          <div>
            <div className="text-2xl font-bold text-red-600">
              {components.filter(c => c.status === 'critical').length}
            </div>
            <p className="text-xs text-muted-foreground">Critical Issues</p>
          </div>
          <div>
            <div className="text-2xl font-bold">
              {components.reduce((sum, c) => sum + c.activeIssues, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Total Active Issues</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}