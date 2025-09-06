# Terraform configuration for TenderFlow GCP Infrastructure
# Hybrid deployment with local scraper feeding to GCP

terraform {
  required_version = ">= 1.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  backend "gcs" {
    bucket = "tenderflow-terraform-state"
    prefix = "terraform/state"
  }
}

# Provider configuration
provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

# Enable required APIs
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "sqladmin.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "cloudkms.googleapis.com",
    "secretmanager.googleapis.com",
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "redis.googleapis.com",
    "pubsub.googleapis.com",
    "cloudtasks.googleapis.com",
    "storage.googleapis.com",
    "documentai.googleapis.com",
    "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com"
  ])
  
  service            = each.key
  disable_on_destroy = false
}

# VPC Network
resource "google_compute_network" "vpc" {
  name                    = "tenderflow-vpc"
  auto_create_subnetworks = false
  depends_on              = [google_project_service.apis]
}

resource "google_compute_subnetwork" "subnet" {
  name          = "tenderflow-subnet"
  network       = google_compute_network.vpc.id
  region        = var.region
  ip_cidr_range = "10.0.0.0/24"
  
  private_ip_google_access = true
}

# Cloud SQL (PostgreSQL)
resource "google_sql_database_instance" "main" {
  name             = "tenderflow-db-${var.environment}"
  database_version = "POSTGRES_15"
  region           = var.region
  
  settings {
    tier              = "db-standard-2"
    availability_type = "REGIONAL"
    disk_size         = 100
    disk_type         = "PD_SSD"
    disk_autoresize   = true
    
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      retention_unit                 = "COUNT"
      retained_backups               = 30
    }
    
    database_flags {
      name  = "max_connections"
      value = "200"
    }
    
    database_flags {
      name  = "pg_stat_statements.track"
      value = "all"
    }
    
    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = true
    }
    
    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }
  }
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
}

resource "google_sql_database" "tenderflow" {
  name     = "tenderflow"
  instance = google_sql_database_instance.main.name
}

resource "google_sql_user" "app_user" {
  name     = "tenderflow_app"
  instance = google_sql_database_instance.main.name
  password = random_password.db_password.result
}

# Private VPC connection for Cloud SQL
resource "google_compute_global_address" "private_ip_address" {
  name          = "private-ip-address"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Memorystore (Redis)
resource "google_redis_instance" "cache" {
  name               = "tenderflow-redis-${var.environment}"
  tier               = "STANDARD_HA"
  memory_size_gb     = 4
  region             = var.region
  authorized_network = google_compute_network.vpc.id
  redis_version      = "REDIS_7_0"
  display_name       = "TenderFlow Redis Cache"
  
  persistence_config {
    persistence_mode    = "RDB"
    rdb_snapshot_period = "TWELVE_HOURS"
  }
}

# Cloud Storage Buckets
resource "google_storage_bucket" "documents" {
  name          = "${var.project_id}-tenderflow-documents"
  location      = var.region
  storage_class = "STANDARD"
  
  versioning {
    enabled = true
  }
  
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
  
  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }
  
  encryption {
    default_kms_key_name = google_kms_crypto_key.storage_key.id
  }
}

# KMS Keys
resource "google_kms_key_ring" "keyring" {
  name     = "tenderflow-keyring"
  location = var.region
}

resource "google_kms_crypto_key" "storage_key" {
  name     = "storage-encryption-key"
  key_ring = google_kms_key_ring.keyring.id
  
  rotation_period = "7776000s" # 90 days
}

resource "google_kms_crypto_key" "database_key" {
  name     = "database-encryption-key"
  key_ring = google_kms_key_ring.keyring.id
  
  rotation_period = "7776000s" # 90 days
}

# Secret Manager
resource "google_secret_manager_secret" "jwt_secret" {
  secret_id = "jwt-secret"
  
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "jwt_secret" {
  secret      = google_secret_manager_secret.jwt_secret.id
  secret_data = random_password.jwt_secret.result
}

resource "google_secret_manager_secret" "jwt_refresh_secret" {
  secret_id = "jwt-refresh-secret"
  
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "jwt_refresh_secret" {
  secret      = google_secret_manager_secret.jwt_refresh_secret.id
  secret_data = random_password.jwt_refresh_secret.result
}

resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  
  replication {
    automatic = true
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  secret_data = format(
    "postgresql://%s:%s@/%s?host=/cloudsql/%s",
    google_sql_user.app_user.name,
    random_password.db_password.result,
    google_sql_database.tenderflow.name,
    google_sql_database_instance.main.connection_name
  )
}

# Service Accounts
resource "google_service_account" "api_service" {
  account_id   = "tenderflow-api"
  display_name = "TenderFlow API Service Account"
}

resource "google_service_account" "scraper_service" {
  account_id   = "tenderflow-scraper"
  display_name = "TenderFlow Scraper Service Account"
}

# IAM Bindings
resource "google_project_iam_member" "api_permissions" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/pubsub.publisher",
    "roles/cloudtasks.enqueuer",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.api_service.email}"
}

resource "google_project_iam_member" "scraper_permissions" {
  for_each = toset([
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.scraper_service.email}"
}

# Cloud Pub/Sub Topics
resource "google_pubsub_topic" "ingestion_events" {
  name = "tenderflow-ingestion-events"
  
  message_retention_duration = "604800s" # 7 days
  
  schema_settings {
    schema   = google_pubsub_schema.ingestion_event.id
    encoding = "JSON"
  }
}

resource "google_pubsub_schema" "ingestion_event" {
  name = "ingestion-event-schema"
  type = "AVRO"
  definition = jsonencode({
    type = "record"
    name = "IngestionEvent"
    fields = [
      { name = "uploadId", type = "string" },
      { name = "batchId", type = "string" },
      { name = "scraperId", type = "string" },
      { name = "tendersCount", type = "int" },
      { name = "timestamp", type = "string" },
      { name = "status", type = "string" }
    ]
  })
}

# Cloud Tasks Queue
resource "google_cloud_tasks_queue" "processing_queue" {
  name     = "tenderflow-processing"
  location = var.region
  
  rate_limits {
    max_dispatches_per_second = 100
    max_concurrent_dispatches = 50
  }
  
  retry_config {
    max_attempts       = 5
    max_retry_duration = "3600s"
    min_backoff        = "10s"
    max_backoff        = "300s"
  }
  
  stackdriver_logging_config {
    sampling_ratio = 0.1
  }
}

# Load Balancer and SSL
resource "google_compute_global_address" "api_ip" {
  name = "tenderflow-api-ip"
}

resource "google_compute_managed_ssl_certificate" "api_cert" {
  name = "tenderflow-api-cert"
  
  managed {
    domains = ["api.tenderflow.app"]
  }
}

# Cloud Armor Security Policy
resource "google_compute_security_policy" "api_security" {
  name = "tenderflow-api-security"
  
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
    
    description = "Default rule"
  }
  
  # Rate limiting rule
  rule {
    action   = "rate_based_ban"
    priority = 1000
    
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
      
      ban_duration_sec = 600
    }
    
    description = "Rate limiting"
  }
  
  # DDoS protection
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
    }
  }
}

# Random passwords
resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "random_password" "jwt_secret" {
  length  = 64
  special = false
}

resource "random_password" "jwt_refresh_secret" {
  length  = 64
  special = false
}

# Outputs
output "api_ip" {
  value       = google_compute_global_address.api_ip.address
  description = "Global IP address for API"
}

output "database_connection_name" {
  value       = google_sql_database_instance.main.connection_name
  description = "Cloud SQL connection name"
}

output "redis_host" {
  value       = google_redis_instance.cache.host
  description = "Redis instance host"
}

output "storage_bucket" {
  value       = google_storage_bucket.documents.name
  description = "Document storage bucket name"
}

output "scraper_service_account_key" {
  value       = google_service_account.scraper_service.email
  description = "Scraper service account email for authentication"
  sensitive   = true
}