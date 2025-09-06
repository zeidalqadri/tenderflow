'use client'

import React, { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
} from 'recharts'
import { cn } from '@/lib/utils'
import { 
  TrendingUp, 
  TrendingDown, 
  Activity,
  Download,
  Maximize2,
  RefreshCw
} from 'lucide-react'

interface MetricDataPoint {
  timestamp: string
  value: number
  label?: string
}

interface PerformanceMetricsChartProps {
  metric: 'responseTime' | 'throughput' | 'errorRate' | 'cpu' | 'memory'
  title: string
  data?: MetricDataPoint[]
  color?: 'blue' | 'green' | 'red' | 'purple' | 'orange'
  showTrend?: boolean
  refreshInterval?: number
  onRefresh?: () => void
  className?: string
}

const colorMap = {
  blue: {
    line: '#3b82f6',
    area: '#dbeafe',
    gradient: ['#3b82f6', '#1e40af']
  },
  green: {
    line: '#10b981',
    area: '#d1fae5',
    gradient: ['#10b981', '#047857']
  },
  red: {
    line: '#ef4444',
    area: '#fee2e2',
    gradient: ['#ef4444', '#b91c1c']
  },
  purple: {
    line: '#8b5cf6',
    area: '#ede9fe',
    gradient: ['#8b5cf6', '#6d28d9']
  },
  orange: {
    line: '#f97316',
    area: '#fed7aa',
    gradient: ['#f97316', '#c2410c']
  }
}

const metricConfig = {
  responseTime: {
    unit: 'ms',
    format: (value: number) => `${value}ms`,
    threshold: { good: 200, warning: 500 }
  },
  throughput: {
    unit: 'req/s',
    format: (value: number) => `${value}/s`,
    threshold: { good: 100, warning: 50 }
  },
  errorRate: {
    unit: '%',
    format: (value: number) => `${value.toFixed(2)}%`,
    threshold: { good: 1, warning: 5 }
  },
  cpu: {
    unit: '%',
    format: (value: number) => `${value.toFixed(1)}%`,
    threshold: { good: 60, warning: 80 }
  },
  memory: {
    unit: '%',
    format: (value: number) => `${value.toFixed(1)}%`,
    threshold: { good: 70, warning: 85 }
  }
}

// Generate mock data if none provided
const generateMockData = (metric: string): MetricDataPoint[] => {
  const now = Date.now()
  const dataPoints: MetricDataPoint[] = []
  
  for (let i = 59; i >= 0; i--) {
    const timestamp = new Date(now - i * 60000)
    let value = 0
    
    switch (metric) {
      case 'responseTime':
        value = Math.random() * 300 + 100 + (i % 10) * 5
        break
      case 'throughput':
        value = Math.random() * 50 + 75 + Math.sin(i / 10) * 20
        break
      case 'errorRate':
        value = Math.random() * 3 + (i % 20 === 0 ? 5 : 0)
        break
      case 'cpu':
        value = Math.random() * 30 + 40 + Math.sin(i / 5) * 10
        break
      case 'memory':
        value = Math.random() * 20 + 60 + (i / 60) * 10
        break
    }
    
    dataPoints.push({
      timestamp: timestamp.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit' 
      }),
      value: Math.max(0, value)
    })
  }
  
  return dataPoints
}

export function PerformanceMetricsChart({
  metric,
  title,
  data,
  color = 'blue',
  showTrend = true,
  refreshInterval,
  onRefresh,
  className
}: PerformanceMetricsChartProps) {
  // Use provided data or generate mock data
  const chartData = useMemo(() => {
    return data || generateMockData(metric)
  }, [data, metric])

  // Calculate statistics
  const stats = useMemo(() => {
    if (!chartData || chartData.length === 0) {
      return { current: 0, average: 0, min: 0, max: 0, trend: 0 }
    }

    const values = chartData.map(d => d.value)
    const current = values[values.length - 1]
    const average = values.reduce((a, b) => a + b, 0) / values.length
    const min = Math.min(...values)
    const max = Math.max(...values)
    
    // Calculate trend (compare last 10 points to previous 10)
    const recentAvg = values.slice(-10).reduce((a, b) => a + b, 0) / 10
    const previousAvg = values.slice(-20, -10).reduce((a, b) => a + b, 0) / 10
    const trend = ((recentAvg - previousAvg) / previousAvg) * 100

    return { current, average, min, max, trend }
  }, [chartData])

  const config = metricConfig[metric]
  const colors = colorMap[color]

  // Determine status based on thresholds
  const getStatus = (value: number) => {
    if (metric === 'errorRate' || metric === 'cpu' || metric === 'memory') {
      if (value <= config.threshold.good) return 'good'
      if (value <= config.threshold.warning) return 'warning'
      return 'critical'
    } else {
      if (value <= config.threshold.good) return 'good'
      if (value <= config.threshold.warning) return 'warning'
      return 'critical'
    }
  }

  const status = getStatus(stats.current)

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload || !payload[0]) return null

    return (
      <div className="bg-background border rounded-lg p-3 shadow-lg">
        <p className="text-sm font-medium">{label}</p>
        <p className="text-lg font-bold" style={{ color: colors.line }}>
          {config.format(payload[0].value)}
        </p>
      </div>
    )
  }

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base">{title}</CardTitle>
            <div className="flex items-center gap-4 mt-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold" style={{ color: colors.line }}>
                  {config.format(stats.current)}
                </span>
                {showTrend && (
                  <div className="flex items-center gap-1">
                    {stats.trend > 0 ? (
                      <TrendingUp className="w-4 h-4 text-red-500" />
                    ) : stats.trend < 0 ? (
                      <TrendingDown className="w-4 h-4 text-green-500" />
                    ) : (
                      <Activity className="w-4 h-4 text-gray-500" />
                    )}
                    <span className={cn(
                      "text-sm font-medium",
                      stats.trend > 0 ? "text-red-500" : 
                      stats.trend < 0 ? "text-green-500" : 
                      "text-gray-500"
                    )}>
                      {Math.abs(stats.trend).toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
              <Badge 
                className={cn(
                  "text-xs",
                  status === 'good' ? "bg-green-100 text-green-800" :
                  status === 'warning' ? "bg-yellow-100 text-yellow-800" :
                  "bg-red-100 text-red-800"
                )}
              >
                {status.toUpperCase()}
              </Badge>
            </div>
          </div>
          
          <div className="flex items-center gap-1">
            <Button 
              size="icon" 
              variant="ghost"
              onClick={onRefresh}
              aria-label="Refresh chart"
            >
              <RefreshCw className="w-4 h-4" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost"
              aria-label="Expand chart"
            >
              <Maximize2 className="w-4 h-4" />
            </Button>
            <Button 
              size="icon" 
              variant="ghost"
              aria-label="Download data"
            >
              <Download className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        <div className="h-[200px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart 
              data={chartData}
              margin={{ top: 5, right: 5, left: 5, bottom: 5 }}
            >
              <defs>
                <linearGradient id={`gradient-${metric}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.gradient[0]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={colors.gradient[1]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="timestamp" 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
              />
              <YAxis 
                className="text-xs"
                tick={{ fill: 'currentColor' }}
                domain={[0, 'auto']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke={colors.line}
                strokeWidth={2}
                fill={`url(#gradient-${metric})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Statistics Summary */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-4 border-t">
          <div>
            <div className="text-xs text-muted-foreground">Average</div>
            <div className="text-sm font-medium">{config.format(stats.average)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Min</div>
            <div className="text-sm font-medium">{config.format(stats.min)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Max</div>
            <div className="text-sm font-medium">{config.format(stats.max)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Threshold</div>
            <div className="text-sm font-medium">{config.format(config.threshold.warning)}</div>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}