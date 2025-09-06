'use client'

import React from 'react'
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
  Filter, 
  Search, 
  RefreshCw, 
  Settings, 
  Download,
  MoreHorizontal
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface FilterOption {
  value: string
  label: string
}

interface TenderFiltersProps {
  searchValue?: string
  onSearchChange?: (value: string) => void
  
  sourceFilter?: string
  sourceOptions?: FilterOption[]
  onSourceChange?: (value: string) => void
  
  categoryFilter?: string
  categoryOptions?: FilterOption[]
  onCategoryChange?: (value: string) => void
  
  priorityFilter?: string
  priorityOptions?: FilterOption[]
  onPriorityChange?: (value: string) => void
  
  statusFilter?: string
  statusOptions?: FilterOption[]
  onStatusChange?: (value: string) => void
  
  onSyncSources?: () => void
  onConfigureScraping?: () => void
  onExport?: () => void
  onRefresh?: () => void
  
  isLoading?: boolean
  selectedCount?: number
  onBulkAction?: (action: string) => void
  
  className?: string
}

const defaultSourceOptions: FilterOption[] = [
  { value: 'all', label: 'All Sources' },
  { value: 'government', label: 'Government Portals' },
  { value: 'private', label: 'Private Companies' },
  { value: 'international', label: 'International' },
  { value: 'kazakhstan', label: 'Kazakhstan (zakup.sk.kz)' },
]

const defaultCategoryOptions: FilterOption[] = [
  { value: 'all', label: 'All Categories' },
  { value: 'it-services', label: 'IT Services' },
  { value: 'construction', label: 'Construction' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'supply-chain', label: 'Supply Chain' },
  { value: 'cloud-computing', label: 'Cloud Computing' },
]

const defaultPriorityOptions: FilterOption[] = [
  { value: 'all', label: 'All Priorities' },
  { value: 'high', label: 'High Priority' },
  { value: 'medium', label: 'Medium Priority' },
  { value: 'low', label: 'Low Priority' },
]

const defaultStatusOptions: FilterOption[] = [
  { value: 'all', label: 'All Statuses' },
  { value: 'scraped', label: 'Scraped' },
  { value: 'validated', label: 'Validated' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'submitted', label: 'Submitted' },
]

export function TenderFilters({
  searchValue = '',
  onSearchChange,
  
  sourceFilter = 'all',
  sourceOptions = defaultSourceOptions,
  onSourceChange,
  
  categoryFilter = 'all',
  categoryOptions = defaultCategoryOptions,
  onCategoryChange,
  
  priorityFilter = 'all',
  priorityOptions = defaultPriorityOptions,
  onPriorityChange,
  
  statusFilter = 'all',
  statusOptions = defaultStatusOptions,
  onStatusChange,
  
  onSyncSources,
  onConfigureScraping,
  onExport,
  onRefresh,
  
  isLoading = false,
  selectedCount = 0,
  onBulkAction,
  
  className
}: TenderFiltersProps) {
  
  const handleBulkAction = (action: string) => {
    if (onBulkAction) {
      onBulkAction(action)
    }
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Primary Filters Row */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        {/* Filter Controls */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Search Input */}
          <div className="relative min-w-[300px]">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
            <Input
              placeholder="Search tenders..."
              value={searchValue}
              onChange={(e) => onSearchChange?.(e.target.value)}
              className="pl-10"
            />
          </div>
          
          {/* Source Filter */}
          <Select value={sourceFilter} onValueChange={onSourceChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select source" />
            </SelectTrigger>
            <SelectContent>
              {sourceOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Category Filter */}
          <Select value={categoryFilter} onValueChange={onCategoryChange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select category" />
            </SelectTrigger>
            <SelectContent>
              {categoryOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {/* Priority Filter */}
          <Select value={priorityFilter} onValueChange={onPriorityChange}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Select priority" />
            </SelectTrigger>
            <SelectContent>
              {priorityOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status Filter */}
          <Select value={statusFilter} onValueChange={onStatusChange}>
            <SelectTrigger className="w-[140px]">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              {statusOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onExport && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          )}
          
          {onSyncSources && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onSyncSources}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
              Sync Sources
            </Button>
          )}
          
          {onConfigureScraping && (
            <Button 
              variant="default" 
              size="sm" 
              onClick={onConfigureScraping}
            >
              <Settings className="w-4 h-4 mr-2" />
              Configure Scraping
            </Button>
          )}
          
          {onRefresh && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={onRefresh}
              disabled={isLoading}
            >
              <RefreshCw className={cn('w-4 h-4', isLoading && 'animate-spin')} />
            </Button>
          )}
        </div>
      </div>

      {/* Bulk Actions Row - Only show when items are selected */}
      {selectedCount > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-blue-800 font-medium">
              {selectedCount} tender{selectedCount === 1 ? '' : 's'} selected
            </span>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkAction('validate')}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                📋 Bulk Validate
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkAction('tag')}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                🏷️ Tag Selected
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkAction('move')}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                📁 Move to Queue
              </Button>
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => handleBulkAction('archive')}
                className="text-blue-700 border-blue-300 hover:bg-blue-100"
              >
                🗑️ Archive
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}