'use client'

import React, { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import {
  AlertTriangle,
  XCircle,
  AlertCircle,
  Info,
  TrendingUp,
  TrendingDown,
  Minus,
  Search,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Clock,
  Hash,
  Zap,
  FileText,
  CheckCircle
} from 'lucide-react'

interface ErrorPattern {
  id: string
  category: string
  component: string
  message: string
  severity: 'low' | 'medium' | 'high' | 'critical'
  frequency: number
  trend: 'increasing' | 'stable' | 'decreasing'
  firstSeen: Date
  lastSeen: Date
  affectedUsers: number
  status: 'active' | 'investigating' | 'resolved'
  rootCause?: string
  suggestedFix?: string
  automationAvailable: boolean
  errorCode?: string
  stackTrace?: string
}

interface ErrorPatternListProps {
  errors?: ErrorPattern[]
  onFixError?: (errorId: string) => void
  onInvestigate?: (errorId: string) => void
  className?: string
}

// Generate mock error data
const generateMockErrors = (): ErrorPattern[] => {
  const categories = ['API', 'Database', 'Scraper', 'Authentication', 'Network', 'Validation']
  const components = ['tenderflow-api', 'alloydb-primary', 'scraper-service', 'auth-service', 'ingestion-pipeline']
  
  return Array.from({ length: 15 }, (_, i) => ({
    id: `error-${i + 1}`,
    category: categories[Math.floor(Math.random() * categories.length)],
    component: components[Math.floor(Math.random() * components.length)],
    message: [
      'Connection timeout to database',
      'Invalid JWT token format',
      'Rate limit exceeded for API endpoint',
      'Failed to parse tender data',
      'Memory allocation error',
      'Network connection refused',
      'Validation failed for required fields',
      'Concurrent request limit reached',
      'Cache synchronization error',
      'WebSocket connection dropped'
    ][i % 10],
    severity: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
    frequency: Math.floor(Math.random() * 100) + 1,
    trend: ['increasing', 'stable', 'decreasing'][Math.floor(Math.random() * 3)] as any,
    firstSeen: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
    lastSeen: new Date(Date.now() - Math.random() * 60 * 60 * 1000),
    affectedUsers: Math.floor(Math.random() * 50),
    status: ['active', 'investigating', 'resolved'][Math.floor(Math.random() * 3)] as any,
    rootCause: Math.random() > 0.5 ? 'Database connection pool exhausted' : undefined,
    suggestedFix: Math.random() > 0.3 ? 'Increase connection pool size' : undefined,
    automationAvailable: Math.random() > 0.6,
    errorCode: `ERR_${Math.floor(Math.random() * 1000)}`,
  }))
}

export function ErrorPatternList({
  errors = generateMockErrors(),
  onFixError,
  onInvestigate,
  className
}: ErrorPatternListProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [severityFilter, setSeverityFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'frequency' | 'severity' | 'recent'>('frequency')
  const [expandedError, setExpandedError] = useState<string | null>(null)

  // Filter and sort errors
  const filteredErrors = useMemo(() => {
    let filtered = errors

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(error =>
        error.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
        error.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
        error.component.toLowerCase().includes(searchQuery.toLowerCase()) ||
        error.errorCode?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    }

    // Severity filter
    if (severityFilter !== 'all') {
      filtered = filtered.filter(error => error.severity === severityFilter)
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(error => error.status === statusFilter)
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'frequency':
          return b.frequency - a.frequency
        case 'severity':
          const severityOrder = { critical: 4, high: 3, medium: 2, low: 1 }
          return severityOrder[b.severity] - severityOrder[a.severity]
        case 'recent':
          return b.lastSeen.getTime() - a.lastSeen.getTime()
        default:
          return 0
      }
    })

    return filtered
  }, [errors, searchQuery, severityFilter, statusFilter, sortBy])

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <XCircle className="w-4 h-4 text-red-500" />
      case 'high':
        return <AlertTriangle className="w-4 h-4 text-orange-500" />
      case 'medium':
        return <AlertCircle className="w-4 h-4 text-yellow-500" />
      case 'low':
        return <Info className="w-4 h-4 text-blue-500" />
      default:
        return null
    }
  }

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-200'
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low':
        return 'bg-blue-100 text-blue-800 border-blue-200'
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getTrendIcon = (trend: string) => {
    switch (trend) {
      case 'increasing':
        return <TrendingUp className="w-3 h-3 text-red-500" />
      case 'decreasing':
        return <TrendingDown className="w-3 h-3 text-green-500" />
      default:
        return <Minus className="w-3 h-3 text-gray-500" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-red-100 text-red-800'
      case 'investigating':
        return 'bg-yellow-100 text-yellow-800'
      case 'resolved':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  // Calculate statistics
  const stats = useMemo(() => {
    return {
      total: errors.length,
      critical: errors.filter(e => e.severity === 'critical').length,
      active: errors.filter(e => e.status === 'active').length,
      automatable: errors.filter(e => e.automationAvailable).length,
    }
  }, [errors])

  return (
    <Card className={cn("", className)}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Error Patterns & Analysis</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {stats.total} Total
            </Badge>
            <Badge variant="destructive" className="text-xs">
              {stats.critical} Critical
            </Badge>
            <Badge className="bg-yellow-100 text-yellow-800 text-xs">
              {stats.active} Active
            </Badge>
            <Badge className="bg-blue-100 text-blue-800 text-xs">
              {stats.automatable} Automatable
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Filters */}
        <div className="flex flex-col md:flex-row gap-2">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search errors..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
              aria-label="Search errors"
            />
          </div>
          
          <Select value={severityFilter} onValueChange={setSeverityFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by severity">
              <Filter className="w-4 h-4 mr-2" />
              <SelectValue placeholder="Severity" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Severities</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[150px]" aria-label="Filter by status">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="investigating">Investigating</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>

          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[150px]" aria-label="Sort by">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="frequency">Frequency</SelectItem>
              <SelectItem value="severity">Severity</SelectItem>
              <SelectItem value="recent">Most Recent</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="icon" aria-label="Export errors">
            <Download className="w-4 h-4" />
          </Button>
        </div>

        {/* Error List */}
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]"></TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Component</TableHead>
                <TableHead className="text-center">Frequency</TableHead>
                <TableHead className="text-center">Trend</TableHead>
                <TableHead>Last Seen</TableHead>
                <TableHead className="text-center">Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredErrors.map((error) => (
                <React.Fragment key={error.id}>
                  <TableRow 
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => setExpandedError(expandedError === error.id ? null : error.id)}
                  >
                    <TableCell>
                      {getSeverityIcon(error.severity)}
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{error.message}</div>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            {error.category}
                          </Badge>
                          {error.errorCode && (
                            <span className="text-xs text-muted-foreground">
                              {error.errorCode}
                            </span>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {error.component}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <Hash className="w-3 h-3 text-muted-foreground" />
                        <span className="font-medium">{error.frequency}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        {getTrendIcon(error.trend)}
                        <span className="text-xs capitalize">{error.trend}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <Clock className="w-3 h-3" />
                        {new Date(error.lastSeen).toLocaleString()}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge className={cn("text-xs", getStatusColor(error.status))}>
                        {error.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {error.automationAvailable && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={(e) => {
                              e.stopPropagation()
                              onFixError?.(error.id)
                            }}
                            aria-label="Auto-fix error"
                          >
                            <Zap className="w-3 h-3 mr-1" />
                            Fix
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation()
                            onInvestigate?.(error.id)
                          }}
                          aria-label="Investigate error"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          Investigate
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={(e) => {
                            e.stopPropagation()
                            setExpandedError(expandedError === error.id ? null : error.id)
                          }}
                          aria-label={expandedError === error.id ? "Collapse" : "Expand"}
                        >
                          {expandedError === error.id ? 
                            <ChevronUp className="w-4 h-4" /> : 
                            <ChevronDown className="w-4 h-4" />
                          }
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  
                  {expandedError === error.id && (
                    <TableRow>
                      <TableCell colSpan={8} className="bg-muted/30">
                        <div className="p-4 space-y-3">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div>
                              <div className="text-sm text-muted-foreground">First Seen</div>
                              <div className="font-medium">
                                {new Date(error.firstSeen).toLocaleString()}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Affected Users</div>
                              <div className="font-medium">{error.affectedUsers}</div>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Severity</div>
                              <Badge className={cn("", getSeverityColor(error.severity))}>
                                {error.severity.toUpperCase()}
                              </Badge>
                            </div>
                            <div>
                              <div className="text-sm text-muted-foreground">Automation</div>
                              <div className="flex items-center gap-1">
                                {error.automationAvailable ? (
                                  <>
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                    <span className="text-sm">Available</span>
                                  </>
                                ) : (
                                  <>
                                    <XCircle className="w-4 h-4 text-gray-400" />
                                    <span className="text-sm">Not available</span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {error.rootCause && (
                            <div>
                              <div className="text-sm font-medium mb-1">Root Cause</div>
                              <div className="text-sm text-muted-foreground bg-background p-2 rounded">
                                {error.rootCause}
                              </div>
                            </div>
                          )}

                          {error.suggestedFix && (
                            <div>
                              <div className="text-sm font-medium mb-1">Suggested Fix</div>
                              <div className="text-sm text-muted-foreground bg-background p-2 rounded">
                                {error.suggestedFix}
                              </div>
                            </div>
                          )}

                          {error.stackTrace && (
                            <div>
                              <div className="text-sm font-medium mb-1">Stack Trace</div>
                              <pre className="text-xs text-muted-foreground bg-background p-2 rounded overflow-x-auto">
                                {error.stackTrace}
                              </pre>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
          
          {filteredErrors.length === 0 && (
            <div className="p-8 text-center text-muted-foreground">
              <AlertCircle className="w-12 h-12 mx-auto mb-4" />
              <p>No errors found matching your criteria</p>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}