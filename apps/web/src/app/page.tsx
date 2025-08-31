'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores/auth-store'
import { useMe } from '@/hooks/use-api'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  Inbox, 
  CheckCircle, 
  Tag, 
  Bell, 
  FileText, 
  Briefcase, 
  Send, 
  BarChart3, 
  MessageSquare,
  ArrowRight,
  Shield,
  Zap,
  Globe,
  Users
} from 'lucide-react'

export default function HomePage() {
  const router = useRouter()
  const { isAuthenticated, isLoading } = useAuthStore()
  const { data: userResponse } = useMe()

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      router.replace('/inbox')
    }
  }, [isAuthenticated, isLoading, router])

  const features = [
    {
      icon: Inbox,
      title: 'Smart Inbox',
      description: 'Automatically scrape and organize tender opportunities from multiple sources',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900'
    },
    {
      icon: CheckCircle,
      title: 'AI Validation',
      description: 'Validate and normalize tender data with AI-powered field completion',
      color: 'text-green-600 bg-green-100 dark:bg-green-900'
    },
    {
      icon: Tag,
      title: 'Auto Categorization',
      description: 'Intelligent categorization with custom rules and machine learning',
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900'
    },
    {
      icon: Bell,
      title: 'Real-time Alerts',
      description: 'Get notified instantly when relevant opportunities match your criteria',
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900'
    },
    {
      icon: FileText,
      title: 'Document Management',
      description: 'Organize, tag, and OCR process all your tender documents',
      color: 'text-cyan-600 bg-cyan-100 dark:bg-cyan-900'
    },
    {
      icon: Briefcase,
      title: 'Bid Workspace',
      description: 'Collaborative workspace with templates and cost estimation tools',
      color: 'text-indigo-600 bg-indigo-100 dark:bg-indigo-900'
    },
    {
      icon: Send,
      title: 'Submission Tracking',
      description: 'Track submission status and maintain audit trails',
      color: 'text-teal-600 bg-teal-100 dark:bg-teal-900'
    },
    {
      icon: BarChart3,
      title: 'Analytics & Reports',
      description: 'Comprehensive reporting with win rate analysis and forecasting',
      color: 'text-red-600 bg-red-100 dark:bg-red-900'
    },
    {
      icon: MessageSquare,
      title: 'Outcome Tracking',
      description: 'Record outcomes and feedback for continuous improvement',
      color: 'text-pink-600 bg-pink-100 dark:bg-pink-900'
    }
  ]

  const benefits = [
    {
      icon: Zap,
      title: 'Save 80% of Time',
      description: 'Automate manual processes and focus on strategy'
    },
    {
      icon: Shield,
      title: 'Never Miss Opportunities',
      description: 'Real-time monitoring across multiple platforms'
    },
    {
      icon: Globe,
      title: 'Scale Globally',
      description: 'Multi-language support and regional compliance'
    },
    {
      icon: Users,
      title: 'Team Collaboration',
      description: 'Role-based access and workflow management'
    }
  ]

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-sm text-muted-foreground">Loading...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return null // Will redirect to /inbox
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Header */}
      <header className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
              <Briefcase className="h-5 w-5 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold">TenderFlow</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/login')}
            >
              Sign In
            </Button>
            <Button
              onClick={() => router.push('/login')}
            >
              Get Started
            </Button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="container mx-auto px-4 py-20 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
            Professional Tender Management Platform
          </h2>
          <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
            Streamline your tender process with advanced automation, AI-powered validation, 
            and intelligent collaboration tools. Win more bids with less effort.
          </p>
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              onClick={() => router.push('/login')}
              className="gap-2"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="lg"
            >
              Watch Demo
            </Button>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">Why Choose TenderFlow?</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Built for procurement professionals who demand efficiency, accuracy, and results
          </p>
        </div>
        
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {benefits.map((benefit, index) => {
            const Icon = benefit.icon
            return (
              <Card key={index} className="text-center">
                <CardContent className="p-6">
                  <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center mx-auto mb-4">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h4 className="font-semibold mb-2">{benefit.title}</h4>
                  <p className="text-sm text-muted-foreground">{benefit.description}</p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h3 className="text-3xl font-bold mb-4">Complete Tender Workflow</h3>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Every feature designed to optimize your tender management process from discovery to outcome
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const Icon = feature.icon
            return (
              <Card key={index} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${feature.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{feature.title}</CardTitle>
                      <div className="text-sm text-muted-foreground">
                        Screen {index + 1}
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription>{feature.description}</CardDescription>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {/* CTA Section */}
      <section className="container mx-auto px-4 py-20">
        <Card className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white border-none">
          <CardContent className="p-12 text-center">
            <h3 className="text-3xl font-bold mb-4">
              Ready to Transform Your Tender Process?
            </h3>
            <p className="text-blue-100 mb-8 max-w-2xl mx-auto">
              Join thousands of procurement professionals who trust TenderFlow 
              to streamline their operations and win more contracts.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Button
                size="lg"
                variant="secondary"
                onClick={() => router.push('/login')}
                className="gap-2"
              >
                Get Started Free
                <ArrowRight className="h-4 w-4" />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="text-white border-white hover:bg-white/10"
              >
                Schedule Demo
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Footer */}
      <footer className="container mx-auto px-4 py-8 border-t">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
              <Briefcase className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold">TenderFlow</span>
            <span className="text-muted-foreground">© 2024</span>
          </div>
          <div className="flex items-center gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">Privacy</a>
            <a href="#" className="hover:text-foreground">Terms</a>
            <a href="#" className="hover:text-foreground">Support</a>
          </div>
        </div>
      </footer>
    </div>
  )
}