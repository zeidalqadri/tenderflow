# TenderFlow GCS Storage Infrastructure
# Project: tensurv
# Terraform configuration for Google Cloud Storage buckets

terraform {
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
  required_version = ">= 1.0"
}

# Configure the Google Cloud Provider
provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "tensurv"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "us-central1"
}

variable "environment" {
  description = "Environment (prod/staging/dev)"
  type        = string
  default     = "prod"
}

# KMS Key Ring and Keys for Encryption
resource "google_kms_key_ring" "tenderflow_keyring" {
  name     = "tenderflow-ring"
  location = var.region
}

resource "google_kms_crypto_key" "storage_key" {
  name     = "storage-key"
  key_ring = google_kms_key_ring.tenderflow_keyring.id
  
  purpose          = "ENCRYPT_DECRYPT"
  rotation_period  = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

resource "google_kms_crypto_key" "backup_key" {
  name     = "backup-key"
  key_ring = google_kms_key_ring.tenderflow_keyring.id
  
  purpose          = "ENCRYPT_DECRYPT"
  rotation_period  = "31536000s" # 365 days

  lifecycle {
    prevent_destroy = true
  }
}

# Main Documents Bucket
resource "google_storage_bucket" "documents" {
  name          = "${var.project_id}-documents-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"
  
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage_key.id
  }

  lifecycle_rule {
    condition {
      age = 90
      matches_storage_class = ["STANDARD"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
      matches_storage_class = ["NEARLINE"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 2555 # 7 years for government compliance
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["https://tenderflow.gov", "https://*.tenderflow.gov"]
    method          = ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
    response_header = ["Content-Type", "x-goog-resumable"]
    max_age_seconds = 3600
  }

  labels = {
    environment         = var.environment
    service            = "tenderflow"
    cost-center        = "government"
    compliance         = "required"
    data-classification = "sensitive"
  }
}

# Thumbnails Bucket
resource "google_storage_bucket" "thumbnails" {
  name          = "${var.project_id}-thumbnails-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"
  
  uniform_bucket_level_access = true

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage_key.id
  }

  lifecycle_rule {
    condition {
      age = 30
      matches_storage_class = ["STANDARD"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 180 # Delete thumbnails after 6 months
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["https://tenderflow.gov", "https://*.tenderflow.gov"]
    method          = ["GET", "OPTIONS"]
    response_header = ["Content-Type"]
    max_age_seconds = 86400
  }

  labels = {
    environment = var.environment
    service     = "tenderflow"
    cost-center = "government"
    data-type   = "thumbnails"
  }
}

# Temporary Processing Bucket
resource "google_storage_bucket" "temp_processing" {
  name          = "${var.project_id}-temp-processing-${var.environment}"
  location      = var.region
  storage_class = "STANDARD"
  
  uniform_bucket_level_access = true

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage_key.id
  }

  lifecycle_rule {
    condition {
      age = 1 # Delete temporary files after 24 hours
    }
    action {
      type = "Delete"
    }
  }

  labels = {
    environment = var.environment
    service     = "tenderflow"
    cost-center = "government"
    data-type   = "temporary"
  }
}

# Backup Bucket
resource "google_storage_bucket" "backups" {
  name          = "${var.project_id}-backups-${var.environment}"
  location      = var.region
  storage_class = "COLDLINE"
  
  uniform_bucket_level_access = true
  
  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.backup_key.id
  }

  lifecycle_rule {
    condition {
      age = 365
      matches_storage_class = ["COLDLINE"]
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }

  labels = {
    environment      = var.environment
    service          = "tenderflow"
    cost-center      = "government"
    data-type        = "backup"
    retention-policy = "7-years"
  }
}

# IAM Service Account for Application Access
resource "google_service_account" "storage_service_account" {
  account_id   = "tenderflow-storage"
  display_name = "TenderFlow Storage Service Account"
  description  = "Service account for TenderFlow application storage access"
}

# Grant necessary permissions to service account
resource "google_storage_bucket_iam_member" "documents_object_admin" {
  bucket = google_storage_bucket.documents.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage_service_account.email}"
}

resource "google_storage_bucket_iam_member" "thumbnails_object_admin" {
  bucket = google_storage_bucket.thumbnails.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage_service_account.email}"
}

resource "google_storage_bucket_iam_member" "temp_object_admin" {
  bucket = google_storage_bucket.temp_processing.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.storage_service_account.email}"
}

resource "google_storage_bucket_iam_member" "backup_object_creator" {
  bucket = google_storage_bucket.backups.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.storage_service_account.email}"
}

# Grant KMS permissions
resource "google_kms_crypto_key_iam_member" "storage_key_encrypter" {
  crypto_key_id = google_kms_crypto_key.storage_key.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:${google_service_account.storage_service_account.email}"
}

# Cloud CDN Backend Bucket
resource "google_compute_backend_bucket" "thumbnails_backend" {
  name        = "tenderflow-thumbnails-backend"
  bucket_name = google_storage_bucket.thumbnails.name
  enable_cdn  = true

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    client_ttl        = 3600
    default_ttl       = 86400
    max_ttl           = 2592000
    negative_caching  = true
    serve_while_stale = 86400

    negative_caching_policy {
      code = 404
      ttl  = 60
    }

    negative_caching_policy {
      code = 410
      ttl  = 60
    }
  }
}

# URL Map for CDN
resource "google_compute_url_map" "cdn_url_map" {
  name            = "tenderflow-cdn-url-map"
  default_service = google_compute_backend_bucket.thumbnails_backend.id

  host_rule {
    hosts        = ["cdn.tenderflow.gov"]
    path_matcher = "thumbnails"
  }

  path_matcher {
    name            = "thumbnails"
    default_service = google_compute_backend_bucket.thumbnails_backend.id

    path_rule {
      paths   = ["/thumbnails/*"]
      service = google_compute_backend_bucket.thumbnails_backend.id
    }
  }
}

# HTTPS Proxy for CDN
resource "google_compute_target_https_proxy" "cdn_https_proxy" {
  name    = "tenderflow-cdn-https-proxy"
  url_map = google_compute_url_map.cdn_url_map.id
  # SSL certificate should be created separately or imported
  # ssl_certificates = [google_compute_ssl_certificate.cdn_cert.id]
}

# Global Forwarding Rule for CDN
resource "google_compute_global_forwarding_rule" "cdn_forwarding_rule" {
  name       = "tenderflow-cdn-forwarding-rule"
  target     = google_compute_target_https_proxy.cdn_https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.cdn_ip.address
}

# Reserved IP for CDN
resource "google_compute_global_address" "cdn_ip" {
  name = "tenderflow-cdn-ip"
}

# Outputs
output "documents_bucket_name" {
  description = "Name of the documents storage bucket"
  value       = google_storage_bucket.documents.name
}

output "thumbnails_bucket_name" {
  description = "Name of the thumbnails storage bucket" 
  value       = google_storage_bucket.thumbnails.name
}

output "temp_processing_bucket_name" {
  description = "Name of the temporary processing bucket"
  value       = google_storage_bucket.temp_processing.name
}

output "backup_bucket_name" {
  description = "Name of the backup storage bucket"
  value       = google_storage_bucket.backups.name
}

output "storage_service_account_email" {
  description = "Email of the storage service account"
  value       = google_service_account.storage_service_account.email
}

output "cdn_ip_address" {
  description = "IP address for CDN"
  value       = google_compute_global_address.cdn_ip.address
}

output "kms_key_id" {
  description = "KMS key ID for storage encryption"
  value       = google_kms_crypto_key.storage_key.id
}