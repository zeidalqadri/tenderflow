// Shared constants for TenderFlow

export const API_ROUTES = {
  AUTH: {
    LOGIN: '/auth/login',
    LOGOUT: '/auth/logout',
    REFRESH: '/auth/refresh',
    PROFILE: '/auth/profile',
  },
  USERS: {
    BASE: '/users',
    BY_ID: (id: string) => `/users/${id}`,
  },
  TENDERS: {
    BASE: '/tenders',
    BY_ID: (id: string) => `/tenders/${id}`,
    PARTICIPANTS: (id: string) => `/tenders/${id}/participants`,
    DOCUMENTS: (id: string) => `/tenders/${id}/documents`,
    INVITE: (id: string) => `/tenders/${id}/invite`,
    SUBMIT: (id: string) => `/tenders/${id}/submit`,
  },
  DOCUMENTS: {
    UPLOAD: '/documents/upload',
    BY_ID: (id: string) => `/documents/${id}`,
    DOWNLOAD: (id: string) => `/documents/${id}/download`,
  },
  ADMIN: {
    STATS: '/admin/stats',
    USERS: '/admin/users',
    TENDERS: '/admin/tenders',
  },
} as const;

export const FILE_CONSTRAINTS = {
  MAX_SIZE: 50 * 1024 * 1024, // 50MB
  ALLOWED_TYPES: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
  ],
  ALLOWED_EXTENSIONS: [
    'pdf',
    'doc',
    'docx',
    'xls',
    'xlsx',
    'jpg',
    'jpeg',
    'png',
    'gif',
  ],
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const TENDER_SETTINGS = {
  MIN_DEADLINE_HOURS: 24,
  MAX_PARTICIPANTS: 50,
  AUTO_ASSIGNMENT_ENABLED: true,
} as const;

export const OCR_SETTINGS = {
  LANGUAGES: ['eng', 'ara'],
  CONFIDENCE_THRESHOLD: 60,
  MAX_PROCESSING_TIME: 300000, // 5 minutes
} as const;

export const QUEUE_NAMES = {
  OCR_PROCESSING: 'ocr-processing',
  EMAIL_NOTIFICATIONS: 'email-notifications',
  FILE_PROCESSING: 'file-processing',
  TENDER_NOTIFICATIONS: 'tender-notifications',
} as const;

export const CACHE_KEYS = {
  USER_PROFILE: (userId: string) => `user:profile:${userId}`,
  TENDER_DETAILS: (tenderId: string) => `tender:details:${tenderId}`,
  TENDER_PARTICIPANTS: (tenderId: string) => `tender:participants:${tenderId}`,
  USER_PERMISSIONS: (userId: string) => `user:permissions:${userId}`,
} as const;

export const CACHE_TTL = {
  USER_PROFILE: 300, // 5 minutes
  TENDER_DETAILS: 600, // 10 minutes
  TENDER_PARTICIPANTS: 300, // 5 minutes
  USER_PERMISSIONS: 900, // 15 minutes
} as const;

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
} as const;

export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Insufficient permissions',
  NOT_FOUND: 'Resource not found',
  VALIDATION_ERROR: 'Validation error',
  INTERNAL_ERROR: 'Internal server error',
  FILE_TOO_LARGE: 'File size exceeds limit',
  INVALID_FILE_TYPE: 'Invalid file type',
  TENDER_DEADLINE_PASSED: 'Tender deadline has passed',
  ALREADY_PARTICIPATED: 'User already participating in tender',
} as const;

export const SOCKET_EVENTS = {
  TENDER_CREATED: 'tender:created',
  TENDER_UPDATED: 'tender:updated',
  TENDER_DEADLINE_REMINDER: 'tender:deadline_reminder',
  PARTICIPANT_INVITED: 'participant:invited',
  PARTICIPANT_SUBMITTED: 'participant:submitted',
  DOCUMENT_PROCESSED: 'document:processed',
  OCR_COMPLETED: 'ocr:completed',
} as const;