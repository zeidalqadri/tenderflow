'use client'

import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { 
  FileText,
  Upload,
  Download,
  Search,
  Folder,
  File,
  Eye,
  Edit,
  Trash2,
  Share,
  Filter,
  Star,
  Clock,
  User
} from 'lucide-react'

export default function DocsPage() {
  // Mock data for documents
  const documents = [
    {
      id: 1,
      name: "Technical Specifications Template.docx",
      type: "template",
      size: "2.4 MB",
      modified: "2024-01-10",
      modifiedBy: "John Doe",
      category: "Templates",
      starred: true
    },
    {
      id: 2,
      name: "Infrastructure Project Proposal.pdf",
      type: "proposal",
      size: "8.7 MB",
      modified: "2024-01-08",
      modifiedBy: "Jane Smith",
      category: "Proposals",
      starred: false
    },
    {
      id: 3,
      name: "Compliance Requirements Checklist.xlsx",
      type: "checklist",
      size: "1.2 MB",
      modified: "2024-01-05",
      modifiedBy: "Mike Johnson",
      category: "Compliance",
      starred: true
    },
    {
      id: 4,
      name: "Budget Analysis Q4 2023.xlsx",
      type: "analysis",
      size: "3.1 MB",
      modified: "2023-12-28",
      modifiedBy: "Sarah Wilson",
      category: "Financial",
      starred: false
    }
  ]

  const categories = [
    { name: "All Documents", count: 24, active: true },
    { name: "Templates", count: 8, active: false },
    { name: "Proposals", count: 12, active: false },
    { name: "Compliance", count: 6, active: false },
    { name: "Financial", count: 4, active: false },
    { name: "Legal", count: 3, active: false }
  ]

  const getFileIcon = (type: string) => {
    switch (type) {
      case 'template': return <FileText className="h-5 w-5 text-blue-600" />
      case 'proposal': return <File className="h-5 w-5 text-green-600" />
      case 'checklist': return <FileText className="h-5 w-5 text-purple-600" />
      case 'analysis': return <FileText className="h-5 w-5 text-orange-600" />
      default: return <File className="h-5 w-5 text-gray-600" />
    }
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">📄 Document Hub</h1>
          <p className="text-gray-600">Centralized document management for all your tender-related files</p>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Documents</p>
                  <p className="text-2xl font-bold text-gray-900">248</p>
                </div>
                <FileText className="h-8 w-8 text-blue-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Templates</p>
                  <p className="text-2xl font-bold text-green-600">32</p>
                </div>
                <Folder className="h-8 w-8 text-green-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Shared Files</p>
                  <p className="text-2xl font-bold text-purple-600">18</p>
                </div>
                <Share className="h-8 w-8 text-purple-600" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Storage Used</p>
                  <p className="text-2xl font-bold text-orange-600">2.8 GB</p>
                </div>
                <Upload className="h-8 w-8 text-orange-600" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar */}
          <div className="lg:col-span-1">
            <Card>
              <CardHeader>
                <CardTitle>Categories</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {categories.map((category) => (
                    <div
                      key={category.name}
                      className={`flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                        category.active ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-sm font-medium">{category.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {category.count}
                      </Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button className="w-full justify-start">
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <FileText className="mr-2 h-4 w-4" />
                  New Template
                </Button>
                <Button variant="outline" className="w-full justify-start">
                  <Folder className="mr-2 h-4 w-4" />
                  Create Folder
                </Button>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3">
            {/* Search and Filters */}
            <Card className="mb-6">
              <CardContent className="p-4">
                <div className="flex gap-4">
                  <div className="flex-1">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                      <Input
                        placeholder="Search documents..."
                        className="pl-10"
                      />
                    </div>
                  </div>
                  <Button variant="outline">
                    <Filter className="mr-2 h-4 w-4" />
                    Filter
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>Your most recently accessed and modified files</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50">
                      <div className="flex items-center gap-4 flex-1">
                        {getFileIcon(doc.type)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-gray-900 truncate">{doc.name}</h3>
                            {doc.starred && <Star className="h-4 w-4 text-yellow-500 fill-current" />}
                          </div>
                          <div className="flex items-center gap-4 text-sm text-gray-600">
                            <span>{doc.size}</span>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {doc.modified}
                            </div>
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {doc.modifiedBy}
                            </div>
                          </div>
                          <Badge variant="outline" className="mt-1">
                            {doc.category}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Download className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button variant="outline" size="sm">
                          <Share className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Storage Usage */}
            <Card className="mt-6">
              <CardHeader>
                <CardTitle>Storage Usage</CardTitle>
                <CardDescription>Monitor your document storage consumption</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Documents</span>
                      <span>2.1 GB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-blue-500 h-2 rounded-full" style={{ width: '75%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Templates</span>
                      <span>0.5 GB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-green-500 h-2 rounded-full" style={{ width: '18%' }}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span>Archives</span>
                      <span>0.2 GB</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div className="bg-purple-500 h-2 rounded-full" style={{ width: '7%' }}></div>
                    </div>
                  </div>
                  <div className="pt-4 border-t">
                    <div className="flex justify-between font-medium">
                      <span>Total Used</span>
                      <span>2.8 GB / 10 GB</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}