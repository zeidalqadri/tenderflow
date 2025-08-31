// Comprehensive Zod validation schemas for TenderFlow API
import { z } from 'zod';

// ============================================================================
// ENUMS
// ============================================================================

export const TenderStatus = z.enum([
  'SCRAPED',
  'VALIDATED', 
  'QUALIFIED',
  'IN_BID',
  'SUBMITTED',
  'WON',
  'LOST',
  'ARCHIVED'
]);

export const TenderCategory = z.enum([
  'CONSTRUCTION',
  'IT_SERVICES',
  'CONSULTING',
  'SUPPLIES',
  'MAINTENANCE',
  'RESEARCH',
  'TRAINING',
  'OTHER'
]);

export const UserRole = z.enum(['admin', 'member', 'viewer']);
export const TenderRole = z.enum(['owner', 'contributor', 'viewer']);

export const DocumentType = z.enum([
  'RFP',
  'TECHNICAL_SPEC',
  'COMMERCIAL',
  'LEGAL',
  'SUBMISSION',
  'RECEIPT',
  'SUPPORT'
]);

export const SubmissionMethod = z.enum([
  'PORTAL',
  'EMAIL',
  'PHYSICAL',
  'OTHER'
]);

export const NotificationType = z.enum([
  'TENDER_ASSIGNED',
  'TENDER_STATUS_CHANGED',
  'SUBMISSION_DUE',
  'BID_UPDATED',
  'DOCUMENT_UPLOADED',
  'COMMENT_ADDED',
  'SYSTEM_ALERT'
]);

export const AuditAction = z.enum([
  'CREATE',
  'UPDATE',
  'DELETE',
  'VIEW',
  'DOWNLOAD',
  'UPLOAD',
  'TRANSITION',
  'ASSIGN',
  'UNASSIGN',
  'LOGIN',
  'LOGOUT'
]);

// ============================================================================
// BASE SCHEMAS
// ============================================================================

export const UuidSchema = z.string().uuid();
export const EmailSchema = z.string().email();
export const PasswordSchema = z.string().min(8).max(100);
export const UrlSchema = z.string().url();

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const DateRangeSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export const SortSchema = z.object({
  field: z.string(),
  direction: z.enum(['asc', 'desc']).default('desc'),
});

// ============================================================================
// AUTH SCHEMAS
// ============================================================================

export const LoginSchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
  tenantId: z.string().optional(),
});

export const RefreshTokenSchema = z.object({
  refreshToken: z.string(),
});

export const RegisterSchema = z.object({
  email: EmailSchema,
  password: PasswordSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  tenantName: z.string().min(1).max(100),
  tenantSubdomain: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Subdomain must contain only lowercase letters, numbers, and hyphens'),
});

export const PasswordResetSchema = z.object({
  email: EmailSchema,
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  password: PasswordSchema,
});

// ============================================================================
// USER SCHEMAS
// ============================================================================

export const UserBaseSchema = z.object({
  id: UuidSchema,
  email: EmailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: UserRole,
  isActive: z.boolean(),
  lastLoginAt: z.date().nullable(),
  settings: z.record(z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateUserSchema = z.object({
  email: EmailSchema,
  firstName: z.string().min(1).max(100),
  lastName: z.string().min(1).max(100),
  role: UserRole.default('member'),
  password: PasswordSchema,
});

export const UpdateUserSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  role: UserRole.optional(),
  isActive: z.boolean().optional(),
  settings: z.record(z.unknown()).optional(),
});

export const UserQuerySchema = PaginationSchema.extend({
  role: UserRole.optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
});

// ============================================================================
// TENANT SCHEMAS
// ============================================================================

export const TenantBaseSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  subdomain: z.string().min(2).max(50),
  settings: z.record(z.unknown()).default({}),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTenantSchema = z.object({
  name: z.string().min(1).max(100),
  subdomain: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/, 'Subdomain must contain only lowercase letters, numbers, and hyphens'),
  settings: z.record(z.unknown()).default({}),
});

export const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  settings: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// TENDER SCHEMAS
// ============================================================================

export const TenderBaseSchema = z.object({
  id: UuidSchema,
  title: z.string().min(1).max(255),
  description: z.string().nullable(),
  status: TenderStatus,
  category: TenderCategory,
  publishedAt: z.date().nullable(),
  deadline: z.date().nullable(),
  estimatedValue: z.number().nullable(),
  currency: z.string().length(3).default('USD'),
  source: z.string().nullable(),
  externalId: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  requirements: z.record(z.unknown()).default({}),
  createdBy: UuidSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTenderSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  category: TenderCategory.default('OTHER'),
  publishedAt: z.coerce.date().optional(),
  deadline: z.coerce.date().optional(),
  estimatedValue: z.number().positive().optional(),
  currency: z.string().length(3).default('USD'),
  source: z.string().optional(),
  externalId: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
  requirements: z.record(z.unknown()).default({}),
});

export const UpdateTenderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  category: TenderCategory.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  deadline: z.coerce.date().nullable().optional(),
  estimatedValue: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  source: z.string().nullable().optional(),
  externalId: z.string().nullable().optional(),
  metadata: z.record(z.unknown()).optional(),
  requirements: z.record(z.unknown()).optional(),
});

export const TenderStateTransitionSchema = z.object({
  toStatus: TenderStatus,
  reason: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export const TenderQuerySchema = PaginationSchema.extend({
  status: TenderStatus.optional(),
  category: TenderCategory.optional(),
  createdBy: UuidSchema.optional(),
  search: z.string().optional(),
  minValue: z.number().optional(),
  maxValue: z.number().optional(),
  deadlineRange: DateRangeSchema.optional(),
  sort: SortSchema.optional(),
});

// ============================================================================
// TENDER ASSIGNMENT SCHEMAS
// ============================================================================

export const TenderAssignmentSchema = z.object({
  id: UuidSchema,
  tenderId: UuidSchema,
  userId: UuidSchema,
  role: TenderRole,
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTenderAssignmentSchema = z.object({
  userId: UuidSchema,
  role: TenderRole,
});

export const UpdateTenderAssignmentSchema = z.object({
  role: TenderRole,
});

export const BulkAssignSchema = z.object({
  assignments: z.array(CreateTenderAssignmentSchema).min(1).max(10),
});

// ============================================================================
// DOCUMENT SCHEMAS
// ============================================================================

export const DocumentBaseSchema = z.object({
  id: UuidSchema,
  tenderId: UuidSchema,
  uploadedBy: UuidSchema,
  filename: z.string().min(1).max(255),
  originalName: z.string().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
  s3Key: z.string(),
  s3Bucket: z.string(),
  type: DocumentType,
  metadata: z.record(z.unknown()).default({}),
  isDeleted: z.boolean().default(false),
  uploadedAt: z.date(),
  updatedAt: z.date(),
});

export const CreateDocumentSchema = z.object({
  tenderId: UuidSchema,
  originalName: z.string().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive(),
  type: DocumentType,
  metadata: z.record(z.unknown()).default({}),
});

export const DocumentPresignSchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.string(),
  size: z.number().int().positive().max(50 * 1024 * 1024), // 50MB limit
  type: DocumentType,
});

export const DocumentUploadConfirmSchema = z.object({
  documentId: UuidSchema,
  s3Key: z.string(),
  finalSize: z.number().int().positive(),
});

export const DocumentQuerySchema = PaginationSchema.extend({
  tenderId: UuidSchema.optional(),
  type: DocumentType.optional(),
  uploadedBy: UuidSchema.optional(),
  search: z.string().optional(),
});

// ============================================================================
// BID SCHEMAS
// ============================================================================

export const BidBaseSchema = z.object({
  id: UuidSchema,
  tenderId: UuidSchema,
  ownerId: UuidSchema.nullable(),
  totalAmount: z.number().nullable(),
  currency: z.string().length(3).default('USD'),
  tasks: z.record(z.unknown()).default({}),
  timeline: z.record(z.unknown()).default({}),
  methodology: z.record(z.unknown()).default({}),
  team: z.record(z.unknown()).default({}),
  assumptions: z.record(z.unknown()).default({}),
  riskAssessment: z.record(z.unknown()).default({}),
  qualityPlan: z.record(z.unknown()).default({}),
  deliverables: z.record(z.unknown()).default({}),
  notes: z.string().nullable(),
  isSubmitted: z.boolean().default(false),
  submittedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const UpdateBidSchema = z.object({
  ownerId: UuidSchema.nullable().optional(),
  totalAmount: z.number().positive().nullable().optional(),
  currency: z.string().length(3).optional(),
  tasks: z.record(z.unknown()).optional(),
  timeline: z.record(z.unknown()).optional(),
  methodology: z.record(z.unknown()).optional(),
  team: z.record(z.unknown()).optional(),
  assumptions: z.record(z.unknown()).optional(),
  riskAssessment: z.record(z.unknown()).optional(),
  qualityPlan: z.record(z.unknown()).optional(),
  deliverables: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});

export const SubmitBidSchema = z.object({
  finalReview: z.boolean().default(true),
});

// ============================================================================
// SUBMISSION SCHEMAS
// ============================================================================

export const SubmissionBaseSchema = z.object({
  id: UuidSchema,
  tenderId: UuidSchema,
  method: SubmissionMethod,
  submittedAt: z.date(),
  submittedBy: UuidSchema,
  externalRef: z.string().nullable(),
  receiptKey: z.string().nullable(),
  parsed: z.record(z.unknown()).nullable(),
  parsedAt: z.date().nullable(),
  parseVersion: z.string().nullable(),
  amount: z.number().nullable(),
  currency: z.string().nullable(),
  status: z.string().nullable(),
  portalData: z.record(z.unknown()).default({}),
  notes: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateSubmissionSchema = z.object({
  tenderId: UuidSchema,
  method: SubmissionMethod,
  submittedAt: z.coerce.date().default(() => new Date()),
  externalRef: z.string().optional(),
  amount: z.number().positive().optional(),
  currency: z.string().length(3).optional(),
  status: z.string().optional(),
  portalData: z.record(z.unknown()).default({}),
  notes: z.string().optional(),
});

export const UpdateSubmissionSchema = z.object({
  method: SubmissionMethod.optional(),
  submittedAt: z.coerce.date().optional(),
  externalRef: z.string().nullable().optional(),
  amount: z.number().positive().nullable().optional(),
  currency: z.string().length(3).nullable().optional(),
  status: z.string().nullable().optional(),
  portalData: z.record(z.unknown()).optional(),
  notes: z.string().nullable().optional(),
});

export const SubmissionQuerySchema = PaginationSchema.extend({
  tenderId: UuidSchema.optional(),
  method: SubmissionMethod.optional(),
  submittedBy: UuidSchema.optional(),
  dateRange: DateRangeSchema.optional(),
});

// ============================================================================
// ALERT SCHEMAS
// ============================================================================

export const AlertRuleSchema = z.object({
  id: UuidSchema,
  name: z.string().min(1).max(100),
  description: z.string().nullable(),
  conditions: z.record(z.unknown()),
  actions: z.record(z.unknown()),
  isActive: z.boolean().default(true),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  conditions: z.record(z.unknown()),
  actions: z.record(z.unknown()),
  isActive: z.boolean().default(true),
});

export const UpdateAlertRuleSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().nullable().optional(),
  conditions: z.record(z.unknown()).optional(),
  actions: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

// ============================================================================
// NOTIFICATION SCHEMAS
// ============================================================================

export const NotificationSchema = z.object({
  id: UuidSchema,
  userId: UuidSchema,
  tenderId: UuidSchema.nullable(),
  type: NotificationType,
  title: z.string().min(1).max(255),
  message: z.string(),
  data: z.record(z.unknown()).default({}),
  isRead: z.boolean().default(false),
  readAt: z.date().nullable(),
  createdAt: z.date(),
});

export const CreateNotificationSchema = z.object({
  userId: UuidSchema,
  tenderId: UuidSchema.optional(),
  type: NotificationType,
  title: z.string().min(1).max(255),
  message: z.string(),
  data: z.record(z.unknown()).default({}),
});

export const MarkNotificationReadSchema = z.object({
  isRead: z.boolean(),
});

export const NotificationQuerySchema = PaginationSchema.extend({
  isRead: z.boolean().optional(),
  type: NotificationType.optional(),
  tenderId: UuidSchema.optional(),
});

// ============================================================================
// EXPORT SCHEMAS
// ============================================================================

export const ExportRequestSchema = z.object({
  type: z.enum(['tenders', 'submissions', 'documents', 'audit']),
  format: z.enum(['csv', 'excel', 'json']).default('csv'),
  filters: z.record(z.unknown()).default({}),
  fields: z.array(z.string()).optional(),
  dateRange: DateRangeSchema.optional(),
});

export const ExportStatusSchema = z.object({
  id: UuidSchema,
  type: z.string(),
  status: z.enum(['pending', 'processing', 'completed', 'failed']),
  downloadUrl: z.string().nullable(),
  error: z.string().nullable(),
  createdAt: z.date(),
  completedAt: z.date().nullable(),
});

// ============================================================================
// API RESPONSE SCHEMAS
// ============================================================================

export const ApiResponseSchema = <T extends z.ZodType>(dataSchema: T) => z.object({
  success: z.boolean(),
  data: dataSchema.optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  requestId: z.string().optional(),
});

export const PaginatedResponseSchema = <T extends z.ZodType>(itemSchema: T) => z.object({
  success: z.boolean(),
  data: z.array(itemSchema),
  pagination: z.object({
    page: z.number(),
    limit: z.number(),
    total: z.number(),
    totalPages: z.number(),
    hasNext: z.boolean(),
    hasPrev: z.boolean(),
  }),
  requestId: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string(),
  statusCode: z.number(),
  code: z.string().optional(),
  details: z.record(z.unknown()).optional(),
  requestId: z.string().optional(),
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

export const createQuerySchema = <T extends z.ZodRawShape>(baseSchema: z.ZodObject<T>) => {
  return baseSchema.extend(PaginationSchema.shape);
};

export const createUpdateSchema = <T extends z.ZodRawShape>(baseSchema: z.ZodObject<T>) => {
  return baseSchema.partial();
};

// Export all schemas as a single object for easy import
export const schemas = {
  // Enums
  TenderStatus,
  TenderCategory,
  UserRole,
  TenderRole,
  DocumentType,
  SubmissionMethod,
  NotificationType,
  AuditAction,
  
  // Base
  UuidSchema,
  EmailSchema,
  PasswordSchema,
  UrlSchema,
  PaginationSchema,
  DateRangeSchema,
  SortSchema,
  
  // Auth
  LoginSchema,
  RefreshTokenSchema,
  RegisterSchema,
  PasswordResetSchema,
  PasswordResetConfirmSchema,
  
  // User
  UserBaseSchema,
  CreateUserSchema,
  UpdateUserSchema,
  UserQuerySchema,
  
  // Tenant
  TenantBaseSchema,
  CreateTenantSchema,
  UpdateTenantSchema,
  
  // Tender
  TenderBaseSchema,
  CreateTenderSchema,
  UpdateTenderSchema,
  TenderStateTransitionSchema,
  TenderQuerySchema,
  
  // Assignment
  TenderAssignmentSchema,
  CreateTenderAssignmentSchema,
  UpdateTenderAssignmentSchema,
  BulkAssignSchema,
  
  // Document
  DocumentBaseSchema,
  CreateDocumentSchema,
  DocumentPresignSchema,
  DocumentUploadConfirmSchema,
  DocumentQuerySchema,
  
  // Bid
  BidBaseSchema,
  UpdateBidSchema,
  SubmitBidSchema,
  
  // Submission
  SubmissionBaseSchema,
  CreateSubmissionSchema,
  UpdateSubmissionSchema,
  SubmissionQuerySchema,
  
  // Alert
  AlertRuleSchema,
  CreateAlertRuleSchema,
  UpdateAlertRuleSchema,
  
  // Notification
  NotificationSchema,
  CreateNotificationSchema,
  MarkNotificationReadSchema,
  NotificationQuerySchema,
  
  // Export
  ExportRequestSchema,
  ExportStatusSchema,
  
  // Response
  ApiResponseSchema,
  PaginatedResponseSchema,
  ErrorResponseSchema,
  
  // Utilities
  createQuerySchema,
  createUpdateSchema,
};