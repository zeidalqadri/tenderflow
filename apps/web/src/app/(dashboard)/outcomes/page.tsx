'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  TrendingUp,
  TrendingDown,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  Clock,
  Award,
  Target,
  BarChart3,
  FileText,
  Download
} from 'lucide-react'

export default function OutcomesPage() {
  // Mock data for outcomes
  const outcomes = [
    {
      id: 1,
      title: "Infrastructure Development Project",
      submissionDate: "2023-12-01",
      resultDate: "2023-12-15",
      status: "won",
      value: "$2,500,000",
      winProbability: 85,
      feedback: "Excellent technical proposal and competitive pricing"
    },
    {
      id: 2,
      title: "Software Licensing Agreement",
      submissionDate: "2023-11-20",
      resultDate: "2023-12-10",
      status: "lost",
      value: "$450,000",
      winProbability: 45,
      feedback: "Price point was higher than competitor offerings"
    },
    {
      id: 3,
      title: "Consulting Services Contract",
      submissionDate: "2024-01-05",
      resultDate: "pending",
      status: "pending",
      value: "$750,000",
      winProbability: 72,
      feedback: "Awaiting final decision from procurement committee"
    }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'won': return 'bg-green-100 text-green-800'
      case 'lost': return 'bg-red-100 text-red-800'
      case 'pending': return 'bg-yellow-100 text-yellow-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'won': return <CheckCircle className="h-4 w-4" />
      case 'lost': return <XCircle className="h-4 w-4" />
      case 'pending': return <Clock className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">🏆 Outcome Tracking</h1>
          <p className="text-gray-600">Monitor your tender results and performance metrics</p>
        </div>

        {/* Performance Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Win Rate</p>
                  <p className="text-2xl font-bold text-green-600">68%</p>
                  <div className="flex items-center text-sm text-green-600 mt-1">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    <span>+12% from last quarter</span>
                  </div>
                </div>
                <Award className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Value Won</p>
                  <p className="text-2xl font-bold text-blue-600">$8.4M</p>
                  <div className="flex items-center text-sm text-blue-600 mt-1">
                    <TrendingUp className="h-4 w-4 mr-1" />
                    <span>+24% YoY</span>
                  </div>
                </div>
                <DollarSign className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Average Response Time</p>
                  <p className="text-2xl font-bold text-purple-600">12 days</p>
                  <div className="flex items-center text-sm text-green-600 mt-1">
                    <TrendingDown className="h-4 w-4 mr-1" />
                    <span>-2 days improved</span>
                  </div>
                </div>
                <Clock className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Success Score</p>
                  <p className="text-2xl font-bold text-orange-600">8.2/10</p>
                  <div className="flex items-center text-sm text-orange-600 mt-1">
                    <Target className="h-4 w-4 mr-1" />
                    <span>Industry leading</span>
                  </div>
                </div>
                <BarChart3 className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <div className="flex gap-4 mb-6">
          <Button>
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>
          <Button variant="outline">
            <BarChart3 className="mr-2 h-4 w-4" />
            View Analytics
          </Button>
        </div>

        {/* Recent Outcomes */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Outcomes</CardTitle>
            <CardDescription>Track your latest tender results and feedback</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {outcomes.map((outcome) => (
                <div key={outcome.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">{outcome.title}</h3>
                      <Badge className={getStatusColor(outcome.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(outcome.status)}
                          {outcome.status.toUpperCase()}
                        </span>
                      </Badge>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600 mb-2">
                      <span>Submitted: {outcome.submissionDate}</span>
                      <span>Value: {outcome.value}</span>
                      <span>Win Probability: {outcome.winProbability}%</span>
                    </div>
                    {outcome.resultDate !== 'pending' && (
                      <div className="text-sm text-gray-600 mb-2">
                        Result Date: {outcome.resultDate}
                      </div>
                    )}
                    <div className="text-sm text-gray-700 bg-gray-50 p-2 rounded italic">
                      "{outcome.feedback}"
                    </div>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            outcome.status === 'won' ? 'bg-green-500' :
                            outcome.status === 'lost' ? 'bg-red-500' : 'bg-yellow-500'
                          }`}
                          style={{ width: `${outcome.winProbability}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 ml-4">
                    <Button variant="outline" size="sm">
                      <FileText className="h-4 w-4" />
                    </Button>
                    {outcome.status === 'won' && (
                      <Button size="sm" className="bg-green-600 hover:bg-green-700">
                        View Contract
                      </Button>
                    )}
                    {outcome.status === 'lost' && (
                      <Button variant="outline" size="sm">
                        Debrief
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Performance Trends */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Win Rate Trend</CardTitle>
              <CardDescription>Monthly win rate over the past 12 months</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p>Chart placeholder - Integration with analytics service pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Value Distribution</CardTitle>
              <CardDescription>Distribution of tender values won vs lost</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Won Tenders</span>
                    <span className="text-green-600">$8.4M (68%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-green-500 h-2 rounded-full" style={{ width: '68%' }}></div>
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Lost Tenders</span>
                    <span className="text-red-600">$3.9M (32%)</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div className="bg-red-500 h-2 rounded-full" style={{ width: '32%' }}></div>
                  </div>
                </div>
                <div className="pt-4 border-t">
                  <div className="flex justify-between font-medium">
                    <span>Total Bid Value</span>
                    <span>$12.3M</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}