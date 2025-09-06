
Object.defineProperty(exports, "__esModule", { value: true });

const {
  Decimal,
  objectEnumValues,
  makeStrictEnum,
  Public,
  getRuntime,
  skip
} = require('./runtime/index-browser.js')


const Prisma = {}

exports.Prisma = Prisma
exports.$Enums = {}

/**
 * Prisma Client JS version: 5.22.0
 * Query Engine version: 605197351a3c8bdd595af2d2a9bc3025bca48ea2
 */
Prisma.prismaVersion = {
  client: "5.22.0",
  engine: "605197351a3c8bdd595af2d2a9bc3025bca48ea2"
}

Prisma.PrismaClientKnownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientKnownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)};
Prisma.PrismaClientUnknownRequestError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientUnknownRequestError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientRustPanicError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientRustPanicError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientInitializationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientInitializationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.PrismaClientValidationError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`PrismaClientValidationError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.NotFoundError = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`NotFoundError is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.Decimal = Decimal

/**
 * Re-export of sql-template-tag
 */
Prisma.sql = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`sqltag is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.empty = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`empty is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.join = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`join is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.raw = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`raw is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.validator = Public.validator

/**
* Extensions
*/
Prisma.getExtensionContext = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.getExtensionContext is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}
Prisma.defineExtension = () => {
  const runtimeName = getRuntime().prettyName;
  throw new Error(`Extensions.defineExtension is unable to run in this browser environment, or has been bundled for the browser (running in ${runtimeName}).
In case this error is unexpected for you, please report it in https://pris.ly/prisma-prisma-bug-report`,
)}

/**
 * Shorthand utilities for JSON filtering
 */
Prisma.DbNull = objectEnumValues.instances.DbNull
Prisma.JsonNull = objectEnumValues.instances.JsonNull
Prisma.AnyNull = objectEnumValues.instances.AnyNull

Prisma.NullTypes = {
  DbNull: objectEnumValues.classes.DbNull,
  JsonNull: objectEnumValues.classes.JsonNull,
  AnyNull: objectEnumValues.classes.AnyNull
}



/**
 * Enums
 */

exports.Prisma.TransactionIsolationLevel = makeStrictEnum({
  ReadUncommitted: 'ReadUncommitted',
  ReadCommitted: 'ReadCommitted',
  RepeatableRead: 'RepeatableRead',
  Serializable: 'Serializable'
});

exports.Prisma.TenantScalarFieldEnum = {
  id: 'id',
  name: 'name',
  subdomain: 'subdomain',
  settings: 'settings',
  webhookUrl: 'webhookUrl',
  metadata: 'metadata',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.UserScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  email: 'email',
  passwordHash: 'passwordHash',
  firstName: 'firstName',
  lastName: 'lastName',
  phone: 'phone',
  role: 'role',
  isActive: 'isActive',
  lastLoginAt: 'lastLoginAt',
  settings: 'settings',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.TenderScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  title: 'title',
  description: 'description',
  status: 'status',
  category: 'category',
  publishedAt: 'publishedAt',
  deadline: 'deadline',
  estimatedValue: 'estimatedValue',
  currency: 'currency',
  source: 'source',
  externalId: 'externalId',
  metadata: 'metadata',
  requirements: 'requirements',
  createdBy: 'createdBy',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt',
  scrapedAt: 'scrapedAt',
  sourcePortal: 'sourcePortal',
  originalTitle: 'originalTitle',
  originalStatus: 'originalStatus',
  originalValue: 'originalValue',
  exchangeRates: 'exchangeRates',
  sourceUrl: 'sourceUrl'
};

exports.Prisma.TenderAssignmentScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  userId: 'userId',
  role: 'role',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.DocumentScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  uploadedBy: 'uploadedBy',
  filename: 'filename',
  originalName: 'originalName',
  mimeType: 'mimeType',
  size: 'size',
  s3Key: 's3Key',
  s3Bucket: 's3Bucket',
  type: 'type',
  metadata: 'metadata',
  isDeleted: 'isDeleted',
  uploadedAt: 'uploadedAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.BidScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  ownerId: 'ownerId',
  totalAmount: 'totalAmount',
  currency: 'currency',
  tasks: 'tasks',
  timeline: 'timeline',
  methodology: 'methodology',
  team: 'team',
  assumptions: 'assumptions',
  riskAssessment: 'riskAssessment',
  qualityPlan: 'qualityPlan',
  deliverables: 'deliverables',
  notes: 'notes',
  isSubmitted: 'isSubmitted',
  submittedAt: 'submittedAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.SubmissionScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  method: 'method',
  submittedAt: 'submittedAt',
  submittedBy: 'submittedBy',
  externalRef: 'externalRef',
  receiptKey: 'receiptKey',
  parsed: 'parsed',
  parsedAt: 'parsedAt',
  parseVersion: 'parseVersion',
  amount: 'amount',
  currency: 'currency',
  status: 'status',
  portalData: 'portalData',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.TenderValidationScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  criteria: 'criteria',
  score: 'score',
  isValid: 'isValid',
  validatedBy: 'validatedBy',
  validatedAt: 'validatedAt',
  notes: 'notes',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.StateTransitionScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  fromStatus: 'fromStatus',
  toStatus: 'toStatus',
  triggeredBy: 'triggeredBy',
  reason: 'reason',
  metadata: 'metadata',
  createdAt: 'createdAt'
};

exports.Prisma.CommentScalarFieldEnum = {
  id: 'id',
  tenderId: 'tenderId',
  authorId: 'authorId',
  content: 'content',
  metadata: 'metadata',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
};

exports.Prisma.NotificationScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  tenderId: 'tenderId',
  type: 'type',
  title: 'title',
  message: 'message',
  data: 'data',
  isRead: 'isRead',
  readAt: 'readAt',
  createdAt: 'createdAt'
};

exports.Prisma.AuditLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  userId: 'userId',
  action: 'action',
  resource: 'resource',
  resourceId: 'resourceId',
  oldValues: 'oldValues',
  newValues: 'newValues',
  metadata: 'metadata',
  ipAddress: 'ipAddress',
  userAgent: 'userAgent',
  timestamp: 'timestamp',
  archived: 'archived',
  archivedAt: 'archivedAt'
};

exports.Prisma.SystemConfigScalarFieldEnum = {
  id: 'id',
  key: 'key',
  value: 'value',
  description: 'description',
  isActive: 'isActive',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.JobQueueScalarFieldEnum = {
  id: 'id',
  name: 'name',
  data: 'data',
  priority: 'priority',
  attempts: 'attempts',
  maxAttempts: 'maxAttempts',
  status: 'status',
  processedAt: 'processedAt',
  failedAt: 'failedAt',
  error: 'error',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ApiKeyScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  name: 'name',
  key: 'key',
  permissions: 'permissions',
  isActive: 'isActive',
  lastUsedAt: 'lastUsedAt',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.ScrapingLogScalarFieldEnum = {
  id: 'id',
  tenantId: 'tenantId',
  sourcePortal: 'sourcePortal',
  status: 'status',
  startedAt: 'startedAt',
  completedAt: 'completedAt',
  pagesProcessed: 'pagesProcessed',
  totalPages: 'totalPages',
  tendersFound: 'tendersFound',
  tendersImported: 'tendersImported',
  tendersUpdated: 'tendersUpdated',
  tendersSkipped: 'tendersSkipped',
  errorMessage: 'errorMessage',
  errorDetails: 'errorDetails',
  metadata: 'metadata',
  triggeredBy: 'triggeredBy'
};

exports.Prisma.SessionScalarFieldEnum = {
  id: 'id',
  sessionToken: 'sessionToken',
  userId: 'userId',
  expiresAt: 'expiresAt',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  data: 'data'
};

exports.Prisma.NotificationPreferenceScalarFieldEnum = {
  id: 'id',
  userId: 'userId',
  type: 'type',
  enabled: 'enabled',
  channels: 'channels',
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
};

exports.Prisma.NotificationLogScalarFieldEnum = {
  id: 'id',
  type: 'type',
  tenantId: 'tenantId',
  userId: 'userId',
  priority: 'priority',
  channels: 'channels',
  recipients: 'recipients',
  metadata: 'metadata',
  sentAt: 'sentAt',
  createdAt: 'createdAt'
};

exports.Prisma.SortOrder = {
  asc: 'asc',
  desc: 'desc'
};

exports.Prisma.JsonNullValueInput = {
  JsonNull: Prisma.JsonNull
};

exports.Prisma.NullableJsonNullValueInput = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull
};

exports.Prisma.QueryMode = {
  default: 'default',
  insensitive: 'insensitive'
};

exports.Prisma.JsonNullValueFilter = {
  DbNull: Prisma.DbNull,
  JsonNull: Prisma.JsonNull,
  AnyNull: Prisma.AnyNull
};

exports.Prisma.NullsOrder = {
  first: 'first',
  last: 'last'
};
exports.UserRole = exports.$Enums.UserRole = {
  admin: 'admin',
  member: 'member',
  viewer: 'viewer'
};

exports.TenderStatus = exports.$Enums.TenderStatus = {
  SCRAPED: 'SCRAPED',
  VALIDATED: 'VALIDATED',
  QUALIFIED: 'QUALIFIED',
  IN_BID: 'IN_BID',
  SUBMITTED: 'SUBMITTED',
  WON: 'WON',
  LOST: 'LOST',
  ARCHIVED: 'ARCHIVED'
};

exports.TenderCategory = exports.$Enums.TenderCategory = {
  CONSTRUCTION: 'CONSTRUCTION',
  IT_SERVICES: 'IT_SERVICES',
  CONSULTING: 'CONSULTING',
  SUPPLIES: 'SUPPLIES',
  MAINTENANCE: 'MAINTENANCE',
  RESEARCH: 'RESEARCH',
  TRAINING: 'TRAINING',
  OTHER: 'OTHER'
};

exports.TenderRole = exports.$Enums.TenderRole = {
  owner: 'owner',
  contributor: 'contributor',
  viewer: 'viewer'
};

exports.DocumentType = exports.$Enums.DocumentType = {
  RFP: 'RFP',
  TECHNICAL_SPEC: 'TECHNICAL_SPEC',
  COMMERCIAL: 'COMMERCIAL',
  LEGAL: 'LEGAL',
  SUBMISSION: 'SUBMISSION',
  RECEIPT: 'RECEIPT',
  SUPPORT: 'SUPPORT'
};

exports.SubmissionMethod = exports.$Enums.SubmissionMethod = {
  PORTAL: 'PORTAL',
  EMAIL: 'EMAIL',
  PHYSICAL: 'PHYSICAL',
  OTHER: 'OTHER'
};

exports.NotificationType = exports.$Enums.NotificationType = {
  TENDER_ASSIGNED: 'TENDER_ASSIGNED',
  TENDER_STATUS_CHANGED: 'TENDER_STATUS_CHANGED',
  SUBMISSION_DUE: 'SUBMISSION_DUE',
  BID_UPDATED: 'BID_UPDATED',
  DOCUMENT_UPLOADED: 'DOCUMENT_UPLOADED',
  COMMENT_ADDED: 'COMMENT_ADDED',
  SYSTEM_ALERT: 'SYSTEM_ALERT'
};

exports.AuditAction = exports.$Enums.AuditAction = {
  CREATE: 'CREATE',
  UPDATE: 'UPDATE',
  DELETE: 'DELETE',
  VIEW: 'VIEW',
  DOWNLOAD: 'DOWNLOAD',
  UPLOAD: 'UPLOAD',
  TRANSITION: 'TRANSITION',
  ASSIGN: 'ASSIGN',
  UNASSIGN: 'UNASSIGN',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT'
};

exports.ScrapingStatus = exports.$Enums.ScrapingStatus = {
  PENDING: 'PENDING',
  RUNNING: 'RUNNING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  CANCELLED: 'CANCELLED'
};

exports.Prisma.ModelName = {
  Tenant: 'Tenant',
  User: 'User',
  Tender: 'Tender',
  TenderAssignment: 'TenderAssignment',
  Document: 'Document',
  Bid: 'Bid',
  Submission: 'Submission',
  TenderValidation: 'TenderValidation',
  StateTransition: 'StateTransition',
  Comment: 'Comment',
  Notification: 'Notification',
  AuditLog: 'AuditLog',
  SystemConfig: 'SystemConfig',
  JobQueue: 'JobQueue',
  ApiKey: 'ApiKey',
  ScrapingLog: 'ScrapingLog',
  Session: 'Session',
  NotificationPreference: 'NotificationPreference',
  NotificationLog: 'NotificationLog'
};

/**
 * This is a stub Prisma Client that will error at runtime if called.
 */
class PrismaClient {
  constructor() {
    return new Proxy(this, {
      get(target, prop) {
        let message
        const runtime = getRuntime()
        if (runtime.isEdge) {
          message = `PrismaClient is not configured to run in ${runtime.prettyName}. In order to run Prisma Client on edge runtime, either:
- Use Prisma Accelerate: https://pris.ly/d/accelerate
- Use Driver Adapters: https://pris.ly/d/driver-adapters
`;
        } else {
          message = 'PrismaClient is unable to run in this browser environment, or has been bundled for the browser (running in `' + runtime.prettyName + '`).'
        }
        
        message += `
If this is unexpected, please open an issue: https://pris.ly/prisma-prisma-bug-report`

        throw new Error(message)
      }
    })
  }
}

exports.PrismaClient = PrismaClient

Object.assign(exports, Prisma)
