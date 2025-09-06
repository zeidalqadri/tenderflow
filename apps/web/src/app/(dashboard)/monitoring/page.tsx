'use client'

import React, { useEffect } from 'react'
import { SystemHealthOverview } from '@/components/ui/system-health-overview'
import { ComponentStatusGrid } from '@/components/ui/component-status-grid'
import { ErrorPatternList } from '@/components/ui/error-pattern-list'
import { PerformanceMetricsChart } from '@/components/ui/performance-metrics-chart'
import { RemediationActionPanel } from '@/components/ui/remediation-action-panel'
import { useMonitoringSocket } from '@/hooks/use-monitoring-socket'
import { useMonitoringStore } from '@/stores/monitoring-store'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Activity, 
  AlertTriangle, 
  BarChart3, 
  Settings,
  RefreshCw,
  Download,
  Bell
} from 'lucide-react'

export default function MonitoringDashboard() {
  const socket = useMonitoringSocket()
  const { systemHealth, components, selectedComponent, setSelectedComponent } = useMonitoringStore()

  // Initialize monitoring data on mount
  useEffect(() => {
    // Fetch initial monitoring data
    fetch('/api/monitoring/status')
      .then(res => res.json())
      .then(data => {
        useMonitoringStore.getState().setSystemHealth(data.systemHealth)
        data.components.forEach((component: any) => {
          useMonitoringStore.getState().updateComponent(component)
        })
      })
      .catch(console.error)
  }, [])

  const handleRefresh = () => {
    // Force refresh all monitoring data
    socket.emit('monitoring:refresh')
  }

  const handleExport = () => {
    // Export monitoring data as CSV/JSON
    const data = {
      systemHealth,
      components,
      timestamp: new Date().toISOString()
    }
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `monitoring-export-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Monitoring</h1>
          <p className="text-muted-foreground">
            Real-time monitoring and health status of all system components
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleRefresh}
            aria-label="Refresh monitoring data"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            onClick={handleExport}
            aria-label="Export monitoring data"
          >
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            aria-label="Configure notifications"
          >
            <Bell className="w-4 h-4 mr-2" />
            Alerts
          </Button>
          
          <Button 
            variant="outline" 
            size="sm"
            aria-label="Dashboard settings"
          >
            <Settings className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* System Health Overview */}
      <SystemHealthOverview 
        onComponentClick={(componentId) => setSelectedComponent(componentId)}
      />

      {/* Main Dashboard Tabs */}
      <Tabs defaultValue="components" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="components">
            <Activity className="w-4 h-4 mr-2" />
            Components
          </TabsTrigger>
          <TabsTrigger value="performance">
            <BarChart3 className="w-4 h-4 mr-2" />
            Performance
          </TabsTrigger>
          <TabsTrigger value="errors">
            <AlertTriangle className="w-4 h-4 mr-2" />
            Errors
          </TabsTrigger>
          <TabsTrigger value="remediation">
            <Settings className="w-4 h-4 mr-2" />
            Remediation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="components" className="space-y-4">
          <ComponentStatusGrid 
            selectedCategory={selectedComponent}
            onComponentSelect={(id) => setSelectedComponent(id)}
          />
        </TabsContent>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <PerformanceMetricsChart 
              metric="responseTime"
              title="Response Time Trends"
              color="blue"
            />
            <PerformanceMetricsChart 
              metric="throughput"
              title="Request Throughput"
              color="green"
            />
            <PerformanceMetricsChart 
              metric="errorRate"
              title="Error Rate"
              color="red"
            />
            <PerformanceMetricsChart 
              metric="cpu"
              title="CPU Utilization"
              color="purple"
            />
          </div>
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <ErrorPatternList />
        </TabsContent>

        <TabsContent value="remediation" className="space-y-4">
          <RemediationActionPanel />
        </TabsContent>
      </Tabs>

      {/* Real-time Connection Status */}
      <div className="fixed bottom-4 right-4 z-50">
        <Card className="shadow-lg">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <div className={`w-2 h-2 rounded-full ${
                socket.isConnected ? 'bg-green-500' : 'bg-red-500'
              } animate-pulse`} />
              <span className="text-muted-foreground">
                {socket.isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}