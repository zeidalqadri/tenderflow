'use client'

import { useState, useEffect } from 'react'

interface ClientOnlyTimestampProps {
  date: Date
  format?: 'time' | 'datetime' | 'relative'
  className?: string
}

function formatRelativeTime(date: Date): string {
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMinutes = Math.floor(diffMs / (1000 * 60))
  
  if (diffMinutes < 1) return 'just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`
  
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  
  return date.toLocaleDateString()
}

export function ClientOnlyTimestamp({ 
  date, 
  format = 'time',
  className = ''
}: ClientOnlyTimestampProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <span className={className}>--:--:--</span>
  }

  const formatDate = () => {
    try {
      switch (format) {
        case 'time':
          return date.toLocaleTimeString()
        case 'datetime':
          return date.toLocaleString()
        case 'relative':
          return formatRelativeTime(date)
        default:
          return date.toLocaleTimeString()
      }
    } catch (error) {
      return 'Invalid date'
    }
  }

  return <span className={className}>{formatDate()}</span>
}