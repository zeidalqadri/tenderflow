'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useToast } from '@/hooks/use-toast'
import {
  Bell,
  Mail,
  MessageSquare,
  Smartphone,
  Globe,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Settings,
  Plus,
  Filter,
  ChevronRight,
  TrendingUp,
  Users,
  Zap,
  Shield,
  Activity,
  Volume2,
  Edit,
  Trash2,
  MoreVertical,
  ChevronLeft
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Mock alert rules data
const mockAlertRules = [
  {
    id: 'alert-001',
    name: 'High-Value Tender Alert',
    description: 'Notify when tenders above $500K are discovered',
    enabled: true,
    priority: 'high',
    channels: ['email', 'sms', 'app'],
    conditions: {
      type: 'tender_value',
      operator: 'greater_than',
      value: 500000
    },
    recipients: ['Sarah Chen', 'Michael Ross'],
    lastTriggered: '2024-02-24T10:30:00Z',
    triggerCount: 12
  },
  {
    id: 'alert-002',
    name: 'Deadline Approaching',
    description: 'Alert 7 days before tender closing',
    enabled: true,
    priority: 'critical',
    channels: ['email', 'app', 'slack'],
    conditions: {
      type: 'deadline',
      operator: 'days_before',
      value: 7
    },
    recipients: ['Team Lead', 'Bid Manager'],
    lastTriggered: '2024-02-23T14:15:00Z',
    triggerCount: 28
  },
  {
    id: 'alert-003',
    name: 'Government Tender Match',
    description: 'Alert for all government sector tenders',
    enabled: true,
    priority: 'medium',
    channels: ['email'],
    conditions: {
      type: 'category',
      operator: 'equals',
      value: 'Government'
    },
    recipients: ['Emily Johnson'],
    lastTriggered: '2024-02-24T08:00:00Z',
    triggerCount: 45
  },
  {
    id: 'alert-004',
    name: 'Urgent Action Required',
    description: 'Critical tenders requiring immediate attention',
    enabled: false,
    priority: 'critical',
    channels: ['sms', 'phone'],
    conditions: {
      type: 'priority',
      operator: 'equals',
      value: 'urgent'
    },
    recipients: ['Executive Team'],
    lastTriggered: '2024-02-20T16:45:00Z',
    triggerCount: 5
  }
]

// Mock recent alerts
const mockRecentAlerts = [
  {
    id: 'recent-001',
    rule: 'High-Value Tender Alert',
    message: 'New $850K tender: Cloud Infrastructure Modernization',
    timestamp: '2024-02-24T11:30:00Z',
    status: 'sent',
    channels: ['email', 'app']
  },
  {
    id: 'recent-002',
    rule: 'Deadline Approaching',
    message: 'Tender closing in 5 days: Digital Transformation Consulting',
    timestamp: '2024-02-24T09:00:00Z',
    status: 'sent',
    channels: ['email', 'slack']
  },
  {
    id: 'recent-003',
    rule: 'Government Tender Match',
    message: '3 new government tenders matched your criteria',
    timestamp: '2024-02-24T08:15:00Z',
    status: 'sent',
    channels: ['email']
  },
  {
    id: 'recent-004',
    rule: 'High-Value Tender Alert',
    message: 'New $1.2M tender: Enterprise Software Development',
    timestamp: '2024-02-23T16:20:00Z',
    status: 'failed',
    channels: ['sms']
  }
]

// Mock escalation paths
const mockEscalationPaths = [
  {
    id: 'esc-001',
    name: 'Critical Tender Escalation',
    levels: [
      { level: 1, delay: 0, recipients: ['Bid Manager'], channels: ['email', 'app'] },
      { level: 2, delay: 30, recipients: ['Team Lead'], channels: ['email', 'sms'] },
      { level: 3, delay: 60, recipients: ['Executive'], channels: ['phone'] }
    ]
  },
  {
    id: 'esc-002',
    name: 'Standard Review Process',
    levels: [
      { level: 1, delay: 0, recipients: ['Analyst'], channels: ['email'] },
      { level: 2, delay: 120, recipients: ['Manager'], channels: ['email', 'app'] }
    ]
  }
]

interface AlertRuleCardProps {
  rule: typeof mockAlertRules[0]
  onEdit: () => void
  onDelete: () => void
  onToggle: () => void
}

function AlertRuleCard({ rule, onEdit, onDelete, onToggle }: AlertRuleCardProps) {
  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      case 'high': return 'text-orange-600 bg-orange-50 border-orange-200'
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200'
      default: return 'text-blue-600 bg-blue-50 border-blue-200'
    }
  }

  const getChannelIcon = (channel: string) => {
    switch (channel) {
      case 'email': return <Mail className="w-4 h-4" />
      case 'sms': return <Smartphone className="w-4 h-4" />
      case 'app': return <Bell className="w-4 h-4" />
      case 'slack': return <MessageSquare className="w-4 h-4" />
      case 'phone': return <Volume2 className="w-4 h-4" />
      default: return <Globe className="w-4 h-4" />
    }
  }

  return (
    <Card className={cn('transition-opacity', !rule.enabled && 'opacity-60')}>
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className={cn('w-2 h-2 rounded-full mt-2', 
              rule.enabled ? 'bg-green-500' : 'bg-gray-400'
            )} />
            <div className="flex-1">
              <h3 className="font-semibold text-gray-900">{rule.name}</h3>
              <p className="text-sm text-gray-600 mt-1">{rule.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={getPriorityColor(rule.priority)}>
              {rule.priority}
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-gray-500">Channels:</span>
            <div className="flex items-center gap-1">
              {rule.channels.map(channel => (
                <div key={channel} className="text-gray-700">
                  {getChannelIcon(channel)}
                </div>
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">{rule.recipients.length} recipients</span>
          </div>

          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">{rule.triggerCount} triggers</span>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4 pt-3 border-t">
          <div className="text-xs text-gray-500">
            Last triggered: {new Date(rule.lastTriggered).toLocaleString()}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggle}
              className="text-xs"
            >
              {rule.enabled ? 'Disable' : 'Enable'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onEdit}
              className="text-xs"
            >
              <Edit className="w-3 h-3 mr-1" />
              Edit
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="text-xs text-red-600 hover:text-red-700"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

export default function AlertsPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [selectedTab, setSelectedTab] = useState<'rules' | 'recent' | 'escalation'>('rules')
  const [filterPriority, setFilterPriority] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [showCreateModal, setShowCreateModal] = useState(false)

  const handleCreateAlert = () => {
    toast({
      title: 'Alert rule created',
      description: 'New alert rule has been created successfully',
    })
    setShowCreateModal(false)
  }

  const handleEditAlert = (ruleId: string) => {
    toast({
      title: 'Edit alert',
      description: `Editing alert rule ${ruleId}`,
    })
  }

  const handleDeleteAlert = (ruleId: string) => {
    toast({
      title: 'Alert deleted',
      description: 'Alert rule has been deleted',
      variant: 'destructive'
    })
  }

  const handleToggleAlert = (ruleId: string) => {
    const rule = mockAlertRules.find(r => r.id === ruleId)
    toast({
      title: rule?.enabled ? 'Alert disabled' : 'Alert enabled',
      description: `Alert rule has been ${rule?.enabled ? 'disabled' : 'enabled'}`,
    })
  }

  const handleTestAlert = () => {
    toast({
      title: 'Test alert sent',
      description: 'Test notification has been sent to all configured channels',
    })
  }

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
                <h1 className="text-2xl font-bold text-gray-900">Alert Management</h1>
                <p className="text-sm text-gray-600 mt-1">
                  Configure multi-channel notifications and escalation workflows
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button
                variant="outline"
                onClick={handleTestAlert}
              >
                <Zap className="w-4 h-4 mr-2" />
                Test Alerts
              </Button>
              <Button onClick={() => setShowCreateModal(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Create Alert Rule
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="p-6">
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Active Rules</p>
                    <p className="text-2xl font-bold text-gray-900">12</p>
                  </div>
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Bell className="w-5 h-5 text-blue-600" />
                  </div>
                </div>
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  +3 this week
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Alerts Sent</p>
                    <p className="text-2xl font-bold text-gray-900">148</p>
                  </div>
                  <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                </div>
                <div className="mt-2 text-xs text-gray-600">
                  Last 7 days
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Critical Alerts</p>
                    <p className="text-2xl font-bold text-gray-900">5</p>
                  </div>
                  <div className="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                  </div>
                </div>
                <div className="mt-2 text-xs text-orange-600">
                  2 require attention
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Avg Response</p>
                    <p className="text-2xl font-bold text-gray-900">8m</p>
                  </div>
                  <div className="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Clock className="w-5 h-5 text-purple-600" />
                  </div>
                </div>
                <div className="mt-2 text-xs text-green-600 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" />
                  23% faster
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-6">
            <div className="flex bg-white rounded-lg border border-gray-200 p-1">
              <Button
                variant={selectedTab === 'rules' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTab('rules')}
                className="px-4"
              >
                Alert Rules
              </Button>
              <Button
                variant={selectedTab === 'recent' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTab('recent')}
                className="px-4"
              >
                Recent Alerts
              </Button>
              <Button
                variant={selectedTab === 'escalation' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setSelectedTab('escalation')}
                className="px-4"
              >
                Escalation Paths
              </Button>
            </div>

            <div className="flex-1 flex items-center gap-3">
              <Input
                placeholder="Search alerts..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="max-w-xs"
              />
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                Filter
              </Button>
            </div>
          </div>

          {/* Content based on selected tab */}
          {selectedTab === 'rules' && (
            <div className="space-y-4">
              {mockAlertRules.map(rule => (
                <AlertRuleCard
                  key={rule.id}
                  rule={rule}
                  onEdit={() => handleEditAlert(rule.id)}
                  onDelete={() => handleDeleteAlert(rule.id)}
                  onToggle={() => handleToggleAlert(rule.id)}
                />
              ))}
            </div>
          )}

          {selectedTab === 'recent' && (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Status</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Alert Rule</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Message</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Channels</th>
                        <th className="text-left p-4 text-sm font-medium text-gray-700">Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {mockRecentAlerts.map(alert => (
                        <tr key={alert.id} className="border-b hover:bg-gray-50">
                          <td className="p-4">
                            <Badge
                              variant={alert.status === 'sent' ? 'default' : 'destructive'}
                              className="text-xs"
                            >
                              {alert.status}
                            </Badge>
                          </td>
                          <td className="p-4 text-sm font-medium text-gray-900">
                            {alert.rule}
                          </td>
                          <td className="p-4 text-sm text-gray-600">
                            {alert.message}
                          </td>
                          <td className="p-4">
                            <div className="flex items-center gap-1">
                              {alert.channels.map(channel => (
                                <Badge key={channel} variant="outline" className="text-xs">
                                  {channel}
                                </Badge>
                              ))}
                            </div>
                          </td>
                          <td className="p-4 text-sm text-gray-500">
                            {new Date(alert.timestamp).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {selectedTab === 'escalation' && (
            <div className="grid grid-cols-2 gap-6">
              {mockEscalationPaths.map(path => (
                <Card key={path.id}>
                  <CardHeader>
                    <CardTitle className="text-base">{path.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {path.levels.map((level, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-semibold text-blue-600">
                            {level.level}
                          </div>
                          <div className="flex-1">
                            <div className="text-sm font-medium text-gray-900">
                              {level.recipients.join(', ')}
                            </div>
                            <div className="text-xs text-gray-600">
                              {level.delay > 0 ? `After ${level.delay}m • ` : 'Immediate • '}
                              {level.channels.join(', ')}
                            </div>
                          </div>
                          {index < path.levels.length - 1 && (
                            <ChevronRight className="w-4 h-4 text-gray-400" />
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="mt-4 pt-3 border-t">
                      <Button variant="outline" size="sm" className="w-full">
                        <Settings className="w-4 h-4 mr-2" />
                        Configure
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
              
              <Card className="border-dashed border-2 bg-gray-50">
                <CardContent className="p-6 text-center">
                  <div className="w-12 h-12 bg-gray-200 rounded-lg mx-auto mb-3 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-gray-600" />
                  </div>
                  <h3 className="font-medium text-gray-900 mb-2">Create Escalation Path</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    Define multi-level escalation workflows
                  </p>
                  <Button variant="outline">Create Path</Button>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}