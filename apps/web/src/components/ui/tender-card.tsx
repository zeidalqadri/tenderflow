'use client'

import React from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { 
  Building, 
  Calendar, 
  Clock, 
  DollarSign,
  ExternalLink,
  CheckCircle,
  AlertTriangle,
  Eye
} from 'lucide-react'
import { cn, formatCurrency, formatDate } from '@/lib/utils'

interface TenderCardProps {
  tender: {
    id: string
    title: string
    description?: string
    organization: string
    publishedDate: string
    deadline: string
    value?: number
    currency?: string
    status: 'scraped' | 'validated' | 'qualified' | 'submitted'
    priority: 'high' | 'medium' | 'low'
    aiScore?: number
    tags?: string[]
    source?: string
    isSelected?: boolean
  }
  isSelected?: boolean
  showCheckbox?: boolean
  onSelect?: (tender: any) => void
  onViewDetails?: (tender: any) => void
  onValidate?: (tender: any) => void
  onQualify?: (tender: any) => void
}

const statusConfig = {
  scraped: {
    label: 'Scraped',
    className: 'bg-gray-100 text-gray-700 border-gray-200'
  },
  validated: {
    label: 'Validated', 
    className: 'bg-blue-100 text-blue-700 border-blue-200'
  },
  qualified: {
    label: 'Qualified',
    className: 'bg-green-100 text-green-700 border-green-200'
  },
  submitted: {
    label: 'Submitted',
    className: 'bg-purple-100 text-purple-700 border-purple-200'
  }
}

const priorityConfig = {
  high: {
    label: 'High Priority',
    className: 'bg-red-100 text-red-700 border-red-200'
  },
  medium: {
    label: 'Medium Priority',
    className: 'bg-orange-100 text-orange-700 border-orange-200'
  },
  low: {
    label: 'Low Priority',
    className: 'bg-green-100 text-green-700 border-green-200'
  }
}

export function TenderCard({ 
  tender, 
  isSelected = false,
  showCheckbox = true,
  onSelect,
  onViewDetails,
  onValidate,
  onQualify
}: TenderCardProps) {
  const daysUntilDeadline = Math.ceil(
    (new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  )
  
  const isUrgent = daysUntilDeadline <= 3 && daysUntilDeadline > 0
  const isOverdue = daysUntilDeadline < 0

  const handleCardClick = () => {
    if (onSelect) {
      onSelect(tender)
    }
  }

  const handleAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation()
    action()
  }

  return (
    <div 
      className={cn(
        'bg-white rounded-lg border border-gray-200 p-6 cursor-pointer transition-all duration-200',
        'hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm',
        isSelected && 'ring-2 ring-blue-500 bg-blue-50 border-blue-200'
      )}
      onClick={handleCardClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3 flex-1">
          {showCheckbox && (
            <input
              type="checkbox"
              checked={isSelected}
              onChange={handleCardClick}
              className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 cursor-pointer"
              onClick={(e) => e.stopPropagation()}
            />
          )}
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-gray-900 mb-1 line-clamp-2">
              {tender.title}
            </h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <Building className="w-4 h-4" />
                {tender.organization}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                Posted {formatDate(tender.publishedDate)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {isOverdue 
                  ? `${Math.abs(daysUntilDeadline)}d overdue`
                  : `Deadline in ${daysUntilDeadline}d`
                }
              </span>
            </div>
          </div>
        </div>
        <Badge 
          variant="outline" 
          className={statusConfig[tender.status].className}
        >
          {statusConfig[tender.status].label}
        </Badge>
      </div>

      {/* Description */}
      {tender.description && (
        <p className="text-gray-600 text-sm mb-4 line-clamp-2 leading-relaxed">
          {tender.description}
        </p>
      )}

      {/* Tags */}
      {tender.tags && tender.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {tender.tags.map((tag, index) => (
            <Badge 
              key={index} 
              variant="secondary" 
              className="text-xs bg-gray-100 text-gray-700"
            >
              {tag}
            </Badge>
          ))}
          <Badge 
            variant="outline" 
            className={priorityConfig[tender.priority].className}
          >
            {priorityConfig[tender.priority].label}
          </Badge>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-4 border-t border-gray-100">
        <div className="flex items-center gap-6">
          {tender.value && (
            <div className="text-lg font-semibold text-green-600">
              {formatCurrency(tender.value, tender.currency || 'CAD')}
            </div>
          )}
          {tender.aiScore && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-gray-600">🧠 AI Score:</span>
              <span className="font-medium text-gray-900">{tender.aiScore}%</span>
              <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className={cn(
                    'h-full transition-all duration-300 rounded-full',
                    tender.aiScore >= 80 ? 'bg-green-500' : 
                    tender.aiScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  )}
                  style={{ width: `${tender.aiScore}%` }}
                />
              </div>
            </div>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          <span className={cn(
            'text-sm font-medium',
            isOverdue ? 'text-red-600' :
            isUrgent ? 'text-orange-600' : 'text-gray-600'
          )}>
            ⏰ Due {formatDate(tender.deadline)}
          </span>
        </div>
      </div>

      {/* Action Buttons - Only show on hover */}
      <div className="flex justify-end gap-2 mt-4 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
        {onViewDetails && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => handleAction(e, () => onViewDetails(tender))}
            className="text-xs"
          >
            <Eye className="w-3 h-3 mr-1" />
            View
          </Button>
        )}
        {onValidate && tender.status === 'scraped' && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => handleAction(e, () => onValidate(tender))}
            className="text-xs"
          >
            <CheckCircle className="w-3 h-3 mr-1" />
            Validate
          </Button>
        )}
        {onQualify && tender.status === 'validated' && (
          <Button
            variant="outline"
            size="sm"
            onClick={(e) => handleAction(e, () => onQualify(tender))}
            className="text-xs"
          >
            <AlertTriangle className="w-3 h-3 mr-1" />
            Qualify
          </Button>
        )}
        {tender.source && (
          <Button
            variant="outline"
            size="sm"
            asChild
            onClick={(e) => e.stopPropagation()}
            className="text-xs"
          >
            <a href={tender.source} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="w-3 h-3 mr-1" />
              Source
            </a>
          </Button>
        )}
      </div>
    </div>
  )
}