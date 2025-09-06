'use client'

import React, { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import {
  Zap,
  PlayCircle,
  AlertTriangle,
  CheckCircle,
  XCircle,
  RefreshCw,
  Settings,
  Clock,
  Info,
  Shield,
  Activity
} from 'lucide-react'

interface RemediationAction {
  id: string
  name: string
  description: string
  category: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  automated: boolean
  estimatedTime: number // in seconds
  confidence: number // 0-100
  requiresApproval: boolean
  impact: string[]
  prerequisites: string[]
  status: 'available' | 'running' | 'completed' | 'failed'
  lastRun?: Date
  successRate?: number
}

interface RemediationActionPanelProps {
  actions?: RemediationAction[]
  onExecute?: (actionId: string) => void
  className?: string
}

// Generate mock remediation actions
const generateMockActions = (): RemediationAction[] => [
  {
    id: 'restart-api',
    name: 'Restart API Service',
    description: 'Gracefully restart the API service to clear memory and reset connections',
    category: 'Service Management',
    severity: 'low',
    automated: true,
    estimatedTime: 30,
    confidence: 95,
    requiresApproval: false,
    impact: ['Brief API unavailability (30s)', 'Active connections will be dropped'],
    prerequisites: ['Health check passing', 'No critical operations in progress'],
    status: 'available',
    successRate: 98
  },
  {
    id: 'scale-up',
    name: 'Auto-scale Cloud Run Instances',
    description: 'Increase the number of Cloud Run instances to handle high load',
    category: 'Scaling',
    severity: 'medium',
    automated: true,
    estimatedTime: 120,
    confidence: 88,
    requiresApproval: true,
    impact: ['Increased infrastructure costs', 'Improved response times'],
    prerequisites: ['CPU usage > 80%', 'Request queue depth > 100'],
    status: 'available',
    successRate: 92
  },
  {
    id: 'clear-cache',
    name: 'Clear Redis Cache',
    description: 'Flush Redis cache to resolve stale data issues',
    category: 'Cache Management',
    severity: 'medium',
    automated: true,
    estimatedTime: 5,
    confidence: 90,
    requiresApproval: true,
    impact: ['Temporary performance degradation', 'Cache rebuild required'],
    prerequisites: ['Cache hit rate < 50%', 'Stale data detected'],
    status: 'available',
    successRate: 100
  },
  {
    id: 'reset-db-connections',
    name: 'Reset Database Connection Pool',
    description: 'Close and re-establish all database connections',
    category: 'Database',
    severity: 'high',
    automated: true,
    estimatedTime: 45,
    confidence: 85,
    requiresApproval: true,
    impact: ['Brief database unavailability', 'Active queries will fail'],
    prerequisites: ['Connection pool exhausted', 'Dead connections detected'],
    status: 'available',
    successRate: 94
  },
  {
    id: 'rotate-credentials',
    name: 'Rotate API Credentials',
    description: 'Automatically rotate compromised or expired API credentials',
    category: 'Security',
    severity: 'critical',
    automated: false,
    estimatedTime: 300,
    confidence: 75,
    requiresApproval: true,
    impact: ['All clients must update credentials', 'Temporary authentication failures'],
    prerequisites: ['Security alert triggered', 'Admin approval'],
    status: 'available',
    successRate: 100
  }
]

export function RemediationActionPanel({
  actions = generateMockActions(),
  onExecute,
  className
}: RemediationActionPanelProps) {
  const [selectedAction, setSelectedAction] = useState<RemediationAction | null>(null)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [executingAction, setExecutingAction] = useState<string | null>(null)
  const [executionProgress, setExecutionProgress] = useState(0)

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'text-red-600 bg-red-50 border-red-200'
      case 'high':
        return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'medium':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      case 'low':
        return 'text-blue-600 bg-blue-50 border-blue-200'
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />
      case 'failed':
        return <XCircle className="w-4 h-4 text-red-500" />
      default:
        return <Activity className="w-4 h-4 text-gray-400" />
    }
  }

  const handleExecute = (action: RemediationAction) => {
    if (action.requiresApproval) {
      setSelectedAction(action)
      setShowConfirmDialog(true)
    } else {
      executeAction(action)
    }
  }

  const executeAction = (action: RemediationAction) => {
    setExecutingAction(action.id)
    setExecutionProgress(0)
    
    // Simulate action execution
    const progressInterval = setInterval(() => {
      setExecutionProgress(prev => {
        if (prev >= 100) {
          clearInterval(progressInterval)
          setExecutingAction(null)
          return 100
        }
        return prev + (100 / (action.estimatedTime / 0.1))
      })
    }, 100)

    onExecute?.(action.id)
    setShowConfirmDialog(false)
  }

  // Group actions by category
  const actionsByCategory = actions.reduce((groups, action) => {
    const category = action.category
    if (!groups[category]) groups[category] = []
    groups[category].push(action)
    return groups
  }, {} as Record<string, RemediationAction[]>)

  return (
    <>
      <div className={cn("space-y-4", className)}>
        {Object.entries(actionsByCategory).map(([category, categoryActions]) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="text-lg">{category}</CardTitle>
              <CardDescription>
                {categoryActions.length} remediation {categoryActions.length === 1 ? 'action' : 'actions'} available
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {categoryActions.map((action) => (
                <div
                  key={action.id}
                  className={cn(
                    "p-4 border rounded-lg space-y-3",
                    executingAction === action.id && "bg-blue-50 border-blue-200"
                  )}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{action.name}</h4>
                        {action.automated && (
                          <Badge variant="secondary" className="text-xs">
                            <Zap className="w-3 h-3 mr-1" />
                            Automated
                          </Badge>
                        )}
                        <Badge className={cn("text-xs", getSeverityColor(action.severity))}>
                          {action.severity.toUpperCase()}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{action.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(action.status)}
                      <Button
                        size="sm"
                        variant={action.requiresApproval ? "default" : "outline"}
                        onClick={() => handleExecute(action)}
                        disabled={executingAction !== null || action.status !== 'available'}
                      >
                        {executingAction === action.id ? (
                          <>
                            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
                            Running...
                          </>
                        ) : (
                          <>
                            <PlayCircle className="w-3 h-3 mr-1" />
                            Execute
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {executingAction === action.id && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Progress</span>
                        <span className="font-medium">{Math.round(executionProgress)}%</span>
                      </div>
                      <Progress value={executionProgress} className="h-2" />
                      <p className="text-xs text-muted-foreground">
                        Estimated time remaining: {Math.max(0, Math.round(action.estimatedTime * (1 - executionProgress / 100)))}s
                      </p>
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-muted-foreground text-xs">Confidence</div>
                      <div className="flex items-center gap-1">
                        <Shield className="w-3 h-3" />
                        <span className="font-medium">{action.confidence}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-muted-foreground text-xs">Est. Time</div>
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        <span className="font-medium">{action.estimatedTime}s</span>
                      </div>
                    </div>
                    {action.successRate !== undefined && (
                      <div>
                        <div className="text-muted-foreground text-xs">Success Rate</div>
                        <div className="flex items-center gap-1">
                          <CheckCircle className="w-3 h-3" />
                          <span className="font-medium">{action.successRate}%</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {action.lastRun && (
                    <div className="text-xs text-muted-foreground">
                      Last executed: {new Date(action.lastRun).toLocaleString()}
                    </div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Confirm Remediation Action</DialogTitle>
            <DialogDescription>
              This action requires your approval before execution.
            </DialogDescription>
          </DialogHeader>
          
          {selectedAction && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-1">{selectedAction.name}</h4>
                <p className="text-sm text-muted-foreground">{selectedAction.description}</p>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Impact Assessment</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc list-inside space-y-1 mt-2">
                    {selectedAction.impact.map((impact, i) => (
                      <li key={i} className="text-sm">{impact}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>

              {selectedAction.prerequisites.length > 0 && (
                <div>
                  <h5 className="text-sm font-medium mb-2">Prerequisites</h5>
                  <ul className="list-disc list-inside space-y-1">
                    {selectedAction.prerequisites.map((prereq, i) => (
                      <li key={i} className="text-sm text-muted-foreground">{prereq}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-muted-foreground">Estimated time: </span>
                  <span className="font-medium">{selectedAction.estimatedTime}s</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Confidence: </span>
                  <span className="font-medium">{selectedAction.confidence}%</span>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => selectedAction && executeAction(selectedAction)}>
              Execute Action
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}