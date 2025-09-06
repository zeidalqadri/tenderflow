-- CreateEnum
CREATE TYPE "TenderStatus" AS ENUM ('SCRAPED', 'VALIDATED', 'QUALIFIED', 'IN_BID', 'SUBMITTED', 'WON', 'LOST', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "TenderCategory" AS ENUM ('CONSTRUCTION', 'IT_SERVICES', 'CONSULTING', 'SUPPLIES', 'MAINTENANCE', 'RESEARCH', 'TRAINING', 'OTHER');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member', 'viewer');

-- CreateEnum
CREATE TYPE "TenderRole" AS ENUM ('owner', 'contributor', 'viewer');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('RFP', 'TECHNICAL_SPEC', 'COMMERCIAL', 'LEGAL', 'SUBMISSION', 'RECEIPT', 'SUPPORT');

-- CreateEnum
CREATE TYPE "SubmissionMethod" AS ENUM ('PORTAL', 'EMAIL', 'PHYSICAL', 'OTHER');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('TENDER_ASSIGNED', 'TENDER_STATUS_CHANGED', 'SUBMISSION_DUE', 'BID_UPDATED', 'DOCUMENT_UPLOADED', 'COMMENT_ADDED', 'SYSTEM_ALERT');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'UPLOAD', 'TRANSITION', 'ASSIGN', 'UNASSIGN', 'LOGIN', 'LOGOUT');

-- CreateEnum
CREATE TYPE "ScrapingStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subdomain" TEXT NOT NULL,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tenders" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TenderStatus" NOT NULL DEFAULT 'SCRAPED',
    "category" "TenderCategory" NOT NULL DEFAULT 'OTHER',
    "publishedAt" TIMESTAMP(3),
    "deadline" TIMESTAMP(3),
    "estimatedValue" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "source" TEXT,
    "externalId" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "requirements" JSONB NOT NULL DEFAULT '{}',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "scrapedAt" TIMESTAMP(3),
    "sourcePortal" TEXT,
    "originalTitle" TEXT,
    "originalStatus" TEXT,
    "originalValue" TEXT,
    "exchangeRates" JSONB,
    "sourceUrl" TEXT,

    CONSTRAINT "tenders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_assignments" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TenderRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "s3Key" TEXT NOT NULL,
    "s3Bucket" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bids" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "ownerId" TEXT,
    "totalAmount" DECIMAL(15,2),
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "tasks" JSONB NOT NULL DEFAULT '{}',
    "timeline" JSONB NOT NULL DEFAULT '{}',
    "methodology" JSONB NOT NULL DEFAULT '{}',
    "team" JSONB NOT NULL DEFAULT '{}',
    "assumptions" JSONB NOT NULL DEFAULT '{}',
    "riskAssessment" JSONB NOT NULL DEFAULT '{}',
    "qualityPlan" JSONB NOT NULL DEFAULT '{}',
    "deliverables" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "isSubmitted" BOOLEAN NOT NULL DEFAULT false,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bids_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "method" "SubmissionMethod" NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL,
    "submittedBy" TEXT NOT NULL,
    "externalRef" TEXT,
    "receiptKey" TEXT,
    "parsed" JSONB,
    "parsedAt" TIMESTAMP(3),
    "parseVersion" TEXT,
    "amount" DECIMAL(15,2),
    "currency" TEXT,
    "status" TEXT,
    "portalData" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tender_validations" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "criteria" JSONB NOT NULL,
    "score" DECIMAL(5,2),
    "isValid" BOOLEAN NOT NULL DEFAULT false,
    "validatedBy" TEXT,
    "validatedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tender_validations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "state_transitions" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "fromStatus" "TenderStatus",
    "toStatus" "TenderStatus" NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "reason" TEXT,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "state_transitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comments" (
    "id" TEXT NOT NULL,
    "tenderId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenderId" TEXT,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_config" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_queue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "status" TEXT NOT NULL DEFAULT 'waiting',
    "processedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "api_keys" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "permissions" JSONB NOT NULL DEFAULT '[]',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scraping_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sourcePortal" TEXT NOT NULL,
    "status" "ScrapingStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "pagesProcessed" INTEGER NOT NULL DEFAULT 0,
    "totalPages" INTEGER,
    "tendersFound" INTEGER NOT NULL DEFAULT 0,
    "tendersImported" INTEGER NOT NULL DEFAULT 0,
    "tendersUpdated" INTEGER NOT NULL DEFAULT 0,
    "tendersSkipped" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "errorDetails" JSONB,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "triggeredBy" TEXT NOT NULL,

    CONSTRAINT "scraping_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_subdomain_key" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_subdomain_idx" ON "tenants"("subdomain");

-- CreateIndex
CREATE INDEX "tenants_isActive_idx" ON "tenants"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "users_tenantId_email_key" ON "users"("tenantId", "email");

-- CreateIndex
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- CreateIndex
CREATE INDEX "tenders_tenantId_status_idx" ON "tenders"("tenantId", "status");

-- CreateIndex
CREATE INDEX "tenders_category_idx" ON "tenders"("category");

-- CreateIndex
CREATE INDEX "tenders_deadline_idx" ON "tenders"("deadline");

-- CreateIndex
CREATE INDEX "tenders_publishedAt_idx" ON "tenders"("publishedAt");

-- CreateIndex
CREATE INDEX "tenders_externalId_idx" ON "tenders"("externalId");

-- CreateIndex
CREATE INDEX "tenders_createdBy_idx" ON "tenders"("createdBy");

-- CreateIndex
CREATE INDEX "tenders_sourcePortal_idx" ON "tenders"("sourcePortal");

-- CreateIndex
CREATE INDEX "tenders_scrapedAt_idx" ON "tenders"("scrapedAt");

-- CreateIndex
CREATE INDEX "tenders_sourcePortal_externalId_idx" ON "tenders"("sourcePortal", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "tender_assignments_tenderId_userId_key" ON "tender_assignments"("tenderId", "userId");

-- CreateIndex
CREATE INDEX "tender_assignments_tenderId_role_idx" ON "tender_assignments"("tenderId", "role");

-- CreateIndex
CREATE INDEX "tender_assignments_userId_idx" ON "tender_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "documents_s3Key_key" ON "documents"("s3Key");

-- CreateIndex
CREATE INDEX "documents_tenderId_type_idx" ON "documents"("tenderId", "type");

-- CreateIndex
CREATE INDEX "documents_uploadedBy_idx" ON "documents"("uploadedBy");

-- CreateIndex
CREATE INDEX "documents_s3Key_idx" ON "documents"("s3Key");

-- CreateIndex
CREATE INDEX "documents_isDeleted_idx" ON "documents"("isDeleted");

-- CreateIndex
CREATE UNIQUE INDEX "bids_tenderId_key" ON "bids"("tenderId");

-- CreateIndex
CREATE INDEX "bids_tenderId_idx" ON "bids"("tenderId");

-- CreateIndex
CREATE INDEX "bids_ownerId_idx" ON "bids"("ownerId");

-- CreateIndex
CREATE INDEX "bids_isSubmitted_idx" ON "bids"("isSubmitted");

-- CreateIndex
CREATE INDEX "submissions_tenderId_idx" ON "submissions"("tenderId");

-- CreateIndex
CREATE INDEX "submissions_externalRef_idx" ON "submissions"("externalRef");

-- CreateIndex
CREATE INDEX "submissions_submittedBy_idx" ON "submissions"("submittedBy");

-- CreateIndex
CREATE INDEX "submissions_submittedAt_idx" ON "submissions"("submittedAt");

-- CreateIndex
CREATE INDEX "tender_validations_tenderId_idx" ON "tender_validations"("tenderId");

-- CreateIndex
CREATE INDEX "tender_validations_isValid_idx" ON "tender_validations"("isValid");

-- CreateIndex
CREATE INDEX "state_transitions_tenderId_idx" ON "state_transitions"("tenderId");

-- CreateIndex
CREATE INDEX "state_transitions_createdAt_idx" ON "state_transitions"("createdAt");

-- CreateIndex
CREATE INDEX "comments_tenderId_idx" ON "comments"("tenderId");

-- CreateIndex
CREATE INDEX "comments_authorId_idx" ON "comments"("authorId");

-- CreateIndex
CREATE INDEX "comments_createdAt_idx" ON "comments"("createdAt");

-- CreateIndex
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");

-- CreateIndex
CREATE INDEX "notifications_tenderId_idx" ON "notifications"("tenderId");

-- CreateIndex
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_timestamp_idx" ON "audit_logs"("tenantId", "timestamp");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE UNIQUE INDEX "system_config_key_key" ON "system_config"("key");

-- CreateIndex
CREATE INDEX "system_config_key_idx" ON "system_config"("key");

-- CreateIndex
CREATE INDEX "system_config_isActive_idx" ON "system_config"("isActive");

-- CreateIndex
CREATE INDEX "job_queue_name_status_idx" ON "job_queue"("name", "status");

-- CreateIndex
CREATE INDEX "job_queue_createdAt_idx" ON "job_queue"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "api_keys_key_key" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");

-- CreateIndex
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");

-- CreateIndex
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- CreateIndex
CREATE INDEX "scraping_logs_tenantId_status_idx" ON "scraping_logs"("tenantId", "status");

-- CreateIndex
CREATE INDEX "scraping_logs_sourcePortal_idx" ON "scraping_logs"("sourcePortal");

-- CreateIndex
CREATE INDEX "scraping_logs_startedAt_idx" ON "scraping_logs"("startedAt");

-- CreateIndex
CREATE INDEX "scraping_logs_status_idx" ON "scraping_logs"("status");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tenders" ADD CONSTRAINT "tenders_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_assignments" ADD CONSTRAINT "tender_assignments_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_assignments" ADD CONSTRAINT "tender_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_submittedBy_fkey" FOREIGN KEY ("submittedBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tender_validations" ADD CONSTRAINT "tender_validations_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "state_transitions" ADD CONSTRAINT "state_transitions_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comments" ADD CONSTRAINT "comments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_tenderId_fkey" FOREIGN KEY ("tenderId") REFERENCES "tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraping_logs" ADD CONSTRAINT "scraping_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scraping_logs" ADD CONSTRAINT "scraping_logs_triggeredBy_fkey" FOREIGN KEY ("triggeredBy") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Create full-text search indexes for PostgreSQL
CREATE INDEX IF NOT EXISTS tender_search_idx ON tenders USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
CREATE INDEX IF NOT EXISTS document_search_idx ON documents USING GIN(to_tsvector('english', filename || ' ' || "originalName"));

-- Create system configuration defaults
INSERT INTO system_config (id, key, value, description, "createdAt", "updatedAt") VALUES
  (gen_random_uuid(), 'max_file_size', '104857600', 'Maximum file upload size in bytes (100MB)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'allowed_file_types', '["pdf", "doc", "docx", "xls", "xlsx", "txt", "jpg", "jpeg", "png", "gif"]', 'Allowed file types for upload', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'tender_auto_archive_days', '365', 'Days after which completed tenders are auto-archived', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'notification_batch_size', '50', 'Number of notifications to process in a single batch', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'audit_retention_days', '2555', 'Days to retain audit logs (7 years for compliance)', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);