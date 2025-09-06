# Mutual TLS Configuration for Secure Scraper Ingestion
# Implements certificate-based authentication for local scrapers

# Certificate Authority for scraper certificates
resource "google_privateca_ca_pool" "scraper_ca_pool" {
  name     = "scraper-ca-pool"
  location = var.region
  tier     = "DEVOPS"
  
  publishing_options {
    publish_ca_cert = true
    publish_crl     = true
  }
  
  issuance_policy {
    allowed_key_types {
      rsa {
        min_modulus_size = 2048
        max_modulus_size = 4096
      }
    }
    
    maximum_lifetime = "315360000s"  # 10 years
    
    baseline_values {
      ca_options {
        is_ca = false
      }
      
      key_usage {
        base_key_usage {
          digital_signature = true
          key_encipherment  = true
        }
        
        extended_key_usage {
          client_auth = true
        }
      }
    }
  }
  
  labels = {
    purpose = "scraper-authentication"
  }
}

# Certificate Authority
resource "google_privateca_certificate_authority" "scraper_ca" {
  pool                     = google_privateca_ca_pool.scraper_ca_pool.name
  certificate_authority_id = "scraper-ca"
  location                 = var.region
  
  lifetime = "315360000s"  # 10 years
  
  type = "SELF_SIGNED"
  
  config {
    subject_config {
      subject {
        organization = "TenderFlow"
        common_name  = "TenderFlow Scraper CA"
      }
    }
    
    x509_config {
      ca_options {
        is_ca = true
      }
      
      key_usage {
        base_key_usage {
          cert_sign = true
          crl_sign  = true
        }
      }
    }
  }
  
  key_spec {
    algorithm = "RSA_PKCS1_4096_SHA256"
  }
}

# Certificate template for scraper clients
resource "google_privateca_certificate_template" "scraper_client" {
  name        = "scraper-client-template"
  location    = "us-central1"  # Templates are regional
  description = "Template for scraper client certificates"
  
  predefined_values {
    key_usage {
      base_key_usage {
        digital_signature = true
        key_encipherment  = true
      }
      
      extended_key_usage {
        client_auth = true
      }
    }
    
    ca_options {
      is_ca = false
    }
  }
  
  identity_constraints {
    allow_subject_passthrough           = true
    allow_subject_alt_names_passthrough = true
    
    cel_expression {
      expression = "subject_alt_names.all(san, san.type == 'DNS' && san.value.endsWith('.scraper.tenderflow.local'))"
      title      = "Scraper DNS validation"
    }
  }
  
  maximum_lifetime = "2592000s"  # 30 days
}

# Cloud Load Balancer with mTLS support
resource "google_compute_ssl_policy" "mtls_policy" {
  name            = "tenderflow-mtls-policy"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
  
  custom_features = [
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256"
  ]
}

# Server-side SSL certificate for ingestion endpoint
resource "google_compute_managed_ssl_certificate" "ingestion_cert" {
  name = "tenderflow-ingestion-cert"
  
  managed {
    domains = ["ingestion.${var.domain_name}"]
  }
}

# SSL certificate for client verification
resource "google_compute_ssl_certificate" "client_ca_cert" {
  name        = "scraper-client-ca"
  description = "CA certificate for verifying scraper clients"
  
  certificate = google_privateca_certificate_authority.scraper_ca.pem_ca_certificates[0]
  
  lifecycle {
    create_before_destroy = true
  }
}

# HTTPS proxy with mTLS
resource "google_compute_target_https_proxy" "ingestion_proxy" {
  name             = "tenderflow-ingestion-proxy"
  url_map          = google_compute_url_map.ingestion_url_map.id
  ssl_certificates = [google_compute_managed_ssl_certificate.ingestion_cert.id]
  ssl_policy       = google_compute_ssl_policy.mtls_policy.id
  
  # Enable client certificate validation
  server_tls_policy = google_network_security_server_tls_policy.mtls_policy.id
}

# Network Security Server TLS Policy for mTLS
resource "google_network_security_server_tls_policy" "mtls_policy" {
  name     = "tenderflow-mtls-policy"
  location = "global"
  
  description = "mTLS policy for scraper ingestion"
  
  mtls_policy {
    client_validation_mode = "REJECT_INVALID"
    
    client_validation_ca {
      certificate_provider_instance {
        plugin_instance = google_certificate_manager_certificate_issuance_config.scraper_ca_config.id
      }
    }
  }
  
  labels = {
    purpose = "scraper-mtls"
  }
}

# Certificate Manager for CA distribution
resource "google_certificate_manager_certificate_issuance_config" "scraper_ca_config" {
  name     = "scraper-ca-config"
  location = "global"
  
  certificate_authority_config {
    certificate_authority_service_config {
      ca_pool = google_privateca_ca_pool.scraper_ca_pool.id
    }
  }
  
  lifetime = "2592000s"  # 30 days
  rotation_window_percentage = 20  # Rotate at 80% of lifetime
  
  key_algorithm = "RSA_2048"
  
  labels = {
    purpose = "scraper-authentication"
  }
}

# URL Map for ingestion routing
resource "google_compute_url_map" "ingestion_url_map" {
  name            = "tenderflow-ingestion-urlmap"
  default_service = google_compute_backend_service.ingestion_backend.id
  
  host_rule {
    hosts        = ["ingestion.${var.domain_name}"]
    path_matcher = "ingestion-paths"
  }
  
  path_matcher {
    name            = "ingestion-paths"
    default_service = google_compute_backend_service.ingestion_backend.id
    
    path_rule {
      paths   = ["/api/ingestion/*"]
      service = google_compute_backend_service.ingestion_backend.id
    }
    
    path_rule {
      paths   = ["/health"]
      service = google_compute_backend_service.ingestion_backend.id
    }
  }
}

# Backend service for ingestion
resource "google_compute_backend_service" "ingestion_backend" {
  name        = "tenderflow-ingestion-backend"
  protocol    = "HTTPS"
  port_name   = "https"
  timeout_sec = 30
  
  backend {
    group = google_compute_region_network_endpoint_group.ingestion_neg.id
  }
  
  health_checks = [google_compute_health_check.ingestion_health.id]
  
  security_policy = google_compute_security_policy.ingestion_security_policy.id
  
  log_config {
    enable      = true
    sample_rate = 1.0  # Log all requests for security
  }
  
  iap {
    enabled = false  # Not using IAP, using mTLS instead
  }
  
  custom_request_headers = [
    "X-Client-Cert-Present: {client_cert_present}",
    "X-Client-Cert-Chain-Verified: {client_cert_chain_verified}",
    "X-Client-Cert-Error: {client_cert_error}",
    "X-Client-Cert-SHA256: {client_cert_sha256_fingerprint}",
    "X-Client-Cert-Serial: {client_cert_serial_number}",
    "X-Client-Cert-Subject-DN: {client_cert_subject_dn}"
  ]
}

# NEG for Cloud Run ingestion service
resource "google_compute_region_network_endpoint_group" "ingestion_neg" {
  name                  = "ingestion-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  
  cloud_run {
    service = google_cloud_run_service.ingestion.name
  }
}

# Dedicated Cloud Run service for ingestion
resource "google_cloud_run_service" "ingestion" {
  name     = "tenderflow-ingestion"
  location = var.region
  
  template {
    spec {
      service_account_name = google_service_account.ingestion_service_account.email
      
      container_concurrency = 50  # Lower concurrency for security
      timeout_seconds      = 60
      
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tenderflow/api:${var.api_image_tag}"
        
        resources {
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
        }
        
        env {
          name  = "SERVICE_MODE"
          value = "ingestion"
        }
        
        env {
          name  = "MTLS_ENABLED"
          value = "true"
        }
        
        env {
          name = "SCRAPER_API_KEY"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.scraper_api_key.secret_id
              key  = "latest"
            }
          }
        }
        
        env {
          name = "DATABASE_URL"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.database_url.secret_id
              key  = "latest"
            }
          }
        }
        
        ports {
          name           = "http1"
          container_port = 3000
        }
      }
    }
    
    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = "1"
        "autoscaling.knative.dev/maxScale" = "20"
        
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.serverless_connector.id
        "run.googleapis.com/vpc-access-egress"    = "private-ranges-only"
      }
      
      labels = {
        purpose = "ingestion"
        security = "mtls"
      }
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Service account for ingestion
resource "google_service_account" "ingestion_service_account" {
  account_id   = "tenderflow-ingestion-sa"
  display_name = "TenderFlow Ingestion Service Account"
  description  = "Service account for scraper data ingestion"
}

# IAM bindings for ingestion service
resource "google_project_iam_member" "ingestion_sa_bindings" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/pubsub.publisher",
    "roles/cloudtasks.enqueuer",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.ingestion_service_account.email}"
}

# Health check for ingestion
resource "google_compute_health_check" "ingestion_health" {
  name               = "ingestion-health-check"
  check_interval_sec = 10
  timeout_sec        = 5
  healthy_threshold  = 2
  unhealthy_threshold = 3
  
  https_health_check {
    port         = 443
    request_path = "/health"
  }
}

# Security policy for ingestion endpoint
resource "google_compute_security_policy" "ingestion_security_policy" {
  name = "tenderflow-ingestion-security"
  
  # Default deny
  rule {
    action   = "deny(403)"
    priority = 2147483647
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    
    description = "Default deny all"
  }
  
  # Allow only from known scraper IPs (allowlist)
  rule {
    action   = "allow"
    priority = 100
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = var.scraper_ip_allowlist
      }
    }
    
    description = "Allow known scraper IPs"
  }
  
  # Rate limiting per scraper
  rule {
    action   = "rate_based_ban"
    priority = 200
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = var.scraper_ip_allowlist
      }
    }
    
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      
      enforce_on_key = "IP"
      
      rate_limit_threshold {
        count        = 1000  # 1000 requests
        interval_sec = 60    # per minute
      }
      
      ban_duration_sec = 600  # 10 minute ban
    }
    
    description = "Rate limit scrapers"
  }
}

# Secret for scraper API key
resource "google_secret_manager_secret" "scraper_api_key" {
  secret_id = "scraper-api-key"
  
  replication {
    auto {}
  }
  
  rotation {
    next_rotation_time = timeadd(timestamp(), "720h")  # 30 days
    rotation_period    = "2592000s"
  }
}

# Generate initial API key
resource "random_password" "scraper_api_key" {
  length  = 64
  special = false  # Alphanumeric only for API key
}

resource "google_secret_manager_secret_version" "scraper_api_key" {
  secret      = google_secret_manager_secret.scraper_api_key.id
  secret_data = random_password.scraper_api_key.result
}

# Cloud Armor rule for DDoS protection
resource "google_compute_security_policy" "ddos_protection" {
  name = "tenderflow-ddos-protection"
  
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable = true
      
      rule_visibility = "STANDARD"
    }
  }
}

# Outputs for scraper configuration
output "ingestion_endpoint" {
  value = "https://ingestion.${var.domain_name}"
}

output "ca_certificate_pem" {
  value     = google_privateca_certificate_authority.scraper_ca.pem_ca_certificates[0]
  sensitive = true
}

output "certificate_authority_id" {
  value = google_privateca_certificate_authority.scraper_ca.id
}