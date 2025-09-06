'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useTriggerScraping, ScrapingOptions } from '@/hooks/use-queues'
import { Loader2, Globe, Calendar, Hash, FolderOpen } from 'lucide-react'

interface ScrapingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess?: () => void
}

const sourcePortals = [
  { value: 'zakup.sk.kz', label: 'Kazakhstan Government (zakup.sk.kz)' },
  { value: 'goszakup.gov.kz', label: 'GosZakup (goszakup.gov.kz)' },
  { value: 'samruk.kz', label: 'Samruk-Kazyna' },
  { value: 'all', label: 'All Available Sources' },
]

const categories = [
  { value: 'construction', label: 'Construction' },
  { value: 'it-services', label: 'IT Services' },
  { value: 'consulting', label: 'Consulting' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'maintenance', label: 'Maintenance' },
  { value: 'research', label: 'Research' },
  { value: 'training', label: 'Training' },
]

export function ScrapingModal({ open, onOpenChange, onSuccess }: ScrapingModalProps) {
  const triggerScraping = useTriggerScraping()
  
  const [sourcePortal, setSourcePortal] = useState('zakup.sk.kz')
  const [maxPages, setMaxPages] = useState('10')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [forceRefresh, setForceRefresh] = useState(false)

  const handleSubmit = async () => {
    const options: ScrapingOptions = {
      sourcePortal,
      maxPages: parseInt(maxPages) || 10,
      ...(startDate && { startDate }),
      ...(endDate && { endDate }),
      ...(selectedCategories.length > 0 && { categories: selectedCategories }),
      forceRefresh,
    }

    await triggerScraping.mutateAsync(options)
    onSuccess?.()
    onOpenChange(false)
    
    // Reset form
    setMaxPages('10')
    setStartDate('')
    setEndDate('')
    setSelectedCategories([])
    setForceRefresh(false)
  }

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Advanced Scraping Options</DialogTitle>
          <DialogDescription>
            Configure scraping parameters to fetch specific tenders
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Source Portal */}
          <div className="space-y-2">
            <Label htmlFor="source" className="flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Source Portal
            </Label>
            <Select value={sourcePortal} onValueChange={setSourcePortal}>
              <SelectTrigger id="source">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sourcePortals.map(portal => (
                  <SelectItem key={portal.value} value={portal.value}>
                    {portal.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Max Pages */}
          <div className="space-y-2">
            <Label htmlFor="maxPages" className="flex items-center gap-2">
              <Hash className="w-4 h-4" />
              Maximum Pages to Scrape
            </Label>
            <Input
              id="maxPages"
              type="number"
              min="1"
              max="100"
              value={maxPages}
              onChange={(e) => setMaxPages(e.target.value)}
              placeholder="10"
            />
            <p className="text-xs text-gray-500">
              Each page typically contains 10-20 tenders
            </p>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Calendar className="w-4 h-4" />
              Date Range (Optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="startDate" className="text-xs">From</Label>
                <Input
                  id="startDate"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="endDate" className="text-xs">To</Label>
                <Input
                  id="endDate"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <FolderOpen className="w-4 h-4" />
              Categories (Optional)
            </Label>
            <div className="grid grid-cols-2 gap-2">
              {categories.map(category => (
                <div key={category.value} className="flex items-center space-x-2">
                  <Checkbox
                    id={category.value}
                    checked={selectedCategories.includes(category.value)}
                    onCheckedChange={() => toggleCategory(category.value)}
                  />
                  <Label
                    htmlFor={category.value}
                    className="text-sm font-normal cursor-pointer"
                  >
                    {category.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Force Refresh */}
          <div className="flex items-center space-x-2">
            <Checkbox
              id="forceRefresh"
              checked={forceRefresh}
              onCheckedChange={(checked) => setForceRefresh(checked as boolean)}
            />
            <Label
              htmlFor="forceRefresh"
              className="text-sm font-normal cursor-pointer"
            >
              Force refresh (ignore cache and re-scrape all tenders)
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={triggerScraping.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={triggerScraping.isPending}
          >
            {triggerScraping.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Starting...
              </>
            ) : (
              'Start Scraping'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}