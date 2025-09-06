'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useTenderStore } from '@/stores/tender-store'
import { useToast } from '@/hooks/use-toast'
import {
  ChevronLeft,
  Brain,
  CheckCircle,
  AlertTriangle,
  Clock,
  Building,
  DollarSign,
  Calendar,
  FileText,
  Save,
  SkipForward,
  Archive,
  Lightbulb,
  TrendingUp,
  Target,
  Shield
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Mock validation queue data
const mockValidationQueue = [
  {
    id: 'tender-001',
    title: 'Cloud Infrastructure Modernization',
    organization: 'Government',
    value: 850000,
    aiConfidence: 87,
    priority: 'high'
  },
  {
    id: 'tender-002', 
    title: 'Digital Transformation Consulting',
    organization: 'Transit',
    value: 420000,
    aiConfidence: 74,
    priority: 'medium'
  },
  {
    id: 'tender-003',
    title: 'Enterprise Software Development',
    organization: 'Financial',
    value: 1200000,
    aiConfidence: 92,
    priority: 'high'
  },
  {
    id: 'tender-004',
    title: 'Cybersecurity Assessment',
    organization: 'Health Authority',
    value: 320000,
    aiConfidence: 65,
    priority: 'low'
  }
]

interface ConfidenceBarProps {
  value: number
  className?: string
}

function ConfidenceBar({ value, className }: ConfidenceBarProps) {
  const getColor = () => {
    if (value >= 80) return 'bg-green-500'
    if (value >= 60) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  return (
    <div className={cn('flex items-center gap-2 text-xs', className)}>
      <span className="text-gray-600">Confidence:</span>
      <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
        <div 
          className={cn('h-full transition-all duration-300', getColor())}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="font-medium">{value}%</span>
    </div>
  )
}

interface AISuggestionButtonProps {
  suggestion: string
  onApply: (value: string) => void
  className?: string
}

function AISuggestionButton({ suggestion, onApply, className }: AISuggestionButtonProps) {
  const [applied, setApplied] = useState(false)

  const handleApply = () => {
    onApply(suggestion)
    setApplied(true)
    setTimeout(() => setApplied(false), 2000)
  }

  if (applied) {
    return (
      <div className={cn('text-xs text-green-600 font-medium', className)}>
        ✓ Applied
      </div>
    )
  }

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleApply}
      className={cn('text-xs h-6 px-2 bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100', className)}
    >
      <Brain className="w-3 h-3 mr-1" />
      AI: {suggestion}
    </Button>
  )
}

export default function ValidationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedTender } = useTenderStore()
  const { toast } = useToast()
  
  const tenderId = searchParams.get('tender') || selectedTender?.id
  const [currentTenderIndex, setCurrentTenderIndex] = useState(0)
  const [processingProgress, setProcessingProgress] = useState(65)
  const [formData, setFormData] = useState({
    tenderId: 'PWGSC-2024-IT-001',
    sourcePortal: 'BuyandSell.gc.ca',
    publishingDate: '2024-02-24',
    closingDate: '2024-03-15',
    title: 'Cloud Infrastructure Modernization Services',
    estimatedValue: '850000',
    currency: 'CAD',
    contractDuration: '24 months',
    paymentTerms: 'Monthly milestone payments',
    primaryCategory: 'IT Services',
    industrySector: 'Government',
    keywords: 'cloud, infrastructure, modernization, government, migration',
    description: 'The Government of Canada is seeking proposals for comprehensive cloud infrastructure modernization services including migration planning, implementation, and ongoing support for critical government systems.',
    keyRequirements: `• Minimum 5 years cloud infrastructure experience
• Government security clearance required
• Experience with AWS/Azure government clouds
• 24/7 support capabilities
• Bilingual documentation (English/French)`
  })

  const currentTender = mockValidationQueue[currentTenderIndex]

  const updateField = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSaveDraft = () => {
    toast({
      title: 'Draft saved',
      description: 'Tender validation progress has been saved',
    })
  }

  const handleValidateAndContinue = () => {
    toast({
      title: 'Tender validated',
      description: 'Tender has been validated and moved to qualification queue',
    })
    if (currentTenderIndex < mockValidationQueue.length - 1) {
      setCurrentTenderIndex(prev => prev + 1)
      setProcessingProgress(prev => Math.min(100, prev + 10))
    } else {
      router.push('/categorize')
    }
  }

  const handleSkip = () => {
    if (currentTenderIndex < mockValidationQueue.length - 1) {
      setCurrentTenderIndex(prev => prev + 1)
    } else {
      router.push('/inbox')
    }
  }

  const handleArchive = () => {
    toast({
      title: 'Tender archived',
      description: 'Tender has been archived and removed from processing',
    })
    handleSkip()
  }

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Breadcrumb */}
        <div className="bg-white border-b border-gray-200 px-6 py-3">
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.back()}
              className="text-blue-600 hover:text-blue-700 p-0 h-auto"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              Smart Inbox
            </Button>
            <span>&gt;</span>
            <span className="text-gray-900">AI Validation</span>
          </div>
        </div>

        <div className="flex gap-6 p-6 max-w-7xl mx-auto">
          {/* Main Validation Panel */}
          <div className="flex-1 space-y-6">
            {/* Progress Indicator */}
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  <Progress value={processingProgress} className="h-2" />
                  <div className="text-center text-sm text-gray-600">
                    Processing {currentTenderIndex + 1} of {mockValidationQueue.length} tenders • {processingProgress}% Complete
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Tender Validation Form */}
            <Card className="shadow-sm">
              <CardHeader className="bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-t-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <CardTitle className="text-xl mb-2">
                      {formData.title}
                    </CardTitle>
                    <div className="text-blue-100 text-sm">
                      🏛️ {currentTender.organization} • {formData.tenderId}
                    </div>
                  </div>
                  <Badge className="bg-green-100 text-green-800 border-green-200">
                    🧠 AI Confidence: {currentTender.aiConfidence}%
                  </Badge>
                </div>
              </CardHeader>

              <CardContent className="p-6">
                {/* AI Insights */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-6 h-6 bg-blue-600 rounded-full flex items-center justify-center">
                      <Brain className="w-4 h-4 text-white" />
                    </div>
                    <h4 className="font-semibold text-blue-800">AI Analysis Insights</h4>
                  </div>
                  <ul className="space-y-2 text-sm text-blue-700">
                    <li className="flex items-start gap-2">
                      <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      High-value government contract with clear requirements
                    </li>
                    <li className="flex items-start gap-2">
                      <Target className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      Matches your cloud computing expertise profile
                    </li>
                    <li className="flex items-start gap-2">
                      <TrendingUp className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      Similar to 3 previous successful bids
                    </li>
                    <li className="flex items-start gap-2">
                      <Clock className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      Estimated bid preparation time: 40-60 hours
                    </li>
                  </ul>
                </div>

                <div className="space-y-6">
                  {/* Basic Information */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Basic Information
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="tenderId">Tender ID</Label>
                        <Input
                          id="tenderId"
                          value={formData.tenderId}
                          readOnly
                          className="bg-gray-50"
                        />
                      </div>
                      <div>
                        <Label htmlFor="sourcePortal">Source Portal</Label>
                        <Input
                          id="sourcePortal"
                          value={formData.sourcePortal}
                          readOnly
                          className="bg-gray-50"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="publishingDate">Publishing Date</Label>
                        <Input
                          id="publishingDate"
                          type="date"
                          value={formData.publishingDate}
                          onChange={(e) => updateField('publishingDate', e.target.value)}
                        />
                      </div>
                      <div className="relative">
                        <Label htmlFor="closingDate">Closing Date</Label>
                        <Input
                          id="closingDate"
                          type="date"
                          value={formData.closingDate}
                          onChange={(e) => updateField('closingDate', e.target.value)}
                        />
                        <AISuggestionButton
                          suggestion="Mar 16"
                          onApply={(value) => updateField('closingDate', '2024-03-16')}
                          className="absolute top-8 right-2"
                        />
                      </div>
                    </div>

                    <div className="mb-4">
                      <Label htmlFor="title">Title</Label>
                      <Input
                        id="title"
                        value={formData.title}
                        onChange={(e) => updateField('title', e.target.value)}
                      />
                      <ConfidenceBar value={95} className="mt-2" />
                    </div>
                  </div>

                  {/* Financial Details */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <DollarSign className="w-5 h-5" />
                      Financial Details
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div className="relative">
                        <Label htmlFor="estimatedValue">Estimated Value</Label>
                        <Input
                          id="estimatedValue"
                          type="number"
                          value={formData.estimatedValue}
                          onChange={(e) => updateField('estimatedValue', e.target.value)}
                        />
                        <AISuggestionButton
                          suggestion="$875K"
                          onApply={(value) => updateField('estimatedValue', '875000')}
                          className="absolute top-8 right-2"
                        />
                        <ConfidenceBar value={72} className="mt-2" />
                      </div>
                      <div>
                        <Label htmlFor="currency">Currency</Label>
                        <select 
                          id="currency"
                          value={formData.currency}
                          onChange={(e) => updateField('currency', e.target.value)}
                          className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="CAD">CAD - Canadian Dollar</option>
                          <option value="USD">USD - US Dollar</option>
                          <option value="EUR">EUR - Euro</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="contractDuration">Contract Duration</Label>
                        <Input
                          id="contractDuration"
                          value={formData.contractDuration}
                          onChange={(e) => updateField('contractDuration', e.target.value)}
                        />
                        <ConfidenceBar value={88} className="mt-2" />
                      </div>
                      <div className="relative">
                        <Label htmlFor="paymentTerms">Payment Terms</Label>
                        <Input
                          id="paymentTerms"
                          value={formData.paymentTerms}
                          onChange={(e) => updateField('paymentTerms', e.target.value)}
                        />
                        <AISuggestionButton
                          suggestion="Quarterly"
                          onApply={(value) => updateField('paymentTerms', 'Quarterly milestone payments')}
                          className="absolute top-8 right-2"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Categorization */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <Shield className="w-5 h-5" />
                      Categorization
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <Label htmlFor="primaryCategory">Primary Category</Label>
                        <select 
                          id="primaryCategory"
                          value={formData.primaryCategory}
                          onChange={(e) => updateField('primaryCategory', e.target.value)}
                          className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="IT Services">IT Services</option>
                          <option value="Cloud Computing">Cloud Computing</option>
                          <option value="Consulting">Consulting</option>
                          <option value="Software Development">Software Development</option>
                        </select>
                        <ConfidenceBar value={94} className="mt-2" />
                      </div>
                      <div>
                        <Label htmlFor="industrySector">Industry Sector</Label>
                        <select 
                          id="industrySector"
                          value={formData.industrySector}
                          onChange={(e) => updateField('industrySector', e.target.value)}
                          className="w-full h-10 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="Government">Government</option>
                          <option value="Healthcare">Healthcare</option>
                          <option value="Financial">Financial</option>
                          <option value="Education">Education</option>
                        </select>
                      </div>
                    </div>

                    <div className="mb-4 relative">
                      <Label htmlFor="keywords">Keywords/Tags</Label>
                      <Input
                        id="keywords"
                        value={formData.keywords}
                        onChange={(e) => updateField('keywords', e.target.value)}
                      />
                      <AISuggestionButton
                        suggestion="+AWS, Azure"
                        onApply={(value) => updateField('keywords', formData.keywords + ', AWS, Azure')}
                        className="absolute top-8 right-2"
                      />
                    </div>
                  </div>

                  {/* Description & Requirements */}
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      Description & Requirements
                    </h3>
                    
                    <div className="mb-4">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => updateField('description', e.target.value)}
                        rows={4}
                        className="resize-y"
                      />
                      <ConfidenceBar value={91} className="mt-2" />
                    </div>

                    <div className="mb-4 relative">
                      <Label htmlFor="keyRequirements">Key Requirements</Label>
                      <Textarea
                        id="keyRequirements"
                        value={formData.keyRequirements}
                        onChange={(e) => updateField('keyRequirements', e.target.value)}
                        rows={6}
                        className="resize-y"
                      />
                      <AISuggestionButton
                        suggestion="Enhanced"
                        onApply={(value) => updateField('keyRequirements', formData.keyRequirements + '\n• Enhanced security requirements identified')}
                        className="absolute top-8 right-2"
                      />
                    </div>
                  </div>
                </div>
              </CardContent>

              {/* Action Buttons */}
              <div className="bg-gray-50 px-6 py-4 border-t border-gray-200 rounded-b-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Button
                      variant="destructive"
                      onClick={handleArchive}
                      className="flex items-center gap-2"
                    >
                      <Archive className="w-4 h-4" />
                      Archive
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleSaveDraft}
                      className="flex items-center gap-2"
                    >
                      <Save className="w-4 h-4" />
                      Save Draft
                    </Button>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <Button
                      variant="outline"
                      onClick={handleSkip}
                      className="flex items-center gap-2"
                    >
                      <SkipForward className="w-4 h-4" />
                      Skip for Now
                    </Button>
                    <Button
                      onClick={handleValidateAndContinue}
                      className="flex items-center gap-2"
                    >
                      <CheckCircle className="w-4 h-4" />
                      Validate & Continue
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          {/* Right Sidebar */}
          <div className="w-80 space-y-6">
            {/* Validation Queue */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Validation Queue</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="space-y-1">
                  {mockValidationQueue.map((tender, index) => (
                    <div
                      key={tender.id}
                      className={cn(
                        'p-3 cursor-pointer transition-colors border-l-4',
                        index === currentTenderIndex
                          ? 'bg-blue-50 border-l-blue-500'
                          : 'hover:bg-gray-50 border-l-transparent'
                      )}
                      onClick={() => setCurrentTenderIndex(index)}
                    >
                      <div className="text-sm font-medium text-gray-900 mb-1">
                        {tender.title}
                      </div>
                      <div className="text-xs text-gray-600 mb-2">
                        {tender.organization} • ${(tender.value / 1000).toFixed(0)}K • {tender.aiConfidence}% confidence
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-1">
                        <div 
                          className={cn(
                            'h-1 rounded-full transition-all',
                            tender.aiConfidence >= 80 ? 'bg-green-500' : 
                            tender.aiConfidence >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                          )}
                          style={{ width: `${tender.aiConfidence}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Validation Tools */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Brain className="w-4 h-4" />
                  Validation Tools
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button variant="outline" className="w-full justify-start text-sm">
                  🤖 Auto-Complete Fields
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm">
                  📊 Similar Tenders
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm">
                  🔍 Verify Source Data
                </Button>
                <Button variant="outline" className="w-full justify-start text-sm">
                  📋 Export for Review
                </Button>
              </CardContent>
            </Card>

            {/* Validation Settings */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Validation Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  Auto-accept high confidence fields
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  Flag missing critical fields
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" className="rounded" />
                  Require manual review for values &gt;$1M
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" defaultChecked className="rounded" />
                  Show confidence indicators
                </label>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}