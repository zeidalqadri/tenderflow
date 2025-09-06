'use client'

import React, { useState, useEffect, useMemo } from 'react'
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
  ChevronRight,
  Brain,
  Target,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  XCircle,
  Users,
  Briefcase,
  Award,
  DollarSign,
  Clock,
  BarChart,
  Hash,
  Filter,
  Settings,
  Plus,
  Minus,
  Info,
  Lightbulb,
  Star,
  Shield,
  Zap,
  Archive
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Mock ML scoring data
const mockScoringCriteria = {
  technical: {
    weight: 30,
    score: 85,
    factors: [
      { name: 'Technical alignment', score: 90, weight: 40 },
      { name: 'Required expertise', score: 85, weight: 30 },
      { name: 'Resource availability', score: 80, weight: 30 }
    ]
  },
  financial: {
    weight: 25,
    score: 72,
    factors: [
      { name: 'Budget fit', score: 80, weight: 35 },
      { name: 'ROI potential', score: 70, weight: 35 },
      { name: 'Payment terms', score: 65, weight: 30 }
    ]
  },
  strategic: {
    weight: 25,
    score: 88,
    factors: [
      { name: 'Market position', score: 90, weight: 40 },
      { name: 'Growth opportunity', score: 85, weight: 30 },
      { name: 'Competitive advantage', score: 88, weight: 30 }
    ]
  },
  risk: {
    weight: 20,
    score: 78,
    factors: [
      { name: 'Delivery timeline', score: 75, weight: 35 },
      { name: 'Contract terms', score: 80, weight: 35 },
      { name: 'Compliance requirements', score: 78, weight: 30 }
    ]
  }
}

// Mock similar tenders for ML comparison
const mockSimilarTenders = [
  {
    id: 'similar-001',
    title: 'Federal Cloud Migration Project',
    organization: 'Government of Canada',
    value: 1200000,
    outcome: 'won',
    score: 92,
    date: '2023-10-15'
  },
  {
    id: 'similar-002',
    title: 'Azure Infrastructure Setup',
    organization: 'Provincial Government',
    value: 650000,
    outcome: 'won',
    score: 88,
    date: '2023-08-20'
  },
  {
    id: 'similar-003',
    title: 'Cloud Security Assessment',
    organization: 'Health Authority',
    value: 450000,
    outcome: 'lost',
    score: 75,
    date: '2023-06-10'
  }
]

// Mock team members for assignment
const mockTeamMembers = [
  { id: 'user-001', name: 'Sarah Chen', role: 'Bid Manager', expertise: ['Cloud', 'Government'] },
  { id: 'user-002', name: 'Michael Ross', role: 'Technical Lead', expertise: ['Infrastructure', 'Security'] },
  { id: 'user-003', name: 'Emily Johnson', role: 'Solution Architect', expertise: ['Azure', 'AWS'] },
  { id: 'user-004', name: 'David Kim', role: 'Project Manager', expertise: ['Agile', 'Government'] }
]

interface ScoringFactorProps {
  name: string
  score: number
  weight: number
  onScoreChange?: (score: number) => void
  editable?: boolean
}

function ScoringFactor({ name, score, weight, onScoreChange, editable = false }: ScoringFactorProps) {
  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-600'
    if (score >= 60) return 'text-yellow-600'
    return 'text-red-600'
  }

  return (
    <div className="flex items-center justify-between py-2">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-700">{name}</span>
          <span className="text-xs text-gray-500">({weight}%)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="flex-1 bg-gray-200 rounded-full h-2 max-w-[200px]">
            <div
              className={cn('h-2 rounded-full transition-all', 
                score >= 80 ? 'bg-green-500' : 
                score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${score}%` }}
            />
          </div>
          {editable ? (
            <Input
              type="number"
              min="0"
              max="100"
              value={score}
              onChange={(e) => onScoreChange?.(parseInt(e.target.value))}
              className="w-16 h-7 text-xs"
            />
          ) : (
            <span className={cn('text-sm font-medium', getScoreColor(score))}>
              {score}%
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

interface CategoryCardProps {
  title: string
  icon: React.ReactNode
  weight: number
  score: number
  factors: Array<{ name: string; score: number; weight: number }>
  color: string
  editable?: boolean
}

function CategoryCard({ title, icon, weight, score, factors, color, editable = false }: CategoryCardProps) {
  const [expanded, setExpanded] = useState(false)
  
  return (
    <Card className="overflow-hidden">
      <div className={cn('h-1', color)} />
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-base">{title}</CardTitle>
            <Badge variant="outline" className="text-xs">
              Weight: {weight}%
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn('text-2xl font-bold', 
              score >= 80 ? 'text-green-600' : 
              score >= 60 ? 'text-yellow-600' : 'text-red-600'
            )}>
              {score}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setExpanded(!expanded)}
            >
              <ChevronRight className={cn('w-4 h-4 transition-transform', expanded && 'rotate-90')} />
            </Button>
          </div>
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <div className="space-y-1">
            {factors.map((factor, index) => (
              <ScoringFactor
                key={index}
                name={factor.name}
                score={factor.score}
                weight={factor.weight}
                editable={editable}
              />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export default function CategorizationPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { selectedTender } = useTenderStore()
  const { toast } = useToast()
  
  const [overallScore, setOverallScore] = useState(81)
  const [recommendation, setRecommendation] = useState<'pursue' | 'maybe' | 'skip'>('pursue')
  const [selectedTeamMembers, setSelectedTeamMembers] = useState<string[]>([])
  const [customNotes, setCustomNotes] = useState('')
  const [scoringMode, setScoringMode] = useState<'auto' | 'manual'>('auto')
  const [showSimilarTenders, setShowSimilarTenders] = useState(true)
  
  // Calculate overall score based on weighted categories
  useEffect(() => {
    const technical = mockScoringCriteria.technical.score * (mockScoringCriteria.technical.weight / 100)
    const financial = mockScoringCriteria.financial.score * (mockScoringCriteria.financial.weight / 100)
    const strategic = mockScoringCriteria.strategic.score * (mockScoringCriteria.strategic.weight / 100)
    const risk = mockScoringCriteria.risk.score * (mockScoringCriteria.risk.weight / 100)
    
    const total = Math.round(technical + financial + strategic + risk)
    setOverallScore(total)
    
    // Set recommendation based on score
    if (total >= 80) setRecommendation('pursue')
    else if (total >= 60) setRecommendation('maybe')
    else setRecommendation('skip')
  }, [])

  const handleQualify = () => {
    if (selectedTeamMembers.length === 0) {
      toast({
        title: 'Team assignment required',
        description: 'Please assign at least one team member before qualifying',
        variant: 'destructive'
      })
      return
    }
    
    toast({
      title: 'Tender qualified',
      description: `Tender qualified with score ${overallScore} and assigned to ${selectedTeamMembers.length} team members`,
    })
    router.push('/alerts')
  }

  const handleReject = () => {
    toast({
      title: 'Tender rejected',
      description: 'Tender has been moved to archive',
    })
    router.push('/inbox')
  }

  const handleSaveForLater = () => {
    toast({
      title: 'Saved for review',
      description: 'Tender saved for later review',
    })
  }

  const toggleTeamMember = (memberId: string) => {
    setSelectedTeamMembers(prev => 
      prev.includes(memberId)
        ? prev.filter(id => id !== memberId)
        : [...prev, memberId]
    )
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
              AI Validation
            </Button>
            <span>&gt;</span>
            <span className="text-gray-900">Auto-Categorization</span>
          </div>
        </div>

        <div className="p-6 max-w-7xl mx-auto">
          {/* Header Section */}
          <div className="mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">
                  Tender Qualification & Scoring
                </h1>
                <p className="text-gray-600">
                  ML-powered qualification with customizable scoring criteria and team assignment
                </p>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setScoringMode(scoringMode === 'auto' ? 'manual' : 'auto')}
                >
                  <Settings className="w-4 h-4 mr-2" />
                  {scoringMode === 'auto' ? 'Auto Scoring' : 'Manual Scoring'}
                </Button>
              </div>
            </div>

            {/* Tender Info Card */}
            <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 mb-2">
                      Cloud Infrastructure Modernization Services
                    </h2>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Briefcase className="w-4 h-4" />
                        Government of Canada
                      </span>
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        $850,000 CAD
                      </span>
                      <span className="flex items-center gap-1">
                        <Clock className="w-4 h-4" />
                        Closes Mar 15, 2024
                      </span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-gray-600 mb-1">ML Confidence</div>
                    <div className="text-2xl font-bold text-blue-600">87%</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-3 gap-6">
            {/* Main Scoring Panel */}
            <div className="col-span-2 space-y-6">
              {/* Overall Score Card */}
              <Card className="border-2 border-blue-200 bg-blue-50/50">
                <CardContent className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        Overall Qualification Score
                      </h3>
                      <p className="text-sm text-gray-600">
                        Based on weighted scoring criteria and ML analysis
                      </p>
                    </div>
                    <div className="text-right">
                      <div className={cn('text-4xl font-bold',
                        overallScore >= 80 ? 'text-green-600' : 
                        overallScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                      )}>
                        {overallScore}
                      </div>
                      <div className="text-sm text-gray-600">out of 100</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-4 p-4 bg-white rounded-lg">
                    <div className={cn('flex items-center gap-2 px-4 py-2 rounded-full',
                      recommendation === 'pursue' ? 'bg-green-100 text-green-700' :
                      recommendation === 'maybe' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-red-100 text-red-700'
                    )}>
                      {recommendation === 'pursue' ? (
                        <>
                          <CheckCircle className="w-5 h-5" />
                          <span className="font-semibold">Recommended to Pursue</span>
                        </>
                      ) : recommendation === 'maybe' ? (
                        <>
                          <AlertCircle className="w-5 h-5" />
                          <span className="font-semibold">Consider Carefully</span>
                        </>
                      ) : (
                        <>
                          <XCircle className="w-5 h-5" />
                          <span className="font-semibold">Not Recommended</span>
                        </>
                      )}
                    </div>
                    <div className="flex-1 text-sm text-gray-600">
                      {recommendation === 'pursue' 
                        ? 'High alignment with capabilities and strategic goals'
                        : recommendation === 'maybe'
                        ? 'Moderate opportunity with some risk factors'
                        : 'Low alignment or high risk factors identified'
                      }
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Scoring Categories */}
              <div className="grid grid-cols-2 gap-4">
                <CategoryCard
                  title="Technical Fit"
                  icon={<Target className="w-5 h-5 text-blue-600" />}
                  weight={mockScoringCriteria.technical.weight}
                  score={mockScoringCriteria.technical.score}
                  factors={mockScoringCriteria.technical.factors}
                  color="bg-blue-500"
                  editable={scoringMode === 'manual'}
                />
                
                <CategoryCard
                  title="Financial Viability"
                  icon={<DollarSign className="w-5 h-5 text-green-600" />}
                  weight={mockScoringCriteria.financial.weight}
                  score={mockScoringCriteria.financial.score}
                  factors={mockScoringCriteria.financial.factors}
                  color="bg-green-500"
                  editable={scoringMode === 'manual'}
                />
                
                <CategoryCard
                  title="Strategic Value"
                  icon={<TrendingUp className="w-5 h-5 text-purple-600" />}
                  weight={mockScoringCriteria.strategic.weight}
                  score={mockScoringCriteria.strategic.score}
                  factors={mockScoringCriteria.strategic.factors}
                  color="bg-purple-500"
                  editable={scoringMode === 'manual'}
                />
                
                <CategoryCard
                  title="Risk Assessment"
                  icon={<Shield className="w-5 h-5 text-orange-600" />}
                  weight={mockScoringCriteria.risk.weight}
                  score={mockScoringCriteria.risk.score}
                  factors={mockScoringCriteria.risk.factors}
                  color="bg-orange-500"
                  editable={scoringMode === 'manual'}
                />
              </div>

              {/* Team Assignment */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Team Assignment
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {mockTeamMembers.map(member => (
                      <div
                        key={member.id}
                        className={cn(
                          'flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors',
                          selectedTeamMembers.includes(member.id)
                            ? 'bg-blue-50 border-blue-300'
                            : 'hover:bg-gray-50 border-gray-200'
                        )}
                        onClick={() => toggleTeamMember(member.id)}
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-gray-300 rounded-full flex items-center justify-center text-sm font-semibold text-white">
                            {member.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900">{member.name}</div>
                            <div className="text-sm text-gray-600">{member.role}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {member.expertise.map(skill => (
                            <Badge key={skill} variant="outline" className="text-xs">
                              {skill}
                            </Badge>
                          ))}
                          {selectedTeamMembers.includes(member.id) && (
                            <CheckCircle className="w-5 h-5 text-blue-600 ml-2" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <div className="mt-4">
                    <Label htmlFor="notes">Additional Notes</Label>
                    <Textarea
                      id="notes"
                      placeholder="Add any special instructions or notes for the team..."
                      value={customNotes}
                      onChange={(e) => setCustomNotes(e.target.value)}
                      className="mt-2"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Right Sidebar */}
            <div className="space-y-6">
              {/* ML Insights */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Brain className="w-5 h-5" />
                    ML Insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-start gap-2">
                    <Lightbulb className="w-4 h-4 text-blue-600 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">High Success Probability</div>
                      <div className="text-gray-600">Similar tenders show 85% win rate</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Zap className="w-4 h-4 text-yellow-600 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">Quick Decision Needed</div>
                      <div className="text-gray-600">19 days until deadline</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Award className="w-4 h-4 text-green-600 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">Competitive Advantage</div>
                      <div className="text-gray-600">Strong technical alignment detected</div>
                    </div>
                  </div>
                  
                  <div className="flex items-start gap-2">
                    <Info className="w-4 h-4 text-purple-600 mt-0.5" />
                    <div className="text-sm">
                      <div className="font-medium text-gray-900">Suggested Resources</div>
                      <div className="text-gray-600">3-4 team members, 40-60 hours</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Similar Tenders */}
              {showSimilarTenders && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <BarChart className="w-5 h-5" />
                        Similar Tenders
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowSimilarTenders(false)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {mockSimilarTenders.map(tender => (
                      <div key={tender.id} className="border rounded-lg p-3">
                        <div className="text-sm font-medium text-gray-900 mb-1">
                          {tender.title}
                        </div>
                        <div className="text-xs text-gray-600 mb-2">
                          {tender.organization} • ${(tender.value / 1000).toFixed(0)}K
                        </div>
                        <div className="flex items-center justify-between">
                          <Badge
                            variant={tender.outcome === 'won' ? 'default' : 'destructive'}
                            className="text-xs"
                          >
                            {tender.outcome === 'won' ? '✓ Won' : '✗ Lost'}
                          </Badge>
                          <span className="text-xs text-gray-600">
                            Score: {tender.score}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Decision Actions */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Decision Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button 
                    className="w-full"
                    onClick={handleQualify}
                    disabled={selectedTeamMembers.length === 0}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Qualify & Assign Team
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={handleSaveForLater}
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Save for Later Review
                  </Button>
                  
                  <Button 
                    variant="destructive" 
                    className="w-full"
                    onClick={handleReject}
                  >
                    <Archive className="w-4 h-4 mr-2" />
                    Reject & Archive
                  </Button>
                </CardContent>
              </Card>

              {/* Scoring Settings */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Scoring Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    Use ML recommendations
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    Consider past performance
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" className="rounded" />
                    Apply strict criteria
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" defaultChecked className="rounded" />
                    Auto-assign based on expertise
                  </label>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}