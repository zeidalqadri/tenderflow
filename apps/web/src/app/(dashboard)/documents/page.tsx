'use client'

import React, { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { useToast } from '@/hooks/use-toast'
import {
  FileText,
  Upload,
  Download,
  Eye,
  Edit,
  Trash2,
  Search,
  Filter,
  FolderOpen,
  Grid,
  List,
  Clock,
  CheckCircle,
  AlertCircle,
  FileImage,
  FileSpreadsheet,
  File,
  GitBranch,
  MessageSquare,
  Share2,
  Lock,
  Unlock,
  RefreshCw,
  ScanLine,
  Brain,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Star,
  Copy,
  Move,
  Archive
} from 'lucide-react'
import { cn } from '@/lib/utils'

// Mock document data
const mockDocuments = [
  {
    id: 'doc-001',
    name: 'RFP_Cloud_Infrastructure_2024.pdf',
    type: 'pdf',
    size: '2.4 MB',
    status: 'processed',
    ocrStatus: 'completed',
    confidence: 98,
    version: 'v3',
    tender: 'Cloud Infrastructure Modernization',
    uploadedBy: 'Sarah Chen',
    uploadedAt: '2024-02-24T10:00:00Z',
    lastModified: '2024-02-24T14:30:00Z',
    tags: ['RFP', 'Government', 'Cloud'],
    annotations: 5,
    shared: true,
    locked: false
  },
  {
    id: 'doc-002',
    name: 'Technical_Requirements.xlsx',
    type: 'excel',
    size: '856 KB',
    status: 'processed',
    ocrStatus: 'not_required',
    confidence: null,
    version: 'v2',
    tender: 'Digital Transformation Consulting',
    uploadedBy: 'Michael Ross',
    uploadedAt: '2024-02-23T15:20:00Z',
    lastModified: '2024-02-24T09:15:00Z',
    tags: ['Requirements', 'Technical'],
    annotations: 3,
    shared: true,
    locked: true
  },
  {
    id: 'doc-003',
    name: 'Budget_Breakdown_Scanned.pdf',
    type: 'pdf',
    size: '5.1 MB',
    status: 'processing',
    ocrStatus: 'in_progress',
    confidence: 72,
    version: 'v1',
    tender: 'Enterprise Software Development',
    uploadedBy: 'Emily Johnson',
    uploadedAt: '2024-02-24T11:45:00Z',
    lastModified: '2024-02-24T11:45:00Z',
    tags: ['Budget', 'Financial'],
    annotations: 0,
    shared: false,
    locked: false
  },
  {
    id: 'doc-004',
    name: 'Compliance_Checklist.docx',
    type: 'word',
    size: '342 KB',
    status: 'pending',
    ocrStatus: 'queued',
    confidence: null,
    version: 'v1',
    tender: 'Cybersecurity Assessment',
    uploadedBy: 'David Kim',
    uploadedAt: '2024-02-24T12:00:00Z',
    lastModified: '2024-02-24T12:00:00Z',
    tags: ['Compliance', 'Checklist'],
    annotations: 0,
    shared: false,
    locked: false
  }
]

// Mock templates
const mockTemplates = [
  { id: 'tpl-001', name: 'Standard RFP Response', category: 'Response', uses: 45 },
  { id: 'tpl-002', name: 'Technical Proposal', category: 'Proposal', uses: 32 },
  { id: 'tpl-003', name: 'Budget Template', category: 'Financial', uses: 28 },
  { id: 'tpl-004', name: 'Compliance Matrix', category: 'Compliance', uses: 19 }
]

interface DocumentCardProps {
  document: typeof mockDocuments[0]
  viewMode: 'grid' | 'list'
  onView: () => void
  onEdit: () => void
  onDelete: () => void
}

function DocumentCard({ document, viewMode, onView, onEdit, onDelete }: DocumentCardProps) {
  const getFileIcon = (type: string) => {
    switch (type) {
      case 'pdf': return <FileText className="w-5 h-5 text-red-600" />
      case 'excel': return <FileSpreadsheet className="w-5 h-5 text-green-600" />
      case 'word': return <FileText className="w-5 h-5 text-blue-600" />
      case 'image': return <FileImage className="w-5 h-5 text-purple-600" />
      default: return <File className="w-5 h-5 text-gray-600" />
    }
  }

  const getOCRStatusBadge = () => {
    switch (document.ocrStatus) {
      case 'completed':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            <CheckCircle className="w-3 h-3 mr-1" />
            OCR Complete {document.confidence && `(${document.confidence}%)`}
          </Badge>
        )
      case 'in_progress':
        return (
          <Badge className="bg-blue-100 text-blue-700 border-blue-200">
            <RefreshCw className="w-3 h-3 mr-1 animate-spin" />
            OCR Processing
          </Badge>
        )
      case 'queued':
        return (
          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
            <Clock className="w-3 h-3 mr-1" />
            OCR Queued
          </Badge>
        )
      case 'not_required':
        return null
      default:
        return null
    }
  }

  if (viewMode === 'grid') {
    return (
      <Card className="hover:shadow-lg transition-shadow cursor-pointer" onClick={onView}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between mb-3">
            {getFileIcon(document.type)}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={(e) => {
                e.stopPropagation()
              }}
            >
              <MoreVertical className="w-4 h-4" />
            </Button>
          </div>
          
          <h3 className="font-medium text-gray-900 mb-1 truncate" title={document.name}>
            {document.name}
          </h3>
          
          <p className="text-xs text-gray-600 mb-3">{document.size} • {document.version}</p>
          
          {getOCRStatusBadge()}
          
          <div className="flex items-center justify-between mt-3 pt-3 border-t">
            <div className="flex items-center gap-2">
              {document.locked ? (
                <Lock className="w-3 h-3 text-gray-500" />
              ) : (
                <Unlock className="w-3 h-3 text-gray-500" />
              )}
              {document.shared && <Share2 className="w-3 h-3 text-blue-600" />}
              {document.annotations > 0 && (
                <div className="flex items-center gap-1">
                  <MessageSquare className="w-3 h-3 text-gray-500" />
                  <span className="text-xs text-gray-600">{document.annotations}</span>
                </div>
              )}
            </div>
            <div className="text-xs text-gray-500">
              {new Date(document.lastModified).toLocaleDateString()}
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <tr className="border-b hover:bg-gray-50">
      <td className="p-4">
        <div className="flex items-center gap-3">
          {getFileIcon(document.type)}
          <div>
            <div className="font-medium text-gray-900">{document.name}</div>
            <div className="text-sm text-gray-600">{document.tender}</div>
          </div>
        </div>
      </td>
      <td className="p-4">
        <div className="text-sm text-gray-600">{document.size}</div>
      </td>
      <td className="p-4">
        {getOCRStatusBadge()}
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{document.version}</Badge>
          <GitBranch className="w-3 h-3 text-gray-500" />
        </div>
      </td>
      <td className="p-4">
        <div className="text-sm text-gray-600">{document.uploadedBy}</div>
        <div className="text-xs text-gray-500">
          {new Date(document.uploadedAt).toLocaleDateString()}
        </div>
      </td>
      <td className="p-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onView}>
            <Eye className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onEdit}>
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onDelete}>
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </td>
    </tr>
  )
}

export default function DocumentsPage() {
  const router = useRouter()
  const { toast } = useToast()
  
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isUploading, setIsUploading] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true)
    } else if (e.type === "dragleave") {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files)
    }
  }, [])

  const handleFileUpload = (files: FileList) => {
    setIsUploading(true)
    setUploadProgress(0)
    
    // Simulate upload progress
    const interval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsUploading(false)
          toast({
            title: 'Upload complete',
            description: `${files.length} file(s) uploaded successfully`,
          })
          return 100
        }
        return prev + 10
      })
    }, 200)
  }

  const handleOCRProcess = (docId: string) => {
    toast({
      title: 'OCR processing started',
      description: 'Document text extraction in progress',
    })
  }

  const handleViewDocument = (docId: string) => {
    router.push(`/documents/${docId}`)
  }

  const handleEditDocument = (docId: string) => {
    toast({
      title: 'Opening editor',
      description: `Editing document ${docId}`,
    })
  }

  const handleDeleteDocument = (docId: string) => {
    toast({
      title: 'Document deleted',
      description: 'Document has been moved to trash',
      variant: 'destructive'
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
                <h1 className="text-2xl font-bold text-gray-900">Document Management</h1>
                <p className="text-sm text-gray-600 mt-1">
                  OCR processing, version control, and collaborative annotations
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export All
              </Button>
              <Button>
                <Upload className="w-4 h-4 mr-2" />
                Upload Documents
              </Button>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="p-6">
          <div className="grid grid-cols-5 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Documents</p>
                    <p className="text-2xl font-bold text-gray-900">142</p>
                  </div>
                  <FileText className="w-8 h-8 text-blue-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">OCR Processed</p>
                    <p className="text-2xl font-bold text-gray-900">89</p>
                  </div>
                  <ScanLine className="w-8 h-8 text-green-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Annotations</p>
                    <p className="text-2xl font-bold text-gray-900">234</p>
                  </div>
                  <MessageSquare className="w-8 h-8 text-purple-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Templates</p>
                    <p className="text-2xl font-bold text-gray-900">12</p>
                  </div>
                  <Copy className="w-8 h-8 text-orange-600 opacity-20" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Storage Used</p>
                    <p className="text-2xl font-bold text-gray-900">2.3GB</p>
                  </div>
                  <Archive className="w-8 h-8 text-gray-600 opacity-20" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upload Area */}
          <div
            className={cn(
              'border-2 border-dashed rounded-lg p-8 mb-6 text-center transition-colors',
              dragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-white'
            )}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            {isUploading ? (
              <div className="max-w-xs mx-auto">
                <RefreshCw className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
                <p className="font-medium text-gray-900 mb-2">Uploading documents...</p>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm text-gray-600 mt-2">{uploadProgress}% complete</p>
              </div>
            ) : (
              <>
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="font-medium text-gray-900 mb-2">
                  Drop files here or click to browse
                </p>
                <p className="text-sm text-gray-600">
                  Supports PDF, Word, Excel, Images • Max 50MB per file
                </p>
                <input
                  type="file"
                  multiple
                  className="hidden"
                  onChange={(e) => e.target.files && handleFileUpload(e.target.files)}
                  id="file-upload"
                />
                <label htmlFor="file-upload">
                  <Button className="mt-4" asChild>
                    <span>Select Files</span>
                  </Button>
                </label>
              </>
            )}
          </div>

          {/* Filters and View Toggle */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search documents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64"
                icon={<Search className="w-4 h-4" />}
              />
              
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md text-sm"
              >
                <option value="all">All Categories</option>
                <option value="rfp">RFP Documents</option>
                <option value="technical">Technical</option>
                <option value="financial">Financial</option>
                <option value="compliance">Compliance</option>
              </select>
              
              <Button variant="outline" size="sm">
                <Filter className="w-4 h-4 mr-2" />
                More Filters
              </Button>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('grid')}
              >
                <Grid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Documents */}
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-4 gap-4">
              {mockDocuments.map(doc => (
                <DocumentCard
                  key={doc.id}
                  document={doc}
                  viewMode="grid"
                  onView={() => handleViewDocument(doc.id)}
                  onEdit={() => handleEditDocument(doc.id)}
                  onDelete={() => handleDeleteDocument(doc.id)}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-4 text-sm font-medium text-gray-700">Document</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-700">Size</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-700">OCR Status</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-700">Version</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-700">Uploaded</th>
                      <th className="text-left p-4 text-sm font-medium text-gray-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mockDocuments.map(doc => (
                      <DocumentCard
                        key={doc.id}
                        document={doc}
                        viewMode="list"
                        onView={() => handleViewDocument(doc.id)}
                        onEdit={() => handleEditDocument(doc.id)}
                        onDelete={() => handleDeleteDocument(doc.id)}
                      />
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}

          {/* Templates Section */}
          <div className="mt-8">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Document Templates</h2>
            <div className="grid grid-cols-4 gap-4">
              {mockTemplates.map(template => (
                <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-3">
                      <Copy className="w-5 h-5 text-blue-600" />
                      <Badge variant="outline" className="text-xs">
                        {template.uses} uses
                      </Badge>
                    </div>
                    <h3 className="font-medium text-gray-900 mb-1">{template.name}</h3>
                    <p className="text-sm text-gray-600">{template.category}</p>
                    <Button variant="outline" size="sm" className="w-full mt-3">
                      Use Template
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}