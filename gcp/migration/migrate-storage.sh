#!/bin/bash

# TenderFlow Storage Migration Script
# Migrates data from MinIO to Google Cloud Storage
# Usage: ./migrate-storage.sh [--dry-run] [--parallel-jobs=N]

set -euo pipefail

# Configuration
PROJECT_ID="tensurv"
REGION="us-central1"
MINIO_ENDPOINT="${MINIO_ENDPOINT:-localhost:9000}"
MINIO_ACCESS_KEY="${MINIO_ACCESS_KEY:-tenderflow}"
MINIO_SECRET_KEY="${MINIO_SECRET_KEY:-tenderflow123}"

# GCS Bucket Names
GCS_DOCUMENTS_BUCKET="tensurv-documents-prod"
GCS_THUMBNAILS_BUCKET="tensurv-thumbnails-prod"
GCS_TEMP_BUCKET="tensurv-temp-processing-prod"
GCS_BACKUP_BUCKET="tensurv-backups-prod"

# MinIO Bucket Names (from docker-compose)
MINIO_DOCUMENTS_BUCKET="tender-documents"
MINIO_UPLOADS_BUCKET="user-uploads"
MINIO_BACKUP_BUCKET="system-backups"

# Default options
DRY_RUN=false
PARALLEL_JOBS=4
VALIDATION_ENABLED=true
CLEANUP_TEMP=true

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --parallel-jobs=*)
      PARALLEL_JOBS="${1#*=}"
      shift
      ;;
    --no-validation)
      VALIDATION_ENABLED=false
      shift
      ;;
    --keep-temp)
      CLEANUP_TEMP=false
      shift
      ;;
    -h|--help)
      echo "Usage: $0 [OPTIONS]"
      echo "Options:"
      echo "  --dry-run              Show what would be done without making changes"
      echo "  --parallel-jobs=N      Number of parallel transfer jobs (default: 4)"
      echo "  --no-validation        Skip file integrity validation"
      echo "  --keep-temp            Keep temporary files after migration"
      echo "  -h, --help             Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $(date '+%Y-%m-%d %H:%M:%S') - $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check if gcloud is installed and authenticated
    if ! command -v gcloud &> /dev/null; then
        log_error "gcloud CLI is not installed"
        exit 1
    fi
    
    # Check if gsutil is installed
    if ! command -v gsutil &> /dev/null; then
        log_error "gsutil is not installed"
        exit 1
    fi
    
    # Check if mc (MinIO client) is installed
    if ! command -v mc &> /dev/null; then
        log_error "MinIO client (mc) is not installed"
        exit 1
    fi
    
    # Check authentication
    if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" | grep -q "."; then
        log_error "No active gcloud authentication found. Run 'gcloud auth login'"
        exit 1
    fi
    
    # Set project
    gcloud config set project $PROJECT_ID
    
    log_success "Prerequisites check passed"
}

# Configure MinIO client
configure_minio_client() {
    log_info "Configuring MinIO client..."
    
    if $DRY_RUN; then
        log_info "[DRY-RUN] Would configure MinIO client for $MINIO_ENDPOINT"
        return 0
    fi
    
    mc alias set minio "http://$MINIO_ENDPOINT" "$MINIO_ACCESS_KEY" "$MINIO_SECRET_KEY"
    
    # Test connection
    if ! mc admin info minio &> /dev/null; then
        log_error "Failed to connect to MinIO server at $MINIO_ENDPOINT"
        exit 1
    fi
    
    log_success "MinIO client configured successfully"
}

# Create temporary directory for migration
create_temp_directory() {
    TEMP_DIR=$(mktemp -d -t tenderflow-migration-XXXXXX)
    log_info "Created temporary directory: $TEMP_DIR"
    
    # Cleanup function
    cleanup() {
        if $CLEANUP_TEMP && [[ -n "${TEMP_DIR:-}" ]]; then
            log_info "Cleaning up temporary directory: $TEMP_DIR"
            rm -rf "$TEMP_DIR"
        fi
    }
    trap cleanup EXIT
}

# Validate GCS buckets exist
validate_gcs_buckets() {
    log_info "Validating GCS buckets..."
    
    local buckets=(
        "$GCS_DOCUMENTS_BUCKET"
        "$GCS_THUMBNAILS_BUCKET"
        "$GCS_TEMP_BUCKET"
        "$GCS_BACKUP_BUCKET"
    )
    
    for bucket in "${buckets[@]}"; do
        if ! gsutil ls "gs://$bucket" &> /dev/null; then
            log_error "GCS bucket gs://$bucket does not exist"
            log_info "Please run 'terraform apply' to create required buckets"
            exit 1
        fi
        log_success "Validated bucket: gs://$bucket"
    done
}

# Get file list from MinIO bucket
get_minio_file_list() {
    local bucket=$1
    local output_file=$2
    
    log_info "Getting file list from MinIO bucket: $bucket"
    
    if $DRY_RUN; then
        log_info "[DRY-RUN] Would list files from minio/$bucket"
        echo "example/file1.pdf" > "$output_file"
        echo "example/file2.jpg" >> "$output_file"
        return 0
    fi
    
    mc find "minio/$bucket" --name "*" > "$output_file"
    
    local file_count=$(wc -l < "$output_file")
    log_info "Found $file_count files in minio/$bucket"
}

# Calculate file checksums for validation
calculate_checksums() {
    local bucket=$1
    local file_list=$2
    local checksum_file=$3
    
    log_info "Calculating checksums for files in $bucket..."
    
    if $DRY_RUN; then
        log_info "[DRY-RUN] Would calculate checksums for files"
        echo "d41d8cd98f00b204e9800998ecf8427e  example/file1.pdf" > "$checksum_file"
        return 0
    fi
    
    > "$checksum_file"  # Clear file
    
    while IFS= read -r file; do
        if [[ -n "$file" ]]; then
            # Get file from MinIO and calculate MD5
            local temp_file="$TEMP_DIR/$(basename "$file")"
            mc cp "minio/$bucket/$file" "$temp_file"
            local checksum=$(md5sum "$temp_file" | cut -d' ' -f1)
            echo "$checksum  $file" >> "$checksum_file"
            rm -f "$temp_file"
        fi
    done < "$file_list"
    
    log_success "Checksums calculated for $(wc -l < "$checksum_file") files"
}

# Migrate single bucket
migrate_bucket() {
    local minio_bucket=$1
    local gcs_bucket=$2
    local description=$3
    
    log_info "Starting migration: $description"
    log_info "Source: minio/$minio_bucket -> Target: gs://$gcs_bucket"
    
    if $DRY_RUN; then
        log_info "[DRY-RUN] Would migrate $minio_bucket to $gcs_bucket"
        return 0
    fi
    
    # Create file lists and checksums if validation enabled
    local file_list="$TEMP_DIR/${minio_bucket}_files.txt"
    local checksum_file="$TEMP_DIR/${minio_bucket}_checksums.txt"
    
    get_minio_file_list "$minio_bucket" "$file_list"
    
    if $VALIDATION_ENABLED; then
        calculate_checksums "$minio_bucket" "$file_list" "$checksum_file"
    fi
    
    # Perform migration using gsutil with parallel processing
    log_info "Starting file transfer with $PARALLEL_JOBS parallel jobs..."
    
    # Use gsutil to copy files in parallel
    # First, sync files from MinIO to a temporary local directory
    local temp_bucket_dir="$TEMP_DIR/$minio_bucket"
    mkdir -p "$temp_bucket_dir"
    
    mc mirror --preserve "minio/$minio_bucket" "$temp_bucket_dir"
    
    # Then upload to GCS with parallel processing
    gsutil -m -o "GSUtil:parallel_thread_count=$PARALLEL_JOBS" \
           -o "GSUtil:parallel_process_count=$(($PARALLEL_JOBS/2))" \
           cp -r "$temp_bucket_dir/*" "gs://$gcs_bucket/"
    
    # Validate migration if enabled
    if $VALIDATION_ENABLED; then
        validate_migration "$gcs_bucket" "$checksum_file"
    fi
    
    log_success "Migration completed: $description"
}

# Validate migration integrity
validate_migration() {
    local gcs_bucket=$1
    local checksum_file=$2
    
    log_info "Validating migration integrity for gs://$gcs_bucket..."
    
    local errors=0
    
    while IFS= read -r line; do
        if [[ -n "$line" ]]; then
            local expected_checksum=$(echo "$line" | cut -d' ' -f1)
            local file_path=$(echo "$line" | cut -d' ' -f3-)
            
            # Get file from GCS and calculate checksum
            local temp_file="$TEMP_DIR/validate_$(basename "$file_path")"
            if gsutil cp "gs://$gcs_bucket/$file_path" "$temp_file" &> /dev/null; then
                local actual_checksum=$(md5sum "$temp_file" | cut -d' ' -f1)
                
                if [[ "$expected_checksum" == "$actual_checksum" ]]; then
                    log_info "✓ Validated: $file_path"
                else
                    log_error "✗ Checksum mismatch: $file_path"
                    log_error "  Expected: $expected_checksum"
                    log_error "  Actual: $actual_checksum"
                    ((errors++))
                fi
                rm -f "$temp_file"
            else
                log_error "✗ Failed to download for validation: $file_path"
                ((errors++))
            fi
        fi
    done < "$checksum_file"
    
    if [[ $errors -eq 0 ]]; then
        log_success "Migration validation passed - all files verified"
    else
        log_error "Migration validation failed - $errors errors found"
        exit 1
    fi
}

# Create migration report
create_migration_report() {
    local report_file="$TEMP_DIR/migration_report_$(date +%Y%m%d_%H%M%S).txt"
    
    log_info "Creating migration report: $report_file"
    
    cat > "$report_file" << EOF
TenderFlow Storage Migration Report
==================================
Date: $(date)
Project: $PROJECT_ID
Region: $REGION

Migration Configuration:
- Dry Run: $DRY_RUN
- Parallel Jobs: $PARALLEL_JOBS
- Validation: $VALIDATION_ENABLED
- Cleanup Temp: $CLEANUP_TEMP

Source (MinIO):
- Endpoint: $MINIO_ENDPOINT
- Documents Bucket: $MINIO_DOCUMENTS_BUCKET
- Uploads Bucket: $MINIO_UPLOADS_BUCKET
- Backup Bucket: $MINIO_BACKUP_BUCKET

Target (GCS):
- Documents Bucket: $GCS_DOCUMENTS_BUCKET
- Thumbnails Bucket: $GCS_THUMBNAILS_BUCKET
- Temp Bucket: $GCS_TEMP_BUCKET
- Backup Bucket: $GCS_BACKUP_BUCKET

Migration Steps Completed:
EOF

    # Add bucket statistics
    for bucket in "$GCS_DOCUMENTS_BUCKET" "$GCS_THUMBNAILS_BUCKET" "$GCS_BACKUP_BUCKET"; do
        if ! $DRY_RUN; then
            local object_count=$(gsutil ls "gs://$bucket/**" 2>/dev/null | wc -l || echo "0")
            local bucket_size=$(gsutil du -sh "gs://$bucket" 2>/dev/null | cut -f1 || echo "0B")
            echo "- $bucket: $object_count objects, $bucket_size" >> "$report_file"
        else
            echo "- $bucket: [DRY-RUN] Would report statistics" >> "$report_file"
        fi
    done
    
    echo "" >> "$report_file"
    echo "Migration completed successfully at: $(date)" >> "$report_file"
    
    # Copy report to GCS
    if ! $DRY_RUN; then
        gsutil cp "$report_file" "gs://$GCS_BACKUP_BUCKET/migration-reports/"
        log_success "Migration report uploaded to gs://$GCS_BACKUP_BUCKET/migration-reports/"
    fi
    
    log_success "Migration report created: $report_file"
}

# Main migration function
main() {
    log_info "Starting TenderFlow Storage Migration"
    log_info "Project: $PROJECT_ID, Region: $REGION"
    
    if $DRY_RUN; then
        log_warning "Running in DRY-RUN mode - no actual changes will be made"
    fi
    
    # Step 1: Prerequisites
    check_prerequisites
    
    # Step 2: Setup
    configure_minio_client
    create_temp_directory
    validate_gcs_buckets
    
    # Step 3: Migrate buckets
    migrate_bucket "$MINIO_DOCUMENTS_BUCKET" "$GCS_DOCUMENTS_BUCKET" "Tender Documents"
    migrate_bucket "$MINIO_UPLOADS_BUCKET" "$GCS_DOCUMENTS_BUCKET" "User Uploads"
    migrate_bucket "$MINIO_BACKUP_BUCKET" "$GCS_BACKUP_BUCKET" "System Backups"
    
    # Step 4: Create report
    create_migration_report
    
    log_success "TenderFlow Storage Migration completed successfully!"
    
    if ! $DRY_RUN; then
        log_info "Next steps:"
        log_info "1. Update application configuration to use GCS"
        log_info "2. Test document upload/download functionality"
        log_info "3. Verify CDN integration"
        log_info "4. Schedule MinIO cleanup after verification period"
    fi
}

# Run main function
main "$@"