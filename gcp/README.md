# TenderFlow GCP Storage Migration Guide

This directory contains all configuration files, scripts, and documentation needed to migrate TenderFlow's document storage from MinIO to Google Cloud Storage (GCS).

## 📋 Overview

The migration moves from:
- **Source**: MinIO object storage (self-hosted)
- **Target**: Google Cloud Storage with Cloud CDN integration
- **Project**: tensurv (us-central1 region)
- **Compliance**: Government data retention (7 years)

## 🗂️ Directory Structure

```
gcp/
├── README.md                          # This file
├── storage/
│   └── bucket-config.yaml            # GCS bucket configurations
├── terraform/
│   └── storage.tf                     # Infrastructure as Code
├── migration/
│   ├── migrate-storage.sh             # Main migration script
│   ├── validate-migration.ts          # Migration validation
│   └── storage-transfer-config.json   # Transfer Service config
├── cdn/
│   └── cdn-config.yaml                # Cloud CDN configuration
├── docker/
│   └── docker-compose.gcs.yml         # Local development with GCS emulator
└── dependencies/
    └── gcs-package-updates.json       # Required package.json changes
```

## 🚀 Quick Start

### 1. Prerequisites

```bash
# Install required tools
npm install -g @google-cloud/cli
curl -O https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-cli-linux-x86_64.tar.gz
tar -xf google-cloud-cli-linux-x86_64.tar.gz
./google-cloud-sdk/install.sh

# Install Terraform
wget https://releases.hashicorp.com/terraform/1.6.0/terraform_1.6.0_linux_amd64.zip
unzip terraform_1.6.0_linux_amd64.zip
sudo mv terraform /usr/local/bin/

# Install MinIO client
wget https://dl.min.io/client/mc/release/linux-amd64/mc
chmod +x mc
sudo mv mc /usr/local/bin/
```

### 2. Authentication

```bash
# Authenticate with Google Cloud
gcloud auth login
gcloud config set project tensurv
gcloud auth application-default login
```

### 3. Deploy Infrastructure

```bash
# Deploy GCS buckets and IAM
cd gcp/terraform
terraform init
terraform plan
terraform apply

# Verify deployment
gsutil ls
```

### 4. Run Migration

```bash
# Dry run first (recommended)
cd gcp/migration
./migrate-storage.sh --dry-run --verbose

# Execute migration
./migrate-storage.sh --parallel-jobs=8 --verbose

# Validate migration
npx tsx validate-migration.ts --verbose --sample-size=100
```

## 🏗️ Infrastructure Components

### GCS Buckets

| Bucket | Purpose | Storage Class | Lifecycle |
|--------|---------|---------------|-----------|
| `tensurv-documents-prod` | Primary documents | STANDARD → NEARLINE (90d) → COLDLINE (365d) | 7 years |
| `tensurv-thumbnails-prod` | Generated thumbnails | STANDARD → NEARLINE (30d) | 180 days |
| `tensurv-temp-processing-prod` | Temporary files | STANDARD | 1 day |
| `tensurv-backups-prod` | System backups | COLDLINE → ARCHIVE (365d) | 7 years |

### Security Features

- **Encryption**: Customer-managed keys (Cloud KMS)
- **Access Control**: Uniform bucket-level access
- **IAM**: Least-privilege service accounts
- **Audit**: Cloud Audit Logs enabled
- **Network**: Private Google Access

### CDN Integration

- **Backend**: Cloud Storage backend buckets
- **Caching**: 24-hour default TTL, 30-day max TTL
- **Compression**: Automatic gzip compression
- **Security**: CORS policies, custom headers

## 📊 Migration Process

### Phase 1: Infrastructure Setup

1. **Deploy GCS Infrastructure**
   ```bash
   cd gcp/terraform
   terraform apply -target=google_kms_key_ring.tenderflow_keyring
   terraform apply -target=google_kms_crypto_key.storage_key
   terraform apply -target=google_storage_bucket.documents
   ```

2. **Configure Service Accounts**
   ```bash
   terraform apply -target=google_service_account.storage_service_account
   ```

3. **Set up CDN**
   ```bash
   terraform apply -target=google_compute_backend_bucket.thumbnails_backend
   ```

### Phase 2: Data Migration

1. **Pre-migration Validation**
   ```bash
   # Check MinIO connectivity
   mc admin info minio

   # Verify GCS access
   gsutil ls gs://tensurv-documents-prod
   ```

2. **Execute Migration**
   ```bash
   # Start migration
   ./migrate-storage.sh --verbose

   # Monitor progress
   tail -f migration_*.log
   ```

3. **Post-migration Validation**
   ```bash
   # Comprehensive validation
   npx tsx validate-migration.ts --verbose

   # Quick spot checks
   gsutil ls -l gs://tensurv-documents-prod/**
   ```

### Phase 3: Application Updates

1. **Update Dependencies**
   ```bash
   # Install GCS client libraries
   npm install @google-cloud/storage @google-cloud/secret-manager

   # Remove MinIO dependency
   npm uninstall minio
   ```

2. **Update Code**
   - Replace `FileStorageService` with `GCSFileStorageService`
   - Update environment variables
   - Test file upload/download flows

3. **Deploy Application**
   ```bash
   # Deploy with GCS configuration
   docker-compose -f docker-compose.yml -f gcp/docker/docker-compose.gcs.yml up
   ```

## 🧪 Development & Testing

### Local Development with GCS Emulator

```bash
# Start GCS emulator
docker-compose -f docker-compose.yml -f gcp/docker/docker-compose.gcs.yml up

# Test file operations
export STORAGE_EMULATOR_HOST=localhost:4443
gsutil mb gs://test-bucket
echo "test" | gsutil cp - gs://test-bucket/test.txt
```

### Testing Checklist

- [ ] File upload functionality
- [ ] File download with signed URLs  
- [ ] Thumbnail generation pipeline
- [ ] Document OCR processing
- [ ] Virus scanning integration
- [ ] CDN cache behavior
- [ ] Lifecycle policy triggers
- [ ] Backup and restore procedures

## 🔧 Configuration

### Environment Variables

**Required:**
```bash
export GCP_PROJECT_ID=tensurv
export GCS_DOCUMENTS_BUCKET=tensurv-documents-prod
export GCS_THUMBNAILS_BUCKET=tensurv-thumbnails-prod
export GCS_TEMP_BUCKET=tensurv-temp-processing-prod
export GCS_BACKUP_BUCKET=tensurv-backups-prod
```

**Optional:**
```bash
export GCP_SERVICE_ACCOUNT_KEY=/path/to/service-account.json
export CDN_DOMAIN=https://cdn.tenderflow.gov
export GCP_REGION=us-central1
```

### Application Configuration

Update your application's storage configuration:

```typescript
// Before (MinIO)
import { fileStorageService } from './services/file-storage';

// After (GCS)
import { gcsFileStorageService as fileStorageService } from './services/gcs-file-storage';
```

## 📈 Monitoring & Maintenance

### Key Metrics

- **Storage Usage**: Monitor bucket sizes and costs
- **CDN Performance**: Cache hit ratios, latency
- **Error Rates**: Failed uploads/downloads
- **Lifecycle Actions**: Automatic tier transitions

### Maintenance Tasks

**Daily:**
- Monitor error logs
- Check backup completion
- Review storage costs

**Weekly:**
- Analyze CDN performance
- Review access patterns
- Optimize lifecycle policies

**Monthly:**
- Security compliance review
- Cost optimization analysis
- Disaster recovery testing

## 🚨 Troubleshooting

### Common Issues

**Migration Failures:**
```bash
# Check MinIO connectivity
mc admin info minio

# Verify GCS permissions
gsutil iam get gs://tensurv-documents-prod

# Check transfer logs
cat migration_*.log | grep ERROR
```

**Application Errors:**
```bash
# Check service account permissions
gcloud projects get-iam-policy tensurv

# Verify bucket access
gsutil ls gs://tensurv-documents-prod

# Test signed URL generation
gsutil signurl service-account.json gs://bucket/file.txt
```

**CDN Issues:**
```bash
# Check backend bucket health
gcloud compute backend-buckets describe tenderflow-thumbnails-backend

# Invalidate cache
gcloud compute url-maps invalidate-cdn-cache tenderflow-cdn-url-map --path "/*"
```

### Support Contacts

- **GCP Support**: Premium support ticket system
- **Migration Team**: [Your team contact]
- **On-call Engineer**: [Rotation schedule]

## 📚 Additional Resources

- [Google Cloud Storage Documentation](https://cloud.google.com/storage/docs)
- [Cloud CDN Best Practices](https://cloud.google.com/cdn/docs/best-practices)
- [Storage Transfer Service Guide](https://cloud.google.com/storage-transfer/docs)
- [TenderFlow Architecture Documentation](../docs/architecture/)

## 🔒 Security & Compliance

### Data Classification
- **Sensitive**: Government tender documents
- **Retention**: 7-year legal requirement
- **Encryption**: Customer-managed keys
- **Access**: Role-based with audit trails

### Compliance Features
- Audit logging for all operations
- Geographic data residency (us-central1)
- Encryption at rest and in transit
- Regular security assessments
- Data loss prevention scanning

---

**Migration Status**: Ready for Phase 1 deployment
**Last Updated**: 2025-01-14
**Version**: 1.0