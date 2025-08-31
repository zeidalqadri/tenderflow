'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { 
  Check, 
  X, 
  RefreshCw, 
  Search, 
  Lightbulb, 
  ExternalLink,
  Calendar,
  DollarSign,
  Building,
  FileText,
  Globe,
  Tag,
  ArrowRight,
  AlertTriangle
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { useTender, useUpdateTender } from '@/hooks/use-api'
import { useUIStore } from '@/stores/ui-store'
import { DashboardLayout } from '@/components/layout/dashboard-layout'
import { formatDate, formatCurrency, cn } from '@/lib/utils'

const validationSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  description: z.string().optional(),
  buyer: z.string().min(1, 'Buyer is required'),
  deadline: z.string().min(1, 'Deadline is required'), // Will be converted to Date
  budget: z.number().positive().optional(),
  category: z.string().optional(),
  region: z.string().optional(),
  sourceUrl: z.string().url().optional().or(z.literal('')),
})

type ValidationFormData = z.infer<typeof validationSchema>

interface ValidationFieldProps {
  label: string
  icon: React.ComponentType<{ className?: string }>
  field: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
  validated: boolean
  onValidate: () => void
  onSuggest: () => void
  onLookup: () => void
  onNormalize: () => void
  error?: string
  suggestions?: string[]
  required?: boolean
  multiline?: boolean
}

function ValidationField({
  label,
  icon: Icon,
  field,
  value,
  onChange,
  placeholder,
  type = 'text',
  validated,
  onValidate,
  onSuggest,
  onLookup,
  onNormalize,
  error,
  suggestions = [],
  required = false,
  multiline = false
}: ValidationFieldProps) {
  const [showSuggestions, setShowSuggestions] = useState(false)

  const InputComponent = multiline ? Textarea : Input

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-muted/50 transition-colors">
        {/* Validation Checkbox */}
        <div className="flex items-center">
          <input
            type="checkbox"
            checked={validated}
            onChange={onValidate}
            className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
            aria-label={`Mark ${label} as validated`}
          />
        </div>

        {/* Field Label with Icon */}
        <div className="flex items-center gap-2 min-w-[160px]">
          <Icon className="h-4 w-4 text-muted-foreground" />
          <label className="text-sm font-medium">
            {label}
            {required && <span className="text-red-500 ml-1">*</span>}
          </label>
        </div>

        {/* Input Field */}
        <div className="flex-1 relative">
          <InputComponent
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder || `Enter ${label.toLowerCase()}`}
            className={cn(
              'w-full',
              error && 'border-red-500 focus:border-red-500',
              validated && 'border-green-500 bg-green-50 dark:bg-green-950/20'
            )}
            onFocus={() => setShowSuggestions(suggestions.length > 0)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          />
          
          {/* Suggestions Dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-10 mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-40 overflow-y-auto">
              {suggestions.map((suggestion, index) => (
                <button
                  key={index}
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  onClick={() => {
                    onChange(suggestion)
                    setShowSuggestions(false)
                  }}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onSuggest}
            title="Get AI suggestions"
          >
            <Lightbulb className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onLookup}
            title="Lookup external data"
          >
            <Search className="h-3 w-3" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onNormalize}
            title="Normalize format"
          >
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 text-sm text-red-600 ml-6">
          <AlertTriangle className="h-4 w-4" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

export default function ValidatePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tenderId = searchParams.get('tender')
  const { showNotes, addNotification } = useUIStore()

  // Mock validation state
  const [validatedFields, setValidatedFields] = useState(new Set<string>())
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({
    buyer: ['Ministry of Digital Development', 'Municipal Works Department', 'State IT Center'],
    category: ['IT Services', 'Construction', 'Consulting', 'Equipment'],
    region: ['Almaty', 'Nur-Sultan', 'Karaganda', 'Shymkent'],
  })

  // Fetch tender data if ID provided
  const { data: tenderResponse, isLoading } = useTender(tenderId || '', { 
    enabled: !!tenderId 
  })
  const tender = tenderResponse?.data

  // Form setup
  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting }
  } = useForm<ValidationFormData>({
    resolver: zodResolver(validationSchema),
    defaultValues: tender ? {
      title: tender.title,
      description: tender.description || '',
      buyer: '', // Mock field - would come from API
      deadline: formatDate(tender.deadline),
      budget: tender.budget || undefined,
      category: '',
      region: '',
      sourceUrl: '',
    } : {
      title: 'Fiber Backbone Upgrade, Almaty',
      description: 'Major infrastructure upgrade for high-speed internet connectivity across Almaty region',
      buyer: 'Ministry of Digital Development',
      deadline: '2025-09-14',
      budget: 420000000,
      category: 'IT Services',
      region: 'Almaty',
      sourceUrl: 'https://goszakup.gov.kz/tender/123456',
    }
  })

  const updateTenderMutation = useUpdateTender()

  const watchedValues = watch()

  // Validation field configurations
  const validationFields = [
    {
      field: 'title',
      label: 'Title',
      icon: FileText,
      placeholder: 'Enter tender title',
      required: true,
    },
    {
      field: 'buyer',
      label: 'Buyer',
      icon: Building,
      placeholder: 'Enter buyer organization',
      required: true,
      suggestions: suggestions.buyer,
    },
    {
      field: 'deadline',
      label: 'Deadline (UTC)',
      icon: Calendar,
      type: 'date',
      required: true,
    },
    {
      field: 'budget',
      label: 'Budget',
      icon: DollarSign,
      type: 'number',
      placeholder: 'Enter budget amount',
    },
    {
      field: 'category',
      label: 'CPV/Category',
      icon: Tag,
      placeholder: 'Select or enter category',
      suggestions: suggestions.category,
    },
    {
      field: 'region',
      label: 'Country/Region',
      icon: Globe,
      placeholder: 'Enter region',
      suggestions: suggestions.region,
    },
    {
      field: 'sourceUrl',
      label: 'Source URL',
      icon: ExternalLink,
      type: 'url',
      placeholder: 'Enter source URL',
    },
  ]

  const completionRate = (validatedFields.size / validationFields.length) * 100
  const requiredFields = validationFields.filter(f => f.required)
  const requiredValidated = requiredFields.filter(f => validatedFields.has(f.field)).length
  const canAdvance = requiredValidated === requiredFields.length

  const handleFieldValidation = (field: string) => {
    setValidatedFields(prev => {
      const next = new Set(prev)
      if (next.has(field)) {
        next.delete(field)
      } else {
        next.add(field)
      }
      return next
    })
  }

  const handleSuggest = (field: string) => {
    // Mock AI suggestions
    addNotification({
      type: 'info',
      title: 'AI Suggestions',
      message: `Generated suggestions for ${field}`,
    })
  }

  const handleLookup = (field: string) => {
    // Mock external lookup
    addNotification({
      type: 'info',
      title: 'External Lookup',
      message: `Looking up ${field} from external sources`,
    })
  }

  const handleNormalize = (field: string) => {
    // Mock normalization
    const currentValue = watchedValues[field as keyof ValidationFormData]
    if (field === 'deadline' && currentValue) {
      // Normalize date format
      const normalized = new Date(currentValue as string).toISOString().split('T')[0]
      setValue(field as any, normalized)
    }
    addNotification({
      type: 'success',
      title: 'Field Normalized',
      message: `${field} has been normalized`,
    })
  }

  const handleAdvance = () => {
    if (!canAdvance) {
      addNotification({
        type: 'warning',
        title: 'Validation Incomplete',
        message: 'Please validate all required fields before advancing',
      })
      return
    }

    if (tender) {
      updateTenderMutation.mutate({
        id: tender.id,
        updates: { status: 'PUBLISHED' as any }
      })
    }

    router.push('/categorize')
    addNotification({
      type: 'success',
      title: 'Validation Complete',
      message: 'Tender advanced to categorization stage',
    })
  }

  const onSubmit = (data: ValidationFormData) => {
    console.log('Form data:', data)
    // Save form data logic here
  }

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6 flex items-center justify-center min-h-[400px]">
          <RefreshCw className="h-6 w-6 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Data Validation</h1>
            <p className="text-muted-foreground">
              Validate and normalize tender information
            </p>
          </div>

          <div className="flex items-center gap-4">
            {/* Progress Indicator */}
            <div className="flex items-center gap-2">
              <div className="text-sm text-muted-foreground">
                Progress: {validatedFields.size}/{validationFields.length}
              </div>
              <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${completionRate}%` }}
                />
              </div>
            </div>

            <Button 
              onClick={handleAdvance}
              disabled={!canAdvance}
              className="gap-2"
            >
              Advance
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Validation Status */}
        <div className="grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Check className="h-4 w-4 text-green-600" />
                <span className="text-sm">Validated Fields</span>
                <Badge variant="secondary">{validatedFields.size}</Badge>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <span className="text-sm">Required Remaining</span>
                <Badge variant="outline">{requiredFields.length - requiredValidated}</Badge>
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4 text-blue-600" />
                <span className="text-sm">Completion</span>
                <Badge variant={canAdvance ? 'success' : 'outline'}>
                  {Math.round(completionRate)}%
                </Badge>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Validation Form */}
        <Card>
          <CardHeader>
            <CardTitle>Field Validation</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              {validationFields.map((fieldConfig) => (
                <Controller
                  key={fieldConfig.field}
                  name={fieldConfig.field as keyof ValidationFormData}
                  control={control}
                  render={({ field }) => (
                    <ValidationField
                      {...fieldConfig}
                      value={String(field.value || '')}
                      onChange={field.onChange}
                      validated={validatedFields.has(fieldConfig.field)}
                      onValidate={() => handleFieldValidation(fieldConfig.field)}
                      onSuggest={() => handleSuggest(fieldConfig.field)}
                      onLookup={() => handleLookup(fieldConfig.field)}
                      onNormalize={() => handleNormalize(fieldConfig.field)}
                      error={errors[fieldConfig.field as keyof ValidationFormData]?.message}
                      suggestions={fieldConfig.suggestions}
                    />
                  )}
                />
              ))}
            </form>
          </CardContent>
        </Card>

        {/* Notes */}
        {showNotes && (
          <Card className="bg-muted/50">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">
                <strong>Implementation Notes:</strong> Validation checkboxes track validator + timestamp. 
                AI suggestions use GPT for field completion. External lookups integrate with procurement databases. 
                Normalization applies standard formats (dates, currencies, categories). 
                Advance button requires all mandatory fields to be validated. Real system would include 
                confidence scoring and conflict resolution.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  )
}