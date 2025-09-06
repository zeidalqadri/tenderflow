'use client'

import React, { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { TenderCard } from '@/components/ui/tender-card'
import { TenderFilters } from '@/components/ui/tender-filters'
import { 
  NewTodayCard,
  PendingReviewCard, 
  HighPriorityCard,
  TotalValueCard
} from '@/components/ui/stats-card'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { ScraperLogBar } from '@/components/ui/scraper-log-bar'
import { QueueMonitor } from '@/components/ui/queue-monitor'
import { ProcessingActions } from '@/components/ui/processing-actions'
import { ScrapingModal } from '@/components/ui/scraping-modal'
import { useTenders } from '@/hooks/use-api'
import { useTriggerScraping } from '@/hooks/use-queues'
import { useUIStore } from '@/stores/ui-store'
import { useTenderStore } from '@/stores/tender-store'
import { useAuthStore } from '@/stores/auth-store'
import { useToast } from '@/hooks/use-toast'
import { 
  Clock,
  RefreshCw,
  Wifi,
  AlertCircle,
  CheckCircle,
  Loader2,
  ChevronDown,
  Settings2
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ClientOnlyTimestamp } from '@/components/ui/client-only-timestamp'
import { useRealtimeTenders } from '@/hooks/use-realtime-tenders'
import { cn } from '@/lib/utils'

export default function SmartInboxPage() {
  const router = useRouter()
  const { toast } = useToast()
  const { filters, showNotes } = useUIStore()
  const { selectedTender, selectTender } = useTenderStore()
  const authStore = useAuthStore()
  const isAuthenticated = authStore?.isAuthenticated || false
  
  // Real-time tender updates
  const { 
    isConnected, 
    statistics, 
    realtimeUpdates,
    scraperStatus 
  } = useRealtimeTenders({ autoConnect: true })
  
  // Local state for the Smart Inbox
  const [selectedTenders, setSelectedTenders] = useState<Set<string>>(new Set())
  const [searchValue, setSearchValue] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [categoryFilter, setCategoryFilter] = useState('all') 
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [lastSyncTime, setLastSyncTime] = useState(new Date())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [showScrapingModal, setShowScrapingModal] = useState(false)
  const [showQueueMonitor, setShowQueueMonitor] = useState(true)

  // TEMPORARY: Authentication bypass - commented out for testing
  // useEffect(() => {
  //   if (!isAuthenticated) {
  //     router.push('/login')
  //   }
  // }, [isAuthenticated, router])

  // Use real API data when available, fallback to mock data
  const { 
    data: tendersResponse, 
    isLoading, 
    error, 
    refetch,
    isFetching
  } = useTenders({
    page: 1,
    limit: 20,
    search: searchValue || undefined,
    status: statusFilter !== 'all' ? statusFilter : undefined,
  })
  
  // Listen for scraper completion events
  useEffect(() => {
    if (scraperStatus?.type === 'completed' && activeJobId) {
      // Refresh the tender list when scraping completes
      refetch()
      setLastSyncTime(new Date())
      setIsRefreshing(false)
      // Keep the log bar active for a bit longer to show completion logs
      setTimeout(() => setActiveJobId(null), 5000)
    } else if (scraperStatus?.type === 'error' && activeJobId) {
      setIsRefreshing(false)
      setTimeout(() => setActiveJobId(null), 5000)
    }
  }, [scraperStatus, activeJobId, refetch])

  // Always use real API data - no mock fallback
  const tenders = tendersResponse?.data || []

  // Filter tenders based on current filters
  const filteredTenders = useMemo(() => {
    return tenders.filter(tender => {
      // Search filter
      if (searchValue && !tender.title.toLowerCase().includes(searchValue.toLowerCase()) &&
          !tender.description?.toLowerCase().includes(searchValue.toLowerCase())) {
        return false
      }
      
      // Category filter - simplified for demo
      if (categoryFilter !== 'all') {
        const hasCategory = tender.tags?.some(tag => 
          tag.toLowerCase().includes(categoryFilter.replace('-', ' '))
        )
        if (!hasCategory) return false
      }
      
      // Priority filter
      if (priorityFilter !== 'all' && tender.priority !== priorityFilter) {
        return false
      }
      
      // Status filter
      if (statusFilter !== 'all' && tender.status !== statusFilter) {
        return false
      }
      
      return true
    })
  }, [tenders, searchValue, categoryFilter, priorityFilter, statusFilter])

  // Use real-time statistics if available, otherwise calculate from filtered tenders
  const stats = useMemo(() => {
    if (statistics) {
      return {
        newToday: statistics.newToday,
        pendingReview: statistics.pendingReview,
        highPriority: statistics.highPriority,
        totalValue: statistics.totalValue
      }
    }
    
    // Fallback calculation if real-time stats not available
    const today = new Date().toDateString()
    const newToday = filteredTenders.filter(t => 
      new Date(t.publishedDate).toDateString() === today
    ).length
    
    const pendingReview = filteredTenders.filter(t => 
      t.status === 'SCRAPED'
    ).length
    
    const highPriority = filteredTenders.filter(t => 
      t.priority === 'high' || t.priority === 'critical'
    ).length
    
    const totalValue = filteredTenders.reduce((sum, t) => sum + (t.value || 0), 0)
    
    return { newToday, pendingReview, highPriority, totalValue }
  }, [filteredTenders, statistics])

  // Handle tender selection
  const handleTenderSelect = (tender: any) => {
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

  // Handle navigation to other pages
  const handleViewTender = (tender: any) => {
    selectTender(tender)
    router.push(`/validate?tender=${tender.id}`)
  }

  const handleValidateTender = (tender: any) => {
    selectTender(tender)
    router.push(`/validate?tender=${tender.id}`)
  }

  const handleQualifyTender = (tender: any) => {
    selectTender(tender)
    router.push(`/categorize?tender=${tender.id}`)
  }

  // Handle refresh
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try {
      await refetch()
      setLastSyncTime(new Date())
      toast({
        title: 'Inbox refreshed',
        description: 'Latest tenders have been loaded',
      })
    } catch (err) {
      toast({
        title: 'Refresh failed',
        description: 'Unable to refresh tender data. Please try again.',
        variant: 'destructive',
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  // Quick sync with default settings
  const handleQuickSync = async () => {
    await handleSyncSources(5) // Default 5 pages
  }

  // Handle sync sources - trigger real scraping
  const handleSyncSources = async (pages: number = 5) => {
    // In development mode with auth disabled, use a mock token
    const isDevMode = process.env.NEXT_PUBLIC_DISABLE_AUTH === 'true'
    let token = localStorage.getItem('token')
    
    // If in dev mode and no token, create a mock one
    if (isDevMode && !token) {
      token = 'dev-mock-token'
      localStorage.setItem('token', token)
    }
    
    // Only require authentication in production
    if (!isDevMode && (!token || !isAuthenticated)) {
      toast({
        title: 'Authentication required',
        description: 'Please login to use the scraper',
        variant: 'destructive',
      })
      router.push('/login')
      return
    }

    setIsRefreshing(true)
    try {
      // Call the scraper API to start a scraping job
      const response = await fetch('http://localhost:3457/api/v1/scraper/run', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          maxPages: pages,
          minValue: 100000, // Min value in KZT
          headless: true,
          workers: 2,
        }),
      })

      if (!response.ok) {
        throw new Error('Failed to start scraping')
      }

      const { jobId, status, message } = await response.json()
      
      // Set the active job ID so the ScraperLogBar can connect
      setActiveJobId(jobId)
      
      toast({
        title: 'Scraping started',
        description: `Job ID: ${jobId} - ${message}`,
      })

      // The ScraperLogBar will handle Socket.IO connections and real-time updates
      // We'll rely on the useRealtimeTenders hook for real-time updates

    } catch (error) {
      toast({
        title: 'Sync failed',
        description: error instanceof Error ? error.message : 'Failed to start scraping',
        variant: 'destructive',
      })
      setIsRefreshing(false)
    }
  }

  // Clear selection
  const handleClearSelection = () => {
    setSelectedTenders(new Set())
  }

  // Handle bulk actions (legacy - kept for compatibility)
  const handleBulkAction = (action: string) => {
    const count = selectedTenders.size
    let message = ''
    
    switch (action) {
      case 'validate':
        message = `${count} tender${count === 1 ? '' : 's'} moved to validation queue`
        break
      case 'tag':
        message = `Tags applied to ${count} tender${count === 1 ? '' : 's'}`
        break
      case 'move':
        message = `${count} tender${count === 1 ? '' : 's'} moved to processing queue`
        break
      case 'archive':
        message = `${count} tender${count === 1 ? '' : 's'} archived`
        break
    }
    
    toast({
      title: 'Bulk action completed',
      description: message,
    })
    
    setSelectedTenders(new Set())
  }

  return (
    <DashboardLayout>
      <div className="space-y-6 p-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Smart Inbox</h1>
            <p className="text-gray-600 mt-1">Automated tender discovery and intelligent organization</p>
          </div>
          
          <div className="flex items-center gap-3 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className={cn(
                "w-2 h-2 rounded-full",
                isConnected ? "bg-green-500 animate-pulse" : "bg-red-500"
              )} />
              <span>{isConnected ? 'Live Monitoring' : 'Disconnected'}</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>Last scrape: </span>
              <ClientOnlyTimestamp date={lastSyncTime} format="time" />
            </div>
            {scraperStatus && scraperStatus.type === 'progress' && (
              <>
                <span>•</span>
                <div className="flex items-center gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Scraping in progress...</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <NewTodayCard 
            value={stats.newToday}
            trend={{ value: 12, label: 'from yesterday', isPositive: true }}
          />
          <PendingReviewCard 
            value={stats.pendingReview}
            trend={{ value: 8, label: 'from yesterday', isPositive: true }}
          />
          <HighPriorityCard 
            value={stats.highPriority}
            trend={{ value: 5, label: 'from yesterday', isPositive: false }}
          />
          <TotalValueCard 
            value={stats.totalValue}
            currency="CAD"
            trend={{ value: 15, label: 'from last week', isPositive: true }}
          />
        </div>

        {/* Queue Monitor */}
        {showQueueMonitor && (
          <QueueMonitor 
            className="mt-6" 
            defaultExpanded={false}
          />
        )}

        {/* Processing Actions for Selected Tenders */}
        {selectedTenders.size > 0 && (
          <ProcessingActions
            selectedTenders={selectedTenders}
            onClearSelection={handleClearSelection}
            className="mt-4"
          />
        )}

        {/* Filters and Search */}
        <TenderFilters
          searchValue={searchValue}
          onSearchChange={setSearchValue}
          
          sourceFilter={sourceFilter}
          onSourceChange={setSourceFilter}
          
          categoryFilter={categoryFilter}
          onCategoryChange={setCategoryFilter}
          
          priorityFilter={priorityFilter}
          onPriorityChange={setPriorityFilter}
          
          statusFilter={statusFilter}
          onStatusChange={setStatusFilter}
          
          onSyncSources={handleQuickSync}
          onConfigureScraping={() => setShowScrapingModal(true)}
          onExport={() => toast({ title: 'Export started', description: 'Your tender data is being prepared for download' })}
          onRefresh={handleRefresh}
          
          isLoading={isRefreshing || isFetching}
          selectedCount={selectedTenders.size}
          onBulkAction={handleBulkAction}
        />

        {/* Tender List */}
        <Card className="border-0 shadow-sm">
          <CardContent className="p-0">
            {isLoading && !tenders.length ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Loading tenders...</h3>
                  <p className="text-gray-600">Fetching the latest tender opportunities</p>
                </div>
              </div>
            ) : error ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <AlertCircle className="w-8 h-8 mx-auto mb-4 text-red-600" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">Failed to load tenders</h3>
                  <p className="text-gray-600 mb-4">Unable to fetch tender data. Please try again.</p>
                  <Button onClick={handleRefresh} variant="outline">
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Try Again
                  </Button>
                </div>
              </div>
            ) : filteredTenders.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-center">
                  <CheckCircle className="w-8 h-8 mx-auto mb-4 text-green-600" />
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">All caught up!</h3>
                  <p className="text-gray-600">No tenders match your current filters</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {filteredTenders.map((tender) => (
                  <div key={tender.id} className="p-6">
                    <TenderCard
                      tender={tender}
                      isSelected={selectedTenders.has(tender.id)}
                      onSelect={handleTenderSelect}
                      onViewDetails={handleViewTender}
                      onValidate={handleValidateTender}
                      onQualify={handleQualifyTender}
                    />
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Loading Indicator for Background Refresh */}
        {(isFetching || isRefreshing) && tenders.length > 0 && (
          <div className="fixed bottom-4 right-4">
            <div className="bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg flex items-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span className="text-sm">Syncing...</span>
            </div>
          </div>
        )}

        {/* Development Notes */}
        {showNotes && (
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <h4 className="font-semibold text-yellow-800 mb-2">🚧 Development Notes</h4>
              <div className="text-sm text-yellow-700 space-y-1">
                <p>• Smart Inbox now matches wireframe design exactly with stats cards, filters, and tender cards</p>
                <p>• Mock data includes the exact tenders from the wireframe (Cloud Infrastructure, Digital Transformation, etc.)</p>
                <p>• Real-time features: Live monitoring indicator, auto-refresh, WebSocket integration ready</p>
                <p>• Kazakhstan scraper integration: Ready for Russian/Kazakh text display and currency conversion</p>
                <p>• Bulk actions: Select multiple tenders for validation, tagging, moving, or archiving</p>
                <p>• Backend integration: API calls to http://localhost:3001/api/v1/tenders with pagination</p>
                <p>• Next: Implement validation interface (02-validation.html) and qualification system (03-qualification.html)</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Scraper Log Bar */}
        <ScraperLogBar 
          jobId={activeJobId || undefined}
          autoConnect={!!activeJobId}
        />

        {/* Modals */}
        <ScrapingModal
          open={showScrapingModal}
          onOpenChange={setShowScrapingModal}
          onSuccess={() => {
            setLastSyncTime(new Date())
            refetch()
          }}
        />
      </div>
    </DashboardLayout>
  )
}