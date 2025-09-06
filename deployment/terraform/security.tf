# Enhanced Security Configuration for TenderFlow
# Based on GCP Security Compliance Architect recommendations

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

# ============================================
# Workload Identity Configuration
# ============================================

# Enable Workload Identity on GKE cluster (if using GKE)
resource "google_container_cluster" "tenderflow_cluster" {
  count = var.enable_gke ? 1 : 0
  
  name     = "tenderflow-cluster-${var.environment}"
  location = var.region
  
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }
  
  initial_node_count = 1
  remove_default_node_pool = true
}

# Workload Identity for Cloud Run
resource "google_service_account" "workload_identity_api" {
  account_id   = "tenderflow-api-wi"
  display_name = "TenderFlow API Workload Identity"
  description  = "Service account for API with Workload Identity"
}

resource "google_service_account" "workload_identity_scraper" {
  account_id   = "tenderflow-scraper-wi"
  display_name = "TenderFlow Scraper Workload Identity"
  description  = "Service account for Scraper with Workload Identity"
}

# Bind service accounts to Workload Identity
resource "google_service_account_iam_member" "api_workload_identity" {
  service_account_id = google_service_account.workload_identity_api.name
  role               = "roles/iam.workloadIdentityUser"
  member            = "serviceAccount:${var.project_id}.svc.id.goog[tenderflow/api-service]"
}

# ============================================
# Customer-Managed Encryption Keys (CMEK)
# ============================================

# Separate key rings for different data classifications
resource "google_kms_key_ring" "confidential_data" {
  name     = "tenderflow-confidential-${var.environment}"
  location = var.region
}

resource "google_kms_key_ring" "pii_data" {
  name     = "tenderflow-pii-${var.environment}"
  location = var.region
}

resource "google_kms_key_ring" "system_data" {
  name     = "tenderflow-system-${var.environment}"
  location = var.region
}

# Database encryption key with 30-day rotation
resource "google_kms_crypto_key" "database_cmek" {
  name            = "database-cmek"
  key_ring        = google_kms_key_ring.confidential_data.id
  rotation_period = "2592000s" # 30 days for high-sensitivity data
  
  lifecycle {
    prevent_destroy = true
  }
}

# Document encryption key with envelope encryption
resource "google_kms_crypto_key" "document_envelope" {
  name            = "document-envelope-key"
  key_ring        = google_kms_key_ring.confidential_data.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days
  
  version_template {
    algorithm = "GOOGLE_SYMMETRIC_ENCRYPTION"
  }
  
  lifecycle {
    prevent_destroy = true
  }
}

# PII data encryption key
resource "google_kms_crypto_key" "pii_encryption" {
  name            = "pii-encryption-key"
  key_ring        = google_kms_key_ring.pii_data.id
  rotation_period = "2592000s" # 30 days for PII
  
  lifecycle {
    prevent_destroy = true
  }
}

# ============================================
# Multi-Tier VPC Architecture
# ============================================

# Main VPC Network
resource "google_compute_network" "tenderflow_vpc" {
  name                    = "tenderflow-vpc-${var.environment}"
  auto_create_subnetworks = false
  routing_mode           = "REGIONAL"
}

# Web Tier Subnet (Public-facing)
resource "google_compute_subnetwork" "web_tier" {
  name          = "tenderflow-web-tier"
  network       = google_compute_network.tenderflow_vpc.id
  region        = var.region
  ip_cidr_range = "10.0.1.0/24"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling       = 0.5
    metadata           = "INCLUDE_ALL_METADATA"
  }
}

# Application Tier Subnet (Internal)
resource "google_compute_subnetwork" "app_tier" {
  name          = "tenderflow-app-tier"
  network       = google_compute_network.tenderflow_vpc.id
  region        = var.region
  ip_cidr_range = "10.0.2.0/24"
  
  private_ip_google_access = true
  
  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.1.0.0/20"
  }
  
  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.2.0.0/20"
  }
}

# Data Tier Subnet (Most restricted)
resource "google_compute_subnetwork" "data_tier" {
  name          = "tenderflow-data-tier"
  network       = google_compute_network.tenderflow_vpc.id
  region        = var.region
  ip_cidr_range = "10.0.3.0/24"
  
  private_ip_google_access = true
}

# ============================================
# Firewall Rules for Network Security
# ============================================

# Deny all traffic by default
resource "google_compute_firewall" "deny_all" {
  name    = "tenderflow-deny-all"
  network = google_compute_network.tenderflow_vpc.name
  
  deny {
    protocol = "all"
  }
  
  source_ranges = ["0.0.0.0/0"]
  priority      = 65534
}

# Allow HTTPS traffic to web tier only
resource "google_compute_firewall" "allow_web_tier" {
  name    = "tenderflow-allow-web"
  network = google_compute_network.tenderflow_vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["443", "80"]
  }
  
  source_ranges = ["0.0.0.0/0"]
  target_tags   = ["web-tier"]
  priority      = 1000
}

# Allow app tier to communicate with data tier
resource "google_compute_firewall" "app_to_data" {
  name    = "tenderflow-app-to-data"
  network = google_compute_network.tenderflow_vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["5432", "6379"] # PostgreSQL and Redis
  }
  
  source_tags = ["app-tier"]
  target_tags = ["data-tier"]
  priority    = 2000
}

# Allow web tier to communicate with app tier
resource "google_compute_firewall" "web_to_app" {
  name    = "tenderflow-web-to-app"
  network = google_compute_network.tenderflow_vpc.name
  
  allow {
    protocol = "tcp"
    ports    = ["8080", "3000"]
  }
  
  source_tags = ["web-tier"]
  target_tags = ["app-tier"]
  priority    = 2000
}

# ============================================
# Enhanced Cloud Armor Security Policy
# ============================================

resource "google_compute_security_policy" "tenderflow_security" {
  name = "tenderflow-security-${var.environment}"
  
  # Rule 1: Block known malicious IPs
  rule {
    action   = "deny(403)"
    priority = 100
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = var.blocked_ip_ranges
      }
    }
    
    description = "Block known malicious IPs"
  }
  
  # Rule 2: Geographic restrictions (if required for government)
  rule {
    action   = "deny(403)"
    priority = 200
    
    match {
      expr {
        expression = "origin.region_code != 'US' && origin.region_code != 'CA'"
      }
    }
    
    description = "Restrict to US and Canada only"
  }
  
  # Rule 3: Rate limiting per IP
  rule {
    action   = "rate_based_ban"
    priority = 300
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
      
      ban_duration_sec = 1800 # 30 minutes
      
      enforce_on_key      = "IP"
    }
    
    description = "Rate limiting per IP address"
  }
  
  # Rule 4: SQL injection protection
  rule {
    action   = "deny(403)"
    priority = 400
    
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
    
    description = "Block SQL injection attempts"
  }
  
  # Rule 5: XSS protection
  rule {
    action   = "deny(403)"
    priority = 500
    
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
    
    description = "Block XSS attempts"
  }
  
  # Default rule
  rule {
    action   = "allow"
    priority = 2147483647
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    
    description = "Default allow rule"
  }
  
  # Adaptive DDoS protection
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }
}

# ============================================
# Audit Logging Configuration
# ============================================

# BigQuery dataset for audit logs
resource "google_bigquery_dataset" "audit_logs" {
  dataset_id                  = "tenderflow_audit_logs"
  friendly_name               = "TenderFlow Audit Logs"
  description                 = "Comprehensive audit logs for compliance"
  location                    = "US"
  default_table_expiration_ms = 220752000000 # 7 years in milliseconds
  
  default_encryption_configuration {
    kms_key_name = google_kms_crypto_key.system_data.id
  }
}

# Log sink for security events
resource "google_logging_project_sink" "security_sink" {
  name        = "tenderflow-security-sink"
  destination = "bigquery.googleapis.com/projects/${var.project_id}/datasets/${google_bigquery_dataset.audit_logs.dataset_id}"
  
  filter = <<EOF
protoPayload.serviceName="cloudkms.googleapis.com" OR
protoPayload.serviceName="secretmanager.googleapis.com" OR
protoPayload.serviceName="sqladmin.googleapis.com" OR
protoPayload.methodName="storage.objects.create" OR
protoPayload.methodName="storage.objects.get" OR
protoPayload.authenticationInfo.principalEmail=~".*@.*" OR
severity="ERROR" OR
severity="CRITICAL"
EOF
  
  bigquery_options {
    use_partitioned_tables = true
  }
}

# Grant write permissions to the log sink
resource "google_bigquery_dataset_iam_member" "log_sink_writer" {
  dataset_id = google_bigquery_dataset.audit_logs.dataset_id
  role       = "roles/bigquery.dataEditor"
  member     = google_logging_project_sink.security_sink.writer_identity
}

# ============================================
# Data Loss Prevention (DLP) Configuration
# ============================================

resource "google_data_loss_prevention_inspect_template" "tender_data" {
  parent       = "projects/${var.project_id}/locations/global"
  description  = "Template for inspecting tender documents for PII"
  display_name = "Tender Data DLP Inspection"
  
  inspect_config {
    # Detect common PII types
    info_types {
      name = "PERSON_NAME"
    }
    info_types {
      name = "EMAIL_ADDRESS"
    }
    info_types {
      name = "PHONE_NUMBER"
    }
    info_types {
      name = "US_SOCIAL_SECURITY_NUMBER"
    }
    info_types {
      name = "CREDIT_CARD_NUMBER"
    }
    
    # Custom info types for tender-specific data
    custom_info_types {
      info_type {
        name = "TENDER_ID"
      }
      regex {
        pattern = "TENDER-[0-9]{8}"
      }
    }
    
    # Inspection rules
    rule_set {
      info_types {
        name = "PERSON_NAME"
      }
      rules {
        exclusion_rule {
          matching_type = "MATCHING_TYPE_FULL_MATCH"
          dictionary {
            word_list {
              words = ["John Doe", "Jane Doe", "Test User"]
            }
          }
        }
      }
    }
    
    min_likelihood = "POSSIBLE"
    include_quote  = true
  }
}

# ============================================
# Secret Management with Auto-Rotation
# ============================================

# Secret rotation Cloud Function
resource "google_cloudfunctions2_function" "secret_rotator" {
  name        = "tenderflow-secret-rotator"
  location    = var.region
  description = "Automatic secret rotation for JWT and API keys"
  
  build_config {
    runtime     = "nodejs18"
    entry_point = "rotateSecrets"
    source {
      storage_source {
        bucket = google_storage_bucket.functions_bucket.name
        object = google_storage_bucket_object.secret_rotator_source.name
      }
    }
  }
  
  service_config {
    max_instance_count = 1
    min_instance_count = 0
    available_memory   = "256M"
    timeout_seconds    = 60
    
    environment_variables = {
      PROJECT_ID = var.project_id
    }
    
    service_account_email = google_service_account.secret_rotator.email
  }
}

# Cloud Scheduler for automatic rotation
resource "google_cloud_scheduler_job" "rotate_secrets" {
  name     = "rotate-jwt-secrets"
  schedule = "0 2 * * 0" # Weekly on Sunday at 2 AM
  region   = var.region
  
  http_target {
    uri         = google_cloudfunctions2_function.secret_rotator.service_config[0].uri
    http_method = "POST"
    
    oidc_token {
      service_account_email = google_service_account.secret_rotator.email
    }
  }
}

# Service account for secret rotation
resource "google_service_account" "secret_rotator" {
  account_id   = "secret-rotator"
  display_name = "Secret Rotation Service Account"
}

# Permissions for secret rotation
resource "google_project_iam_member" "secret_rotator_permissions" {
  for_each = toset([
    "roles/secretmanager.admin",
    "roles/cloudfunctions.invoker"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.secret_rotator.email}"
}

# ============================================
# Enhanced IAM with Least Privilege
# ============================================

# Custom role for API service
resource "google_project_iam_custom_role" "api_service_role" {
  role_id     = "tenderflow_api_role"
  title       = "TenderFlow API Service Role"
  description = "Least privilege role for API service"
  
  permissions = [
    # Cloud SQL
    "cloudsql.instances.connect",
    "cloudsql.instances.get",
    
    # Secret Manager (read-only)
    "secretmanager.versions.access",
    "secretmanager.versions.get",
    
    # Storage (limited)
    "storage.objects.create",
    "storage.objects.get",
    "storage.objects.list",
    "storage.objects.update",
    
    # Pub/Sub
    "pubsub.messages.publish",
    "pubsub.topics.get",
    
    # Cloud Tasks
    "cloudtasks.tasks.create",
    "cloudtasks.queues.get",
    
    # Monitoring
    "monitoring.metricDescriptors.create",
    "monitoring.metricDescriptors.get",
    "monitoring.metricDescriptors.list",
    "monitoring.timeSeries.create",
    
    # Logging
    "logging.logEntries.create",
    
    # Tracing
    "cloudtrace.traces.patch"
  ]
}

# Custom role for scraper service
resource "google_project_iam_custom_role" "scraper_service_role" {
  role_id     = "tenderflow_scraper_role"
  title       = "TenderFlow Scraper Service Role"
  description = "Least privilege role for scraper service"
  
  permissions = [
    # Monitoring only
    "monitoring.metricDescriptors.get",
    "monitoring.metricDescriptors.list",
    "monitoring.timeSeries.create",
    
    # Logging
    "logging.logEntries.create",
    
    # Tracing
    "cloudtrace.traces.patch"
  ]
}

# Apply custom roles to service accounts
resource "google_project_iam_member" "api_custom_role" {
  project = var.project_id
  role    = google_project_iam_custom_role.api_service_role.id
  member  = "serviceAccount:${google_service_account.workload_identity_api.email}"
}

resource "google_project_iam_member" "scraper_custom_role" {
  project = var.project_id
  role    = google_project_iam_custom_role.scraper_service_role.id
  member  = "serviceAccount:${google_service_account.workload_identity_scraper.email}"
}

# ============================================
# Outputs for Reference
# ============================================

output "security_config" {
  value = {
    vpc_network_id       = google_compute_network.tenderflow_vpc.id
    web_subnet_id       = google_compute_subnetwork.web_tier.id
    app_subnet_id       = google_compute_subnetwork.app_tier.id
    data_subnet_id      = google_compute_subnetwork.data_tier.id
    database_kms_key    = google_kms_crypto_key.database_cmek.id
    document_kms_key    = google_kms_crypto_key.document_envelope.id
    security_policy_id  = google_compute_security_policy.tenderflow_security.id
    audit_dataset_id    = google_bigquery_dataset.audit_logs.id
  }
  
  description = "Security configuration outputs"
  sensitive   = true
}