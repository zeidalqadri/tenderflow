'use client'

import React from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatsCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
    isPositive?: boolean
  }
  icon?: React.ReactNode
  className?: string
  valueClassName?: string
}

export function StatsCard({ 
  title, 
  value, 
  subtitle, 
  trend, 
  icon, 
  className,
  valueClassName 
}: StatsCardProps) {
  return (
    <Card className={cn('transition-all duration-200 hover:shadow-md', className)}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium text-gray-600">{title}</p>
          {icon && <div className="text-gray-400">{icon}</div>}
        </div>
        
        <div className="space-y-1">
          <p className={cn(
            'text-3xl font-bold text-gray-900',
            valueClassName
          )}>
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          
          {subtitle && (
            <p className="text-sm text-gray-500">{subtitle}</p>
          )}
          
          {trend && (
            <div className="flex items-center gap-1 text-xs">
              <span className={cn(
                'font-medium',
                trend.isPositive !== false ? 'text-green-600' : 'text-red-600'
              )}>
                {trend.isPositive !== false ? '+' : ''}{trend.value}%
              </span>
              <span className="text-gray-500">{trend.label}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// Predefined stats card variants for common use cases
export function NewTodayCard({ value, trend }: { value: number, trend?: StatsCardProps['trend'] }) {
  return (
    <StatsCard
      title="New Tenders Today"
      value={value}
      trend={trend}
      valueClassName="text-blue-600"
      icon={<span className="text-xl">📥</span>}
    />
  )
}

export function PendingReviewCard({ value, trend }: { value: number, trend?: StatsCardProps['trend'] }) {
  return (
    <StatsCard
      title="Pending Review"
      value={value}
      trend={trend}
      valueClassName="text-orange-600"
      icon={<span className="text-xl">⏳</span>}
    />
  )
}

export function HighPriorityCard({ value, trend }: { value: number, trend?: StatsCardProps['trend'] }) {
  return (
    <StatsCard
      title="High Priority"
      value={value}
      trend={trend}
      valueClassName="text-red-600"
      icon={<span className="text-xl">🚨</span>}
    />
  )
}

export function TotalValueCard({ value, currency = 'CAD', trend }: { 
  value: number
  currency?: string
  trend?: StatsCardProps['trend'] 
}) {
  const formatValue = (val: number) => {
    if (val >= 1000000) {
      return `$${(val / 1000000).toFixed(1)}M ${currency}`
    } else if (val >= 1000) {
      return `$${(val / 1000).toFixed(0)}K ${currency}`
    }
    return `$${val.toLocaleString()} ${currency}`
  }

  return (
    <StatsCard
      title="Total Value"
      value={formatValue(value)}
      trend={trend}
      valueClassName="text-green-600"
      icon={<span className="text-xl">💰</span>}
    />
  )
}