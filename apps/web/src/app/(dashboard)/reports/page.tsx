'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { BarChart3, TrendingUp, DollarSign, Target, Calendar, FileText } from 'lucide-react'

export default function ReportsPage() {
  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">📊 Analytics & Reports</h1>
          <p className="text-gray-600">Comprehensive insights and performance metrics for your tender management.</p>
        </div>

        {/* Key Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Tenders</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">1,247</div>
              <p className="text-xs text-muted-foreground">
                +12% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Win Rate</CardTitle>
              <Target className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">68.4%</div>
              <p className="text-xs text-muted-foreground">
                +5.2% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Value</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">$2.4M</div>
              <p className="text-xs text-muted-foreground">
                +18% from last month
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Avg. Processing Time</CardTitle>
              <Calendar className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">4.2 days</div>
              <p className="text-xs text-muted-foreground">
                -1.3 days from last month
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Charts Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Tender Volume Trends
              </CardTitle>
              <CardDescription>
                Monthly tender activity over the last 12 months
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Chart visualization will be implemented here</p>
                  <p className="text-sm">Integration with analytics library pending</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                Success Rate by Category
              </CardTitle>
              <CardDescription>
                Win rate breakdown across different tender categories
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-64 flex items-center justify-center text-muted-foreground">
                <div className="text-center">
                  <TrendingUp className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Category performance visualization</p>
                  <p className="text-sm">Real-time data integration in progress</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Stats Table */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Performance Summary</CardTitle>
            <CardDescription>
              Key metrics and trends from your recent tender activities
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-blue-800">Active Tenders</div>
                  <div className="text-2xl font-bold text-blue-900">42</div>
                  <div className="text-xs text-blue-600">Currently in progress</div>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-green-800">Won This Month</div>
                  <div className="text-2xl font-bold text-green-900">17</div>
                  <div className="text-xs text-green-600">68% success rate</div>
                </div>
                <div className="bg-yellow-50 p-4 rounded-lg">
                  <div className="text-sm font-medium text-yellow-800">Pending Review</div>
                  <div className="text-2xl font-bold text-yellow-900">8</div>
                  <div className="text-xs text-yellow-600">Awaiting evaluation</div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Note about future enhancements */}
        <div className="mt-8 p-4 bg-gray-50 rounded-lg border-l-4 border-blue-500">
          <h3 className="font-medium text-gray-900 mb-2">🚀 Coming Soon</h3>
          <p className="text-sm text-gray-600">
            Advanced analytics features including interactive charts, custom date ranges, 
            export functionality, and real-time dashboard updates will be available in the next release.
          </p>
        </div>
      </div>
    </DashboardLayout>
  )
}