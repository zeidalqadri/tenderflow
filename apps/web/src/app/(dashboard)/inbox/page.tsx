'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { 
  MoreHorizontal,
  Filter,
  Download,
  RefreshCw,
  Eye,
  CheckCircle,
  X,
  Calendar,
  DollarSign,
  Building,
  Clock
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useTenders } from '@/hooks/use-api'
import { useUIStore } from '@/stores/ui-store'
import { useTenderStore } from '@/stores/tender-store'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { formatDate, formatCurrency, calculateDaysUntil, getStatusColor, cn } from '@/lib/utils'
import type { Tender, TenderStatus } from '@tenderflow/shared'

interface TenderRowProps {
  tender: Tender
  isSelected: boolean
  onSelect: (tender: Tender) => void
  onOpen: (tender: Tender) => void
  onQualify: (tender: Tender) => void
  onMute: (tender: Tender) => void
  showNotes: boolean
}

function TenderRow({ 
  tender, 
  isSelected, 
  onSelect, 
  onOpen, 
  onQualify, 
  onMute, 
  showNotes 
}: TenderRowProps) {
  const daysUntil = calculateDaysUntil(tender.deadline)
  const statusColor = getStatusColor(tender.status)
  const isUrgent = daysUntil <= 3
  const isOverdue = daysUntil < 0

  return (
    <div 
      className={cn(
        'data-table-row cursor-pointer p-4 border rounded-lg',
        isSelected && 'ring-2 ring-primary'
      )}
      onClick={() => onSelect(tender)}
    >
      <div className="grid grid-cols-12 gap-4 items-center">
        {/* ID & Status */}
        <div className="col-span-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-muted-foreground">
              #{tender.id.slice(-6)}
            </span>
            <Badge className={statusColor}>
              {tender.status.replace('_', ' ')}
            </Badge>
          </div>
        </div>

        {/* Title */}
        <div className="col-span-4">
          <h3 className="font-medium text-sm line-clamp-2 mb-1">
            {tender.title}
          </h3>
          {tender.description && (
            <p className="text-xs text-muted-foreground line-clamp-1">
              {tender.description}
            </p>
          )}
        </div>

        {/* Buyer */}
        <div className="col-span-2">
          <div className="flex items-center gap-1">
            <Building className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm truncate">
              {/* Mock buyer data - would come from API */}
              Ministry of Tech
            </span>
          </div>
        </div>

        {/* Deadline */}
        <div className="col-span-2">
          <div className="flex items-center gap-1">
            <Calendar className="h-3 w-3 text-muted-foreground" />
            <div className="flex flex-col">
              <span className={cn(
                'text-sm',
                isOverdue && 'text-red-600',
                isUrgent && !isOverdue && 'text-orange-600'
              )}>
                {formatDate(tender.deadline)}
              </span>
              <span className={cn(
                'text-xs',
                isOverdue && 'text-red-500',
                isUrgent && !isOverdue && 'text-orange-500',
                !isUrgent && !isOverdue && 'text-muted-foreground'
              )}>
                {isOverdue ? `${Math.abs(daysUntil)}d overdue` : `D-${daysUntil}`}
              </span>
            </div>
          </div>
        </div>

        {/* Budget */}
        <div className="col-span-1">
          <div className="flex items-center gap-1">
            <DollarSign className="h-3 w-3 text-muted-foreground" />
            <span className="text-sm truncate">
              {tender.budget ? formatCurrency(tender.budget) : 'TBD'}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="col-span-1 flex justify-end">
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onOpen(tender)
              }}
            >
              <Eye className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onQualify(tender)
              }}
            >
              <CheckCircle className="h-3 w-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                onMute(tender)
              }}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </div>

      {/* Notes section */}
      {showNotes && (
        <div className="mt-3 pt-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Status tracking: ID normalization, buyer validation, deadline parsing with D-day calculation, 
            budget formatting, and three-action workflow (Open/Qualify/Mute). Real implementation would 
            include deduplication hints and "mark all as seen" functionality.
          </p>
        </div>
      )}
    </div>
  )
}

export default function InboxPage() {
  const router = useRouter()
  const { filters, showNotes, addNotification } = useUIStore()
  const { selectedTender, selectTender } = useTenderStore()
  const [selectedTenders, setSelectedTenders] = useState<Set<string>>(new Set())

  // Fetch tenders with current filters
  const { 
    data: tendersResponse, 
    isLoading, 
    error, 
    refetch,
    isFetching
  } = useTenders({
    page: 1,
    limit: 20,
    search: filters.search,
    status: filters.status.join(',') || undefined,
    assignee: filters.assignee.join(',') || undefined,
  })

  const tenders = tendersResponse?.data || []

  // Calculate stats
  const stats = useMemo(() => {
    const total = tenders.length
    const urgent = tenders.filter(t => calculateDaysUntil(t.deadline) <= 3).length
    const newToday = tenders.filter(t => {
      const today = new Date()
      const created = new Date(t.createdAt)
      return created.toDateString() === today.toDateString()
    }).length
    const needsValidation = tenders.filter(t => t.status === 'DRAFT').length

    return { total, urgent, newToday, needsValidation }
  }, [tenders])

  const handleSelect = (tender: Tender) => {
    selectTender(tender)
    setSelectedTenders(prev => {
      const next = new Set(prev)
      if (next.has(tender.id)) {
        next.delete(tender.id)
      } else {
        next.add(tender.id)
      }
      return next
    })
  }

  const handleOpen = (tender: Tender) => {
    selectTender(tender)
    router.push(`/validate?tender=${tender.id}`)
  }

  const handleQualify = (tender: Tender) => {
    selectTender(tender)
    router.push(`/categorize?tender=${tender.id}`)
  }

  const handleMute = (tender: Tender) => {
    addNotification({
      type: 'info',
      title: 'Tender muted',
      message: `"${tender.title}" has been muted and hidden from the inbox`,
    })
    // In real implementation, this would update the tender status
  }

  const handleRefresh = () => {
    refetch()
    addNotification({
      type: 'success',
      title: 'Inbox refreshed',
      message: 'Latest tenders have been loaded',
    })
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header with Stats */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Inbox</h1>
            <p className="text-muted-foreground">
              Latest tender opportunities and updates
            </p>
          </div>
          
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>Last scrape: Today at 14:05</span>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Total Tenders
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.total}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Urgent (≤3 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-600">{stats.urgent}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                New Today
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{stats.newToday}</div>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Needs Validation
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600">{stats.needsValidation}</div>
            </CardContent>
          </Card>
        </div>

        {/* Filters and Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm">
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <Button variant="outline" size="sm">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
            {selectedTenders.size > 0 && (
              <Button variant="outline" size="sm">
                Bulk Actions ({selectedTenders.size})
              </Button>
            )}
          </div>

          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefresh}
            disabled={isFetching}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', isFetching && 'animate-spin')} />
            Refresh
          </Button>
        </div>

        {/* Tender List */}
        <Card>
          <CardContent className="p-0">
            {/* Table Header */}
            <div className="grid grid-cols-12 gap-4 p-4 border-b bg-muted/50 text-sm font-medium text-muted-foreground">
              <div className="col-span-2">ID & Status</div>
              <div className="col-span-4">Title & Description</div>
              <div className="col-span-2">Buyer</div>
              <div className="col-span-2">Deadline</div>
              <div className="col-span-1">Budget</div>
              <div className="col-span-1 text-right">Actions</div>
            </div>

            {/* Tender Rows */}
            <div className="divide-y">
              {isLoading ? (
                <div className="p-8 text-center">
                  <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Loading tenders...</p>
                </div>
              ) : error ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-red-600 mb-2">Failed to load tenders</p>
                  <Button variant="outline" size="sm" onClick={handleRefresh}>
                    Try Again
                  </Button>
                </div>
              ) : tenders.length === 0 ? (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No tenders match your current filters
                  </p>
                </div>
              ) : (
                tenders.map((tender) => (
                  <TenderRow
                    key={tender.id}
                    tender={tender}
                    isSelected={selectedTenders.has(tender.id)}
                    onSelect={handleSelect}
                    onOpen={handleOpen}
                    onQualify={handleQualify}
                    onMute={handleMute}
                    showNotes={showNotes}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Pagination */}
        {tendersResponse?.pagination && tendersResponse.pagination.totalPages > 1 && (
          <div className="flex items-center justify-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              disabled={!tendersResponse.pagination.hasPrev}
            >
              Previous
            </Button>
            
            <span className="text-sm text-muted-foreground">
              Page {tendersResponse.pagination.page} of {tendersResponse.pagination.totalPages}
            </span>
            
            <Button
              variant="outline"
              size="sm"
              disabled={!tendersResponse.pagination.hasNext}
            >
              Next
            </Button>
          </div>
        )}
      </div>
    </DashboardLayout>
  )
}