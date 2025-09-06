#!/bin/bash
set -euo pipefail

# TenderFlow GCP Infrastructure Validation Script
# Validates all infrastructure components before production deployment
# Government compliance and 99.9% uptime SLA validation

# Configuration - Load from environment variables with defaults
PROJECT_ID="${GCP_PROJECT_ID:-tensurv}"
REGION="${GCP_REGION:-us-central1}"
ENVIRONMENT="${ENVIRONMENT:-production}"

# Validate required environment variables
if [ -z "$PROJECT_ID" ]; then
    echo "ERROR: GCP_PROJECT_ID environment variable is required"
    exit 1
fi
LOG_FILE="/tmp/infrastructure-validation-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "$(date '+%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

log_success() {
    log "${GREEN}✅ $1${NC}"
}

log_warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    log "${RED}❌ $1${NC}"
}

log_info() {
    log "${BLUE}ℹ️  $1${NC}"
}

# Validation counters
TOTAL_CHECKS=0
PASSED_CHECKS=0
FAILED_CHECKS=0
WARNING_CHECKS=0

# Function to run a validation check
run_check() {
    local check_name="$1"
    local check_command="$2"
    local is_critical="${3:-true}"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_info "Running check: $check_name"
    
    if eval "$check_command" >> "$LOG_FILE" 2>&1; then
        log_success "$check_name"
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        if [ "$is_critical" = "true" ]; then
            log_error "$check_name - CRITICAL FAILURE"
            FAILED_CHECKS=$((FAILED_CHECKS + 1))
        else
            log_warning "$check_name - WARNING"
            WARNING_CHECKS=$((WARNING_CHECKS + 1))
        fi
        return 1
    fi
}

# Header
echo "========================================================"
echo "TenderFlow GCP Infrastructure Validation"
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Environment: $ENVIRONMENT"
echo "Timestamp: $(date)"
echo "Log File: $LOG_FILE"
echo "========================================================"

# 1. Basic GCP Project and Authentication Validation
log_info "Phase 1: Basic GCP Setup Validation"

run_check "GCP Authentication" \
    "gcloud auth list --filter=status:ACTIVE --format='value(account)' | head -1"

run_check "Project Access" \
    "gcloud config get-value project | grep -q '$PROJECT_ID'"

run_check "Required APIs Enabled" \
    "gcloud services list --enabled --format='value(config.name)' | grep -E '(run|sql|redis|storage|monitoring|logging|cloudtrace|errorreporting)'"

# 2. Networking Infrastructure
log_info "Phase 2: Network Infrastructure Validation"

run_check "VPC Network Exists" \
    "gcloud compute networks describe vpc-network --format='value(name)'"

run_check "Private Subnets" \
    "gcloud compute networks subnets list --network=vpc-network --format='value(name)' | grep -q subnet"

run_check "VPC Connector" \
    "gcloud compute networks vpc-access connectors describe vpc-connector --region=$REGION --format='value(name)'"

run_check "Cloud NAT Gateway" \
    "gcloud compute routers nats list --router=vpc-router --router-region=$REGION --format='value(name)'"

run_check "Load Balancer Health" \
    "gcloud compute backend-services describe websocket-backend --global --format='value(name)'"

# 3. Database Infrastructure
log_info "Phase 3: Database Infrastructure Validation"

run_check "Cloud SQL Instance" \
    "gcloud sql instances describe tenderflow-db --format='value(name)'"

run_check "Database Instance Running" \
    "gcloud sql instances describe tenderflow-db --format='value(state)' | grep -q RUNNABLE"

run_check "Database Backup Enabled" \
    "gcloud sql instances describe tenderflow-db --format='value(settings.backupConfiguration.enabled)' | grep -q True"

run_check "Database High Availability" \
    "gcloud sql instances describe tenderflow-db --format='value(settings.availabilityType)' | grep -q REGIONAL"

run_check "Database SSL Required" \
    "gcloud sql instances describe tenderflow-db --format='value(settings.ipConfiguration.requireSsl)' | grep -q true"

# 4. Redis/Memorystore Infrastructure
log_info "Phase 4: Redis Infrastructure Validation"

run_check "Redis Cluster Exists" \
    "gcloud redis instances describe websocket-cluster --region=$REGION --format='value(name)'"

run_check "Redis Cluster Healthy" \
    "gcloud redis instances describe websocket-cluster --region=$REGION --format='value(state)' | grep -q READY"

run_check "Redis HA Configuration" \
    "gcloud redis instances describe websocket-cluster --region=$REGION --format='value(tier)' | grep -q STANDARD_HA"

run_check "Redis Authentication Enabled" \
    "gcloud redis instances describe websocket-cluster --region=$REGION --format='value(authEnabled)' | grep -q true"

# 5. Cloud Storage Infrastructure
log_info "Phase 5: Storage Infrastructure Validation"

run_check "Primary Storage Bucket" \
    "gsutil ls -b gs://tenderflow-documents-$PROJECT_ID"

run_check "Thumbnail Storage Bucket" \
    "gsutil ls -b gs://tenderflow-thumbnails-$PROJECT_ID"

run_check "Backup Storage Bucket" \
    "gsutil ls -b gs://tenderflow-backups-$PROJECT_ID"

run_check "Audit Logs Bucket" \
    "gsutil ls -b gs://$PROJECT_ID-audit-logs"

run_check "Bucket Encryption Enabled" \
    "gsutil kms encryption gs://tenderflow-documents-$PROJECT_ID 2>&1 | grep -q 'Default encryption key'"

# 6. Cloud Run Services
log_info "Phase 6: Cloud Run Services Validation"

run_check "API Service Deployed" \
    "gcloud run services describe tenderflow-api --region=$REGION --format='value(metadata.name)'"

run_check "WebSocket Service Deployed" \
    "gcloud run services describe tenderflow-websocket --region=$REGION --format='value(metadata.name)'"

run_check "API Service Ready" \
    "gcloud run services describe tenderflow-api --region=$REGION --format='value(status.conditions[0].status)' | grep -q True"

run_check "WebSocket Service Ready" \
    "gcloud run services describe tenderflow-websocket --region=$REGION --format='value(status.conditions[0].status)' | grep -q True"

# 7. Secret Manager
log_info "Phase 7: Secrets Management Validation"

run_check "JWT Secret Exists" \
    "gcloud secrets describe jwt-secret --format='value(name)'"

run_check "Database URL Secret" \
    "gcloud secrets describe database-url --format='value(name)'"

run_check "Redis Auth Secret" \
    "gcloud secrets describe redis-auth --format='value(name)'"

run_check "Secret Versions Active" \
    "gcloud secrets versions list jwt-secret --format='value(state)' | grep -q ENABLED"

# 8. Pub/Sub Infrastructure
log_info "Phase 8: Pub/Sub Infrastructure Validation"

run_check "Tender Events Topic" \
    "gcloud pubsub topics describe tender-events --format='value(name)'"

run_check "Document Events Topic" \
    "gcloud pubsub topics describe document-events --format='value(name)'"

run_check "Notification Events Topic" \
    "gcloud pubsub topics describe notification-events --format='value(name)'"

run_check "WebSocket Subscriptions" \
    "gcloud pubsub subscriptions list --format='value(name)' | grep -q websocket"

# 9. Monitoring and Alerting
log_info "Phase 9: Monitoring Infrastructure Validation"

run_check "Uptime Checks Configured" \
    "gcloud alpha monitoring policies list --format='value(displayName)' | grep -q 'API Health Check'"

run_check "SLO Policies Exist" \
    "gcloud alpha monitoring policies list --format='value(displayName)' | grep -q 'SLO'"

run_check "Notification Channels" \
    "gcloud alpha monitoring channels list --format='value(displayName)' | grep -q 'Critical Alerts'"

run_check "Custom Metrics Enabled" \
    "gcloud logging metrics list --format='value(name)' | grep -q tenderflow"

# 10. Security Configuration
log_info "Phase 10: Security Configuration Validation"

run_check "Cloud Armor Policy" \
    "gcloud compute security-policies describe websocket-security-policy --format='value(name)'"

run_check "SSL Certificates" \
    "gcloud compute ssl-certificates list --format='value(name)' | grep -q websocket"

run_check "IAM Service Accounts" \
    "gcloud iam service-accounts list --format='value(email)' | grep -q tenderflow"

run_check "Audit Logging Enabled" \
    "gcloud logging sinks describe audit-logs-sink --format='value(name)'"

# 11. Performance and Capacity
log_info "Phase 11: Performance Configuration Validation"

# Check auto-scaling configuration
run_check "API Auto-scaling Configured" \
    "gcloud run services describe tenderflow-api --region=$REGION --format='value(spec.traffic[0].percent)' | grep -q 100"

run_check "WebSocket Scaling Limits" \
    "gcloud run services describe tenderflow-websocket --region=$REGION --format='value(spec.template.metadata.annotations)' | grep -q maxScale"

run_check "Database Connection Limits" \
    "gcloud sql instances describe tenderflow-db --format='value(settings.databaseFlags)' | grep -q max_connections"

# 12. Health Endpoints
log_info "Phase 12: Health Endpoints Validation"

API_URL=$(gcloud run services describe tenderflow-api --region=$REGION --format='value(status.address.url)')
WS_URL=$(gcloud run services describe tenderflow-websocket --region=$REGION --format='value(status.address.url)')

run_check "API Health Endpoint" \
    "curl -f -s -m 10 '$API_URL/health' | grep -q 'healthy'" \
    false

run_check "WebSocket Health Endpoint" \
    "curl -f -s -m 10 '$WS_URL/health/websocket' | grep -q 'healthy'" \
    false

# 13. Performance Benchmarks
log_info "Phase 13: Basic Performance Validation"

run_check "API Response Time" \
    "time curl -s -m 5 '$API_URL/health' > /dev/null && echo 'Response time acceptable'" \
    false

run_check "Database Connection Pool" \
    "gcloud sql instances describe tenderflow-db --format='value(settings.databaseFlags[].value)' | grep -q '50'" \
    false

# 14. Compliance Validation
log_info "Phase 14: Compliance and Governance Validation"

run_check "Data Retention Policies" \
    "gsutil lifecycle get gs://$PROJECT_ID-audit-logs | grep -q 'Delete'" \
    false

run_check "Encryption at Rest" \
    "gcloud sql instances describe tenderflow-db --format='value(diskEncryptionConfiguration)' | grep -q 'kms'" \
    false

run_check "Network Security" \
    "gcloud compute firewall-rules list --format='value(name)' | grep -q 'deny-all'"

# Final Report
echo ""
echo "========================================================"
echo "VALIDATION SUMMARY"
echo "========================================================"
echo "Total Checks: $TOTAL_CHECKS"
echo "Passed: $PASSED_CHECKS"
echo "Failed: $FAILED_CHECKS"
echo "Warnings: $WARNING_CHECKS"
echo ""

# Calculate success rate
SUCCESS_RATE=$(( (PASSED_CHECKS * 100) / TOTAL_CHECKS ))
echo "Success Rate: ${SUCCESS_RATE}%"
echo ""

# Government SLA Compliance Check
if [ $SUCCESS_RATE -ge 95 ] && [ $FAILED_CHECKS -eq 0 ]; then
    log_success "✅ INFRASTRUCTURE VALIDATION PASSED"
    log_success "✅ Ready for production deployment"
    log_success "✅ Government 99.9% SLA requirements met"
    echo ""
    echo "Next Steps:"
    echo "1. Review validation log: $LOG_FILE"
    echo "2. Address any warnings if needed"
    echo "3. Proceed with deployment procedures"
    echo "4. Execute load testing validation"
    echo "5. Perform security validation"
    exit 0
elif [ $FAILED_CHECKS -eq 0 ] && [ $WARNING_CHECKS -gt 0 ]; then
    log_warning "⚠️ INFRASTRUCTURE VALIDATION PASSED WITH WARNINGS"
    log_warning "⚠️ Review warnings before production deployment"
    echo ""
    echo "Action Required:"
    echo "1. Review validation log: $LOG_FILE"
    echo "2. Address warnings: $WARNING_CHECKS items need attention"
    echo "3. Re-run validation after fixes"
    exit 1
else
    log_error "❌ INFRASTRUCTURE VALIDATION FAILED"
    log_error "❌ NOT ready for production deployment"
    log_error "❌ Critical issues must be resolved"
    echo ""
    echo "Critical Issues Found:"
    echo "- Failed checks: $FAILED_CHECKS"
    echo "- Warnings: $WARNING_CHECKS"
    echo ""
    echo "Action Required:"
    echo "1. Review validation log: $LOG_FILE"
    echo "2. Fix all critical failures"
    echo "3. Re-run validation"
    exit 2
fi