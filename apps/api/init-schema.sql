-- TenderFlow Database Schema Initialization
-- This script creates all tables and indexes for the TenderFlow system

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create ENUM types
CREATE TYPE "TenderStatus" AS ENUM ('SCRAPED', 'VALIDATED', 'QUALIFIED', 'IN_BID', 'SUBMITTED', 'WON', 'LOST', 'ARCHIVED');
CREATE TYPE "TenderCategory" AS ENUM ('CONSTRUCTION', 'IT_SERVICES', 'CONSULTING', 'SUPPLIES', 'MAINTENANCE', 'RESEARCH', 'TRAINING', 'OTHER');
CREATE TYPE "UserRole" AS ENUM ('admin', 'member', 'viewer');
CREATE TYPE "TenderRole" AS ENUM ('owner', 'contributor', 'viewer');
CREATE TYPE "DocumentType" AS ENUM ('RFP', 'TECHNICAL_SPEC', 'COMMERCIAL', 'LEGAL', 'SUBMISSION', 'RECEIPT', 'SUPPORT');
CREATE TYPE "SubmissionMethod" AS ENUM ('PORTAL', 'EMAIL', 'PHYSICAL', 'OTHER');
CREATE TYPE "NotificationType" AS ENUM ('TENDER_ASSIGNED', 'TENDER_STATUS_CHANGED', 'SUBMISSION_DUE', 'BID_UPDATED', 'DOCUMENT_UPLOADED', 'COMMENT_ADDED', 'SYSTEM_ALERT');
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'VIEW', 'DOWNLOAD', 'UPLOAD', 'TRANSITION', 'ASSIGN', 'UNASSIGN', 'LOGIN', 'LOGOUT');

-- Create Tenants table
CREATE TABLE "tenants" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR NOT NULL,
    "subdomain" VARCHAR UNIQUE NOT NULL,
    "settings" JSONB DEFAULT '{}',
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "deletedAt" TIMESTAMP
);

-- Create indexes for tenants
CREATE INDEX "tenants_subdomain_idx" ON "tenants"("subdomain");
CREATE INDEX "tenants_isActive_idx" ON "tenants"("isActive");

-- Create Users table
CREATE TABLE "users" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "email" VARCHAR NOT NULL,
    "firstName" VARCHAR NOT NULL,
    "lastName" VARCHAR NOT NULL,
    "role" "UserRole" DEFAULT 'member',
    "isActive" BOOLEAN DEFAULT true,
    "lastLoginAt" TIMESTAMP,
    "settings" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "deletedAt" TIMESTAMP,
    UNIQUE("tenantId", "email")
);

-- Create indexes for users
CREATE INDEX "users_tenantId_role_idx" ON "users"("tenantId", "role");
CREATE INDEX "users_email_idx" ON "users"("email");
CREATE INDEX "users_isActive_idx" ON "users"("isActive");

-- Create Tenders table
CREATE TABLE "tenders" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "title" VARCHAR NOT NULL,
    "description" TEXT,
    "status" "TenderStatus" DEFAULT 'SCRAPED',
    "category" "TenderCategory" DEFAULT 'OTHER',
    "publishedAt" TIMESTAMP,
    "deadline" TIMESTAMP,
    "estimatedValue" DECIMAL(15,2),
    "currency" VARCHAR DEFAULT 'USD',
    "source" VARCHAR,
    "externalId" VARCHAR,
    "metadata" JSONB DEFAULT '{}',
    "requirements" JSONB DEFAULT '{}',
    "createdBy" UUID NOT NULL REFERENCES "users"("id"),
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "deletedAt" TIMESTAMP
);

-- Create indexes for tenders
CREATE INDEX "tenders_tenantId_status_idx" ON "tenders"("tenantId", "status");
CREATE INDEX "tenders_category_idx" ON "tenders"("category");
CREATE INDEX "tenders_deadline_idx" ON "tenders"("deadline");
CREATE INDEX "tenders_publishedAt_idx" ON "tenders"("publishedAt");
CREATE INDEX "tenders_externalId_idx" ON "tenders"("externalId");
CREATE INDEX "tenders_createdBy_idx" ON "tenders"("createdBy");

-- Create Tender Assignments table
CREATE TABLE "tender_assignments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "role" "TenderRole" NOT NULL,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    UNIQUE("tenderId", "userId")
);

-- Create indexes for tender assignments
CREATE INDEX "tender_assignments_tenderId_role_idx" ON "tender_assignments"("tenderId", "role");
CREATE INDEX "tender_assignments_userId_idx" ON "tender_assignments"("userId");

-- Create Documents table
CREATE TABLE "documents" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "uploadedBy" UUID NOT NULL REFERENCES "users"("id"),
    "filename" VARCHAR NOT NULL,
    "originalName" VARCHAR NOT NULL,
    "mimeType" VARCHAR NOT NULL,
    "size" INTEGER NOT NULL,
    "s3Key" VARCHAR UNIQUE NOT NULL,
    "s3Bucket" VARCHAR NOT NULL,
    "type" "DocumentType" NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "isDeleted" BOOLEAN DEFAULT false,
    "uploadedAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for documents
CREATE INDEX "documents_tenderId_type_idx" ON "documents"("tenderId", "type");
CREATE INDEX "documents_uploadedBy_idx" ON "documents"("uploadedBy");
CREATE INDEX "documents_s3Key_idx" ON "documents"("s3Key");
CREATE INDEX "documents_isDeleted_idx" ON "documents"("isDeleted");

-- Create Bids table
CREATE TABLE "bids" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID UNIQUE NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "ownerId" UUID REFERENCES "users"("id"),
    "totalAmount" DECIMAL(15,2),
    "currency" VARCHAR DEFAULT 'USD',
    "tasks" JSONB DEFAULT '{}',
    "timeline" JSONB DEFAULT '{}',
    "methodology" JSONB DEFAULT '{}',
    "team" JSONB DEFAULT '{}',
    "assumptions" JSONB DEFAULT '{}',
    "riskAssessment" JSONB DEFAULT '{}',
    "qualityPlan" JSONB DEFAULT '{}',
    "deliverables" JSONB DEFAULT '{}',
    "notes" TEXT,
    "isSubmitted" BOOLEAN DEFAULT false,
    "submittedAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for bids
CREATE INDEX "bids_tenderId_idx" ON "bids"("tenderId");
CREATE INDEX "bids_ownerId_idx" ON "bids"("ownerId");
CREATE INDEX "bids_isSubmitted_idx" ON "bids"("isSubmitted");

-- Create Submissions table
CREATE TABLE "submissions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "method" "SubmissionMethod" NOT NULL,
    "submittedAt" TIMESTAMP NOT NULL,
    "submittedBy" UUID NOT NULL REFERENCES "users"("id"),
    "externalRef" VARCHAR,
    "receiptKey" VARCHAR,
    "parsed" JSONB,
    "parsedAt" TIMESTAMP,
    "parseVersion" VARCHAR,
    "amount" DECIMAL(15,2),
    "currency" VARCHAR,
    "status" VARCHAR,
    "portalData" JSONB DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for submissions
CREATE INDEX "submissions_tenderId_idx" ON "submissions"("tenderId");
CREATE INDEX "submissions_externalRef_idx" ON "submissions"("externalRef");
CREATE INDEX "submissions_submittedBy_idx" ON "submissions"("submittedBy");
CREATE INDEX "submissions_submittedAt_idx" ON "submissions"("submittedAt");

-- Create Tender Validations table
CREATE TABLE "tender_validations" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "criteria" JSONB NOT NULL,
    "score" DECIMAL(5,2),
    "isValid" BOOLEAN DEFAULT false,
    "validatedBy" VARCHAR,
    "validatedAt" TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for tender validations
CREATE INDEX "tender_validations_tenderId_idx" ON "tender_validations"("tenderId");
CREATE INDEX "tender_validations_isValid_idx" ON "tender_validations"("isValid");

-- Create State Transitions table
CREATE TABLE "state_transitions" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "fromStatus" "TenderStatus",
    "toStatus" "TenderStatus" NOT NULL,
    "triggeredBy" VARCHAR NOT NULL,
    "reason" VARCHAR,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for state transitions
CREATE INDEX "state_transitions_tenderId_idx" ON "state_transitions"("tenderId");
CREATE INDEX "state_transitions_createdAt_idx" ON "state_transitions"("createdAt");

-- Create Comments table
CREATE TABLE "comments" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenderId" UUID NOT NULL REFERENCES "tenders"("id") ON DELETE CASCADE,
    "authorId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "content" TEXT NOT NULL,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW(),
    "deletedAt" TIMESTAMP
);

-- Create indexes for comments
CREATE INDEX "comments_tenderId_idx" ON "comments"("tenderId");
CREATE INDEX "comments_authorId_idx" ON "comments"("authorId");
CREATE INDEX "comments_createdAt_idx" ON "comments"("createdAt");

-- Create Notifications table
CREATE TABLE "notifications" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "userId" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
    "tenderId" UUID REFERENCES "tenders"("id") ON DELETE CASCADE,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR NOT NULL,
    "message" VARCHAR NOT NULL,
    "data" JSONB DEFAULT '{}',
    "isRead" BOOLEAN DEFAULT false,
    "readAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for notifications
CREATE INDEX "notifications_userId_isRead_idx" ON "notifications"("userId", "isRead");
CREATE INDEX "notifications_tenderId_idx" ON "notifications"("tenderId");
CREATE INDEX "notifications_createdAt_idx" ON "notifications"("createdAt");

-- Create Audit Logs table
CREATE TABLE "audit_logs" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" UUID NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
    "userId" UUID REFERENCES "users"("id"),
    "action" "AuditAction" NOT NULL,
    "resource" VARCHAR NOT NULL,
    "resourceId" VARCHAR NOT NULL,
    "oldValues" JSONB,
    "newValues" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "ipAddress" VARCHAR,
    "userAgent" VARCHAR,
    "timestamp" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for audit logs
CREATE INDEX "audit_logs_tenantId_timestamp_idx" ON "audit_logs"("tenantId", "timestamp");
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");
CREATE INDEX "audit_logs_resource_resourceId_idx" ON "audit_logs"("resource", "resourceId");
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- Create System Config table
CREATE TABLE "system_config" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "key" VARCHAR UNIQUE NOT NULL,
    "value" JSONB NOT NULL,
    "description" VARCHAR,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for system config
CREATE INDEX "system_config_key_idx" ON "system_config"("key");
CREATE INDEX "system_config_isActive_idx" ON "system_config"("isActive");

-- Create Job Queue table
CREATE TABLE "job_queue" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "name" VARCHAR NOT NULL,
    "data" JSONB NOT NULL,
    "priority" INTEGER DEFAULT 0,
    "attempts" INTEGER DEFAULT 0,
    "maxAttempts" INTEGER DEFAULT 3,
    "status" VARCHAR DEFAULT 'waiting',
    "processedAt" TIMESTAMP,
    "failedAt" TIMESTAMP,
    "error" VARCHAR,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for job queue
CREATE INDEX "job_queue_name_status_idx" ON "job_queue"("name", "status");
CREATE INDEX "job_queue_createdAt_idx" ON "job_queue"("createdAt");

-- Create API Keys table
CREATE TABLE "api_keys" (
    "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    "tenantId" UUID REFERENCES "tenants"("id") ON DELETE CASCADE,
    "name" VARCHAR NOT NULL,
    "key" VARCHAR UNIQUE NOT NULL,
    "permissions" JSONB DEFAULT '[]',
    "isActive" BOOLEAN DEFAULT true,
    "lastUsedAt" TIMESTAMP,
    "expiresAt" TIMESTAMP,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- Create indexes for API keys
CREATE INDEX "api_keys_key_idx" ON "api_keys"("key");
CREATE INDEX "api_keys_tenantId_idx" ON "api_keys"("tenantId");
CREATE INDEX "api_keys_isActive_idx" ON "api_keys"("isActive");

-- Create full-text search indexes
CREATE INDEX CONCURRENTLY "tender_search_idx" ON "tenders" USING GIN(to_tsvector('english', "title" || ' ' || COALESCE("description", '')));
CREATE INDEX CONCURRENTLY "document_search_idx" ON "documents" USING GIN(to_tsvector('english', "filename" || ' ' || "originalName"));

-- Create update timestamp triggers
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW."updatedAt" = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply update triggers to all tables with updatedAt columns
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON "tenants" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON "users" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tenders_updated_at BEFORE UPDATE ON "tenders" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tender_assignments_updated_at BEFORE UPDATE ON "tender_assignments" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_documents_updated_at BEFORE UPDATE ON "documents" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_bids_updated_at BEFORE UPDATE ON "bids" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_submissions_updated_at BEFORE UPDATE ON "submissions" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_tender_validations_updated_at BEFORE UPDATE ON "tender_validations" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_comments_updated_at BEFORE UPDATE ON "comments" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_system_config_updated_at BEFORE UPDATE ON "system_config" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_job_queue_updated_at BEFORE UPDATE ON "job_queue" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON "api_keys" FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();