'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Send, 
  FileText, 
  Clock, 
  CheckCircle, 
  AlertCircle,
  Upload,
  Eye,
  Edit
} from 'lucide-react'

export default function SubmissionsPage() {
  // Mock data for submissions
  const submissions = [
    {
      id: 1,
      title: "Infrastructure Development Bid",
      dueDate: "2024-01-15",
      status: "draft",
      progress: 75,
      documents: 8
    },
    {
      id: 2,
      title: "Software Services Contract",
      dueDate: "2024-01-20",
      status: "submitted",
      progress: 100,
      documents: 12
    },
    {
      id: 3,
      title: "Consulting Services Proposal",
      dueDate: "2024-01-25",
      status: "in-review",
      progress: 100,
      documents: 6
    }
  ]

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-yellow-100 text-yellow-800'
      case 'submitted': return 'bg-blue-100 text-blue-800'
      case 'in-review': return 'bg-purple-100 text-purple-800'
      case 'approved': return 'bg-green-100 text-green-800'
      case 'rejected': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'draft': return <Edit className="h-4 w-4" />
      case 'submitted': return <Send className="h-4 w-4" />
      case 'in-review': return <Clock className="h-4 w-4" />
      case 'approved': return <CheckCircle className="h-4 w-4" />
      case 'rejected': return <AlertCircle className="h-4 w-4" />
      default: return <FileText className="h-4 w-4" />
    }
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">📤 Submission Portal</h1>
          <p className="text-gray-600">Manage and track your tender submissions</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Submissions</p>
                  <p className="text-2xl font-bold text-gray-900">24</p>
                </div>
                <Send className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">In Draft</p>
                  <p className="text-2xl font-bold text-yellow-600">3</p>
                </div>
                <Edit className="h-8 w-8 text-yellow-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Under Review</p>
                  <p className="text-2xl font-bold text-purple-600">8</p>
                </div>
                <Clock className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Success Rate</p>
                  <p className="text-2xl font-bold text-green-600">68%</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Actions */}
        <div className="flex gap-4 mb-6">
          <Button>
            <Upload className="mr-2 h-4 w-4" />
            New Submission
          </Button>
          <Button variant="outline">
            <FileText className="mr-2 h-4 w-4" />
            Templates
          </Button>
        </div>

        {/* Submissions List */}
        <Card>
          <CardHeader>
            <CardTitle>Recent Submissions</CardTitle>
            <CardDescription>Track your active and completed submissions</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {submissions.map((submission) => (
                <div key={submission.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="font-medium text-gray-900">{submission.title}</h3>
                      <Badge className={getStatusColor(submission.status)}>
                        <span className="flex items-center gap-1">
                          {getStatusIcon(submission.status)}
                          {submission.status.replace('-', ' ')}
                        </span>
                      </Badge>
                    </div>
                    <div className="flex items-center gap-6 text-sm text-gray-600">
                      <span>Due: {submission.dueDate}</span>
                      <span>{submission.documents} documents</span>
                      <span>Progress: {submission.progress}%</span>
                    </div>
                    <div className="mt-2">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-blue-600 h-2 rounded-full" 
                          style={{ width: `${submission.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Upcoming Deadlines */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Upcoming Deadlines</CardTitle>
            <CardDescription>Don't miss these important submission dates</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-yellow-50 rounded-lg border border-yellow-200">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  <div>
                    <p className="font-medium text-gray-900">Infrastructure Development Bid</p>
                    <p className="text-sm text-gray-600">Due in 3 days</p>
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  Review
                </Button>
              </div>
              <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="flex items-center gap-3">
                  <Clock className="h-5 w-5 text-blue-600" />
                  <div>
                    <p className="font-medium text-gray-900">Software Services Contract</p>
                    <p className="text-sm text-gray-600">Due in 8 days</p>
                  </div>
                </div>
                <Button size="sm" variant="outline">
                  Continue
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  )
}