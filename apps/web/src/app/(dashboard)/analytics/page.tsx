'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function AnalyticsRedirectPage() {
  const router = useRouter()

  useEffect(() => {
    // Immediately redirect to reports page
    router.replace('/reports')
  }, [router])

  // Show a simple loading state while redirecting
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Redirecting to Analytics...</p>
      </div>
    </div>
  )
}