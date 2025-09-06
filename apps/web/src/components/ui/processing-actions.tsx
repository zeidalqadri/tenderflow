'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { 
  useTriggerProcessing, 
  useBulkProcessTenders,
  useTriggerNotification 
} from '@/hooks/use-queues'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  CheckCircle,
  Tag,
  Brain,
  Bell,
  Send,
  MoreVertical,
  Loader2
} from 'lucide-react'

interface ProcessingActionsProps {
  selectedTenders: Set<string>
  onClearSelection?: () => void
  className?: string
}

export function ProcessingActions({ 
  selectedTenders, 
  onClearSelection,
  className 
}: ProcessingActionsProps) {
  const triggerProcessing = useTriggerProcessing()
  const bulkProcess = useBulkProcessTenders()
  const triggerNotification = useTriggerNotification()

  const selectedCount = selectedTenders.size
  const tenderIds = Array.from(selectedTenders)

  if (selectedCount === 0) return null

  const handleBulkAction = async (action: 'validate' | 'categorize' | 'analyze') => {
    await bulkProcess.mutateAsync({ tenderIds, action })
    onClearSelection?.()
  }

  const handleNotify = async () => {
    // Send notification for selected tenders
    await triggerNotification.mutateAsync({
      type: 'tender_update',
      data: {
        tenderIds,
        message: `${selectedCount} tenders require attention`,
        action: 'review',
      },
      priority: 'normal'
    })
  }

  const isProcessing = 
    triggerProcessing.isPending || 
    bulkProcess.isPending || 
    triggerNotification.isPending

  return (
    <div className={className}>
      <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
        <span className="text-sm font-medium text-blue-900">
          {selectedCount} tender{selectedCount > 1 ? 's' : ''} selected
        </span>
        
        <div className="flex items-center gap-2 ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('validate')}
            disabled={isProcessing}
            className="gap-1"
          >
            {isProcessing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <CheckCircle className="w-3 h-3" />
            )}
            Validate
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('categorize')}
            disabled={isProcessing}
            className="gap-1"
          >
            {isProcessing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Tag className="w-3 h-3" />
            )}
            Categorize
          </Button>

          <Button
            size="sm"
            variant="outline"
            onClick={() => handleBulkAction('analyze')}
            disabled={isProcessing}
            className="gap-1"
          >
            {isProcessing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Brain className="w-3 h-3" />
            )}
            Analyze
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="outline" disabled={isProcessing}>
                <MoreVertical className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>More Actions</DropdownMenuLabel>
              <DropdownMenuSeparator />
              
              <DropdownMenuItem onClick={handleNotify}>
                <Bell className="w-4 h-4 mr-2" />
                Send Notification
              </DropdownMenuItem>
              
              <DropdownMenuItem 
                onClick={() => {
                  // Queue all processing steps
                  handleBulkAction('validate').then(() =>
                    handleBulkAction('categorize').then(() =>
                      handleBulkAction('analyze')
                    )
                  )
                }}
              >
                <Send className="w-4 h-4 mr-2" />
                Full Processing Pipeline
              </DropdownMenuItem>
              
              <DropdownMenuSeparator />
              
              <DropdownMenuItem 
                onClick={onClearSelection}
                className="text-red-600"
              >
                Clear Selection
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  )
}