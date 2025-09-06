'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useToast } from '@/hooks/use-toast'
import {
  Users,
  FileText,
  CheckSquare,
  Calendar,
  Clock,
  MessageSquare,
  Edit3,
  Save,
  Send,
  AlertCircle,
  CheckCircle,
  Target,
  Briefcase,
  DollarSign,
  BarChart,
  GitBranch,
  Lock,
  Unlock,
  Eye,
  Download,
  Upload,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Star,
  Flag,
  Paperclip,
  Video,
  Phone,
  Share2,
  Settings,
  Lightbulb,
  Award
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Mock bid data
const mockBidData = {
  tender: {
    id: 'tender-001',
    title: 'Cloud Infrastructure Modernization Services',
    organization: 'Government of Canada',
    value: 850000,
    deadline: '2024-03-15T14:00:00Z',
    status: 'in_bid'
  },
  proposal: {
    completionRate: 65,
    sections: [
      { id: 's1', name: 'Executive Summary', status: 'completed', owner: 'Sarah Chen' },
      { id: 's2', name: 'Technical Approach', status: 'in_progress', owner: 'Michael Ross' },
      { id: 's3', name: 'Project Timeline', status: 'in_progress', owner: 'Emily Johnson' },
      { id: 's4', name: 'Team Qualifications', status: 'completed', owner: 'David Kim' },
      { id: 's5', name: 'Budget & Pricing', status: 'pending', owner: 'Sarah Chen' },
      { id: 's6', name: 'Risk Management', status: 'pending', owner: 'Michael Ross' }
    ]
  },
  team: [
    { id: 'u1', name: 'Sarah Chen', role: 'Bid Manager', online: true, avatar: 'SC' },
    { id: 'u2', name: 'Michael Ross', role: 'Technical Lead', online: true, avatar: 'MR' },
    { id: 'u3', name: 'Emily Johnson', role: 'Solution Architect', online: false, avatar: 'EJ' },
    { id: 'u4', name: 'David Kim', role: 'Project Manager', online: true, avatar: 'DK' }
  ],
  tasks: [
    { id: 't1', title: 'Complete technical architecture diagram', assignee: 'Michael Ross', priority: 'high', due: '2024-02-26', status: 'in_progress' },
    { id: 't2', title: 'Review compliance requirements', assignee: 'Sarah Chen', priority: 'critical', due: '2024-02-25', status: 'pending' },
    { id: 't3', title: 'Finalize budget calculations', assignee: 'Sarah Chen', priority: 'high', due: '2024-02-27', status: 'pending' },
    { id: 't4', title: 'Gather team CVs and certifications', assignee: 'David Kim', priority: 'medium', due: '2024-02-28', status: 'completed' },
    { id: 't5', title: 'Write executive summary', assignee: 'Sarah Chen', priority: 'high', due: '2024-02-25', status: 'completed' }
  ],
  resources: [
    { id: 'r1', name: 'Previous Government Proposals', type: 'folder', items: 12 },
    { id: 'r2', name: 'Technical Templates', type: 'folder', items: 8 },
    { id: 'r3', name: 'Pricing Models', type: 'folder', items: 5 },
    { id: 'r4', name: 'Case Studies', type: 'folder', items: 15 }
  ],
  recentActivity: [
    { id: 'a1', user: 'Sarah Chen', action: 'completed section', target: 'Executive Summary', time: '10 minutes ago' },
    { id: 'a2', user: 'Michael Ross', action: 'added comment to', target: 'Technical Approach', time: '25 minutes ago' },
    { id: 'a3', user: 'David Kim', action: 'uploaded file', target: 'Team Certifications.pdf', time: '1 hour ago' },
    { id: 'a4', user: 'Emily Johnson', action: 'started editing', target: 'Project Timeline', time: '2 hours ago' }
  ]
}

interface TaskCardProps {
  task: typeof mockBidData.tasks[0]
  onComplete: () => void
}

function TaskCard({ task, onComplete }: TaskCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50'
      case 'high': return 'text-orange-600 bg-orange-50'
      case 'medium': return 'text-yellow-600 bg-yellow-50'
      default: return 'text-blue-600 bg-blue-50'
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-4 h-4 text-green-600" />
      case 'in_progress': return <Clock className="w-4 h-4 text-blue-600" />
      default: return <AlertCircle className="w-4 h-4 text-gray-400" />
    }
  }

  return (
    <div className={cn('p-3 border rounded-lg', 
      task.status === 'completed' ? 'bg-gray-50 opacity-60' : 'bg-white'
    )}>
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2">
          {getStatusIcon(task.status)}
          <div className="flex-1">
            <p className={cn('text-sm font-medium text-gray-900',
              task.status === 'completed' && 'line-through'
            )}>
              {task.title}
            </p>
            <p className="text-xs text-gray-600 mt-1">{task.assignee}</p>
          </div>
        </div>
        <Badge className={cn('text-xs', getPriorityColor(task.priority))}>
          {task.priority}
        </Badge>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <Calendar className="w-3 h-3" />
          {task.due}
        </div>
        {task.status !== 'completed' && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onComplete}
            className="text-xs h-6 px-2"
          >
            Mark Complete
          </Button>
        )}
      </div>
    </div>
  )
}

interface SectionCardProps {
  section: typeof mockBidData.proposal.sections[0]
  onEdit: () => void
}

function SectionCard({ section, onEdit }: SectionCardProps) {
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-green-100 text-green-700">Completed</Badge>
      case 'in_progress':
        return <Badge className="bg-blue-100 text-blue-700">In Progress</Badge>
      default:
        return <Badge className="bg-gray-100 text-gray-700">Pending</Badge>
    }
  }

  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <h3 className="font-medium text-gray-900">{section.name}</h3>
          {getStatusBadge(section.status)}
        </div>
        <div className="flex items-center justify-between">
          <div className="text-sm text-gray-600">Owner: {section.owner}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={onEdit}
          >
            <Edit3 className="w-3 h-3 mr-1" />
            Edit
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

export default function BidWorkspacePage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [selectedSection, setSelectedSection] = useState<string | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [showResourceLibrary, setShowResourceLibrary] = useState(false)
  const [activeTab, setActiveTab] = useState<'edit' | 'review' | 'comments'>('edit')

  const handleSaveSection = () => {
    toast({
      title: 'Section saved',
      description: 'Your changes have been saved successfully',
    })
  }

  const handleSubmitForReview = () => {
    toast({
      title: 'Submitted for review',
      description: 'Section has been submitted for team review',
    })
  }

  const handleCompleteTask = (taskId: string) => {
    toast({
      title: 'Task completed',
      description: 'Task has been marked as complete',
    })
  }

  const handleStartMeeting = () => {
    toast({
      title: 'Starting meeting',
      description: 'Video conference room is being prepared...',
    })
  }

  const daysUntilDeadline = Math.ceil(
    (new Date(mockBidData.tender.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)
  )

  return (
    <DashboardLayout>
      <div className="min-h-screen bg-gray-50">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.back()}
                className="text-blue-600 hover:text-blue-700"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Back
              </Button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Bid Workspace</h1>
                <div className="flex items-center gap-4 mt-1">
                  <span className="text-sm text-gray-600">{mockBidData.tender.title}</span>
                  <Badge variant="outline" className="text-xs">
                    {daysUntilDeadline} days remaining
                  </Badge>
                </div>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Team Avatars */}
              <div className="flex -space-x-2">
                {mockBidData.team.map(member => (
                  <div
                    key={member.id}
                    className={cn(
                      'w-8 h-8 rounded-full border-2 border-white flex items-center justify-center text-xs font-medium text-white',
                      member.online ? 'bg-blue-600' : 'bg-gray-400'
                    )}
                    title={`${member.name} (${member.online ? 'Online' : 'Offline'})`}
                  >
                    {member.avatar}
                  </div>
                ))}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-3 h-8 px-2"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              
              <Button variant="outline" onClick={handleStartMeeting}>
                <Video className="w-4 h-4 mr-2" />
                Start Meeting
              </Button>
              
              <Button variant="outline">
                <Share2 className="w-4 h-4 mr-2" />
                Share
              </Button>
              
              <Button>
                <Send className="w-4 h-4 mr-2" />
                Submit Proposal
              </Button>
            </div>
          </div>
        </div>

        <div className="flex h-[calc(100vh-120px)]">
          {/* Left Sidebar */}
          <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
            {/* Progress Overview */}
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Overall Progress</h2>
              <Progress value={mockBidData.proposal.completionRate} className="h-2 mb-2" />
              <p className="text-xs text-gray-600">
                {mockBidData.proposal.completionRate}% Complete
              </p>
            </div>

            {/* Proposal Sections */}
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-900 mb-3">Proposal Sections</h2>
              <div className="space-y-2">
                {mockBidData.proposal.sections.map(section => (
                  <div
                    key={section.id}
                    className={cn(
                      'p-2 rounded-lg cursor-pointer transition-colors',
                      selectedSection === section.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
                    )}
                    onClick={() => setSelectedSection(section.id)}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{section.name}</span>
                      {section.status === 'completed' && (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                      )}
                    </div>
                    <p className="text-xs text-gray-600 mt-1">{section.owner}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Tasks */}
            <div className="p-4 border-b">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Tasks</h2>
                <Button variant="ghost" size="sm" className="h-6 text-xs">
                  View All
                </Button>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {mockBidData.tasks.slice(0, 3).map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onComplete={() => handleCompleteTask(task.id)}
                  />
                ))}
              </div>
            </div>

            {/* Resource Library */}
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-900">Resources</h2>
                <Button variant="ghost" size="sm" className="h-6 text-xs">
                  <Plus className="w-3 h-3" />
                </Button>
              </div>
              <div className="space-y-2">
                {mockBidData.resources.map(resource => (
                  <div
                    key={resource.id}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <FileText className="w-4 h-4 text-gray-500" />
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">{resource.name}</p>
                      <p className="text-xs text-gray-500">{resource.items} items</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Editor Area */}
          <div className="flex-1 flex flex-col">
            {/* Editor Toolbar */}
            <div className="bg-white border-b border-gray-200 px-6 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex bg-gray-100 rounded-lg p-1">
                    <Button
                      variant={activeTab === 'edit' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTab('edit')}
                      className="px-3 h-7 text-xs"
                    >
                      Edit
                    </Button>
                    <Button
                      variant={activeTab === 'review' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTab('review')}
                      className="px-3 h-7 text-xs"
                    >
                      Review
                    </Button>
                    <Button
                      variant={activeTab === 'comments' ? 'default' : 'ghost'}
                      size="sm"
                      onClick={() => setActiveTab('comments')}
                      className="px-3 h-7 text-xs"
                    >
                      Comments (3)
                    </Button>
                  </div>
                  
                  <div className="h-6 w-px bg-gray-300" />
                  
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="h-7 px-2">
                      <GitBranch className="w-4 h-4" />
                    </Button>
                    <span className="text-xs text-gray-600">Version 3</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={handleSaveSection}>
                    <Save className="w-4 h-4 mr-1" />
                    Save
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleSubmitForReview}>
                    <CheckSquare className="w-4 h-4 mr-1" />
                    Submit for Review
                  </Button>
                </div>
              </div>
            </div>

            {/* Editor Content */}
            <div className="flex-1 p-6 bg-white overflow-y-auto">
              {selectedSection ? (
                <div className="max-w-4xl mx-auto">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    {mockBidData.proposal.sections.find(s => s.id === selectedSection)?.name}
                  </h2>
                  
                  {activeTab === 'edit' && (
                    <Textarea
                      value={editorContent}
                      onChange={(e) => setEditorContent(e.target.value)}
                      className="min-h-[400px] resize-y"
                      placeholder="Start writing your proposal section here..."
                    />
                  )}
                  
                  {activeTab === 'review' && (
                    <div className="prose max-w-none">
                      <p className="text-gray-600">
                        Review mode shows the formatted version of your proposal section.
                        Switch to Edit mode to make changes.
                      </p>
                    </div>
                  )}
                  
                  {activeTab === 'comments' && (
                    <div className="space-y-4">
                      <div className="border-l-4 border-blue-500 pl-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">Sarah Chen</span>
                          <span className="text-xs text-gray-500">2 hours ago</span>
                        </div>
                        <p className="text-sm text-gray-700">
                          Great start! Can we add more details about our cloud migration methodology?
                        </p>
                      </div>
                      
                      <div className="border-l-4 border-blue-500 pl-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">Michael Ross</span>
                          <span className="text-xs text-gray-500">1 hour ago</span>
                        </div>
                        <p className="text-sm text-gray-700">
                          I've added the technical requirements section. Please review.
                        </p>
                      </div>
                      
                      <div className="mt-4 pt-4 border-t">
                        <Textarea
                          placeholder="Add a comment..."
                          rows={3}
                          className="mb-2"
                        />
                        <Button size="sm">Post Comment</Button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <FileText className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-gray-900 mb-2">
                      Select a section to start editing
                    </h3>
                    <p className="text-sm text-gray-600">
                      Choose a proposal section from the sidebar to begin collaborating
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Sidebar - Activity Feed */}
          <div className="w-80 bg-white border-l border-gray-200 overflow-y-auto">
            <div className="p-4 border-b">
              <h2 className="text-sm font-semibold text-gray-900">Recent Activity</h2>
            </div>
            
            <div className="p-4">
              <div className="space-y-3">
                {mockBidData.recentActivity.map(activity => (
                  <div key={activity.id} className="flex items-start gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-600">
                      {activity.user.split(' ').map(n => n[0]).join('')}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-gray-900">
                        <span className="font-medium">{activity.user}</span>{' '}
                        {activity.action}{' '}
                        <span className="font-medium">{activity.target}</span>
                      </p>
                      <p className="text-xs text-gray-500">{activity.time}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="p-4 border-t">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Bid Statistics</h3>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Team Members</span>
                  <span className="text-sm font-medium text-gray-900">
                    {mockBidData.team.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Sections Complete</span>
                  <span className="text-sm font-medium text-gray-900">
                    {mockBidData.proposal.sections.filter(s => s.status === 'completed').length}/{mockBidData.proposal.sections.length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Open Tasks</span>
                  <span className="text-sm font-medium text-gray-900">
                    {mockBidData.tasks.filter(t => t.status !== 'completed').length}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Est. Value</span>
                  <span className="text-sm font-medium text-gray-900">
                    ${(mockBidData.tender.value / 1000).toFixed(0)}K
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}