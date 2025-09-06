# Multi-tier VPC Architecture for TenderFlow
# Implements defense-in-depth with isolated network tiers

# Main VPC Network
resource "google_compute_network" "tenderflow_vpc" {
  name                            = "tenderflow-vpc"
  auto_create_subnetworks        = false
  routing_mode                   = "REGIONAL"
  delete_default_routes_on_create = true
  
  description = "Multi-tier VPC for TenderFlow application"
}

# Web Tier Subnet (Public-facing Cloud Run services)
resource "google_compute_subnetwork" "web_tier" {
  name          = "web-tier-subnet"
  network       = google_compute_network.tenderflow_vpc.id
  ip_cidr_range = "10.1.0.0/24"
  region        = var.region
  
  purpose = "PRIVATE"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata            = "INCLUDE_ALL_METADATA"
  }
  
  secondary_ip_range {
    range_name    = "services-range"
    ip_cidr_range = "10.100.0.0/20"
  }
  
  secondary_ip_range {
    range_name    = "pod-range"
    ip_cidr_range = "10.200.0.0/16"
  }
}

# Application Tier Subnet (API services, business logic)
resource "google_compute_subnetwork" "app_tier" {
  name          = "app-tier-subnet"
  network       = google_compute_network.tenderflow_vpc.id
  ip_cidr_range = "10.2.0.0/24"
  region        = var.region
  
  purpose = "PRIVATE"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata            = "INCLUDE_ALL_METADATA"
  }
}

# Data Tier Subnet (Databases, storage)
resource "google_compute_subnetwork" "data_tier" {
  name          = "data-tier-subnet"
  network       = google_compute_network.tenderflow_vpc.id
  ip_cidr_range = "10.3.0.0/24"
  region        = var.region
  
  purpose = "PRIVATE"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata            = "INCLUDE_ALL_METADATA"
  }
}

# Management Tier Subnet (Monitoring, bastion hosts)
resource "google_compute_subnetwork" "management_tier" {
  name          = "management-tier-subnet"
  network       = google_compute_network.tenderflow_vpc.id
  ip_cidr_range = "10.4.0.0/24"
  region        = var.region
  
  purpose = "PRIVATE"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 0.5
    metadata            = "INCLUDE_ALL_METADATA"
  }
}

# Scraper Ingestion Subnet (Isolated for external data ingestion)
resource "google_compute_subnetwork" "ingestion_tier" {
  name          = "ingestion-tier-subnet"
  network       = google_compute_network.tenderflow_vpc.id
  ip_cidr_range = "10.5.0.0/24"
  region        = var.region
  
  purpose = "PRIVATE"
  
  private_ip_google_access = true
  
  log_config {
    aggregation_interval = "INTERVAL_10_MIN"
    flow_sampling        = 1.0  # Full logging for security
    metadata            = "INCLUDE_ALL_METADATA"
  }
}

# Cloud Router for NAT
resource "google_compute_router" "tenderflow_router" {
  name    = "tenderflow-router"
  network = google_compute_network.tenderflow_vpc.id
  region  = var.region
  
  bgp {
    asn = 64514
  }
}

# Cloud NAT for outbound internet access
resource "google_compute_router_nat" "tenderflow_nat" {
  name                               = "tenderflow-nat"
  router                            = google_compute_router.tenderflow_router.name
  region                            = var.region
  nat_ip_allocate_option            = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
  
  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
  
  min_ports_per_vm = 64
  max_ports_per_vm = 2048
  
  tcp_established_idle_timeout_sec = 1200
  tcp_transitory_idle_timeout_sec  = 30
  tcp_time_wait_timeout_sec        = 120
  udp_idle_timeout_sec             = 30
  icmp_idle_timeout_sec            = 30
}

# VPC Firewall Rules

# Default deny all ingress
resource "google_compute_firewall" "default_deny_ingress" {
  name    = "default-deny-ingress"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 65534
  
  direction = "INGRESS"
  
  deny {
    protocol = "all"
  }
  
  source_ranges = ["0.0.0.0/0"]
  
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow internal communication between tiers (with restrictions)
resource "google_compute_firewall" "allow_web_to_app" {
  name    = "allow-web-to-app"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 1000
  
  direction = "INGRESS"
  
  allow {
    protocol = "tcp"
    ports    = ["3000", "8080"]  # API ports
  }
  
  source_ranges = [google_compute_subnetwork.web_tier.ip_cidr_range]
  target_tags   = ["app-tier"]
  
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_firewall" "allow_app_to_data" {
  name    = "allow-app-to-data"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 1000
  
  direction = "INGRESS"
  
  allow {
    protocol = "tcp"
    ports    = ["5432", "6379"]  # PostgreSQL and Redis
  }
  
  source_ranges = [google_compute_subnetwork.app_tier.ip_cidr_range]
  target_tags   = ["data-tier"]
  
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

resource "google_compute_firewall" "allow_ingestion_to_app" {
  name    = "allow-ingestion-to-app"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 1000
  
  direction = "INGRESS"
  
  allow {
    protocol = "tcp"
    ports    = ["3000"]  # Ingestion API endpoint
  }
  
  source_ranges = [google_compute_subnetwork.ingestion_tier.ip_cidr_range]
  target_tags   = ["app-tier"]
  
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# Allow health checks from Google
resource "google_compute_firewall" "allow_health_checks" {
  name    = "allow-health-checks"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 900
  
  direction = "INGRESS"
  
  allow {
    protocol = "tcp"
    ports    = ["3000", "8080"]
  }
  
  source_ranges = [
    "35.191.0.0/16",   # Google health check ranges
    "130.211.0.0/22"
  ]
  
  target_tags = ["allow-health-checks"]
}

# Allow SSH from IAP for management
resource "google_compute_firewall" "allow_iap_ssh" {
  name    = "allow-iap-ssh"
  network = google_compute_network.tenderflow_vpc.name
  
  priority = 1000
  
  direction = "INGRESS"
  
  allow {
    protocol = "tcp"
    ports    = ["22"]
  }
  
  source_ranges = ["35.235.240.0/20"]  # IAP range
  target_tags   = ["management"]
  
  log_config {
    metadata = "INCLUDE_ALL_METADATA"
  }
}

# VPC Peering for AlloyDB
resource "google_compute_network_peering" "alloydb_peering" {
  name         = "alloydb-peering"
  network      = google_compute_network.tenderflow_vpc.self_link
  peer_network = "projects/${var.project_id}/global/networks/servicenetworking"
  
  export_custom_routes = false
  import_custom_routes = false
}

# Private Service Connection for managed services
resource "google_compute_global_address" "private_service_range" {
  name          = "private-service-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.tenderflow_vpc.id
}

resource "google_service_networking_connection" "private_service_connection" {
  network                 = google_compute_network.tenderflow_vpc.id
  service                = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_service_range.name]
}

# VPC Connector for serverless access
resource "google_vpc_access_connector" "serverless_connector" {
  name          = "tenderflow-connector"
  region        = var.region
  ip_cidr_range = "10.8.0.0/28"
  network       = google_compute_network.tenderflow_vpc.name
  
  min_instances = 2
  max_instances = 10
  
  machine_type = "e2-micro"
}

# Network Endpoint Groups for Cloud Run
resource "google_compute_region_network_endpoint_group" "api_neg" {
  name                  = "api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  
  cloud_run {
    service = var.cloud_run_api_service_name
  }
}

resource "google_compute_region_network_endpoint_group" "web_neg" {
  name                  = "web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region
  
  cloud_run {
    service = var.cloud_run_web_service_name
  }
}

# Global Load Balancer Backend
resource "google_compute_backend_service" "api_backend" {
  name        = "api-backend"
  protocol    = "HTTPS"
  port_name   = "http"
  timeout_sec = 30
  
  backend {
    group = google_compute_region_network_endpoint_group.api_neg.id
  }
  
  health_checks = [google_compute_health_check.api_health.id]
  
  log_config {
    enable      = true
    sample_rate = 1.0
  }
  
  security_policy = google_compute_security_policy.cloud_armor_policy.id
  
  cdn_policy {
    cache_mode = "CACHE_ALL_STATIC"
    default_ttl = 3600
    max_ttl     = 86400
    
    negative_caching = true
    negative_caching_policy {
      code = 404
      ttl  = 120
    }
  }
}

# Health Check
resource "google_compute_health_check" "api_health" {
  name               = "api-health-check"
  check_interval_sec = 10
  timeout_sec        = 5
  healthy_threshold  = 2
  unhealthy_threshold = 3
  
  https_health_check {
    port         = 443
    request_path = "/health"
  }
  
  log_config {
    enable = true
  }
}

# DNS Zones and Records
resource "google_dns_managed_zone" "tenderflow_zone" {
  name        = "tenderflow-zone"
  dns_name    = "${var.domain_name}."
  description = "DNS zone for TenderFlow application"
  
  dnssec_config {
    state = "on"
    default_key_specs {
      algorithm  = "rsasha256"
      key_type   = "keySigning"
      key_length = 2048
    }
    default_key_specs {
      algorithm  = "rsasha256"
      key_type   = "zoneSigning"
      key_length = 1024
    }
  }
}

# Private DNS Zone for internal services
resource "google_dns_managed_zone" "internal_zone" {
  name        = "tenderflow-internal"
  dns_name    = "internal.tenderflow.local."
  description = "Private DNS zone for internal services"
  
  visibility = "private"
  
  private_visibility_config {
    networks {
      network_url = google_compute_network.tenderflow_vpc.id
    }
  }
}

# Network Security Policy
resource "google_compute_security_policy" "cloud_armor_policy" {
  name = "tenderflow-security-policy"
  
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
      
      enforce_on_key = "IP"
      
      rate_limit_threshold {
        count        = 100
        interval_sec = 60
      }
      
      ban_duration_sec = 600
    }
  }
  
  # OWASP Top 10 rules
  rule {
    action   = "deny(403)"
    priority = 100
    
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('xss-stable')"
      }
    }
  }
  
  rule {
    action   = "deny(403)"
    priority = 101
    
    match {
      expr {
        expression = "evaluatePreconfiguredExpr('sqli-stable')"
      }
    }
  }
  
  # Geo-blocking (if needed)
  dynamic "rule" {
    for_each = var.blocked_countries
    content {
      action   = "deny(403)"
      priority = 200 + rule.key
      
      match {
        expr {
          expression = "origin.region_code == '${rule.value}'"
        }
      }
    }
  }
}

# Outputs for other modules
output "vpc_id" {
  value = google_compute_network.tenderflow_vpc.id
}

output "vpc_name" {
  value = google_compute_network.tenderflow_vpc.name
}

output "web_subnet_id" {
  value = google_compute_subnetwork.web_tier.id
}

output "app_subnet_id" {
  value = google_compute_subnetwork.app_tier.id
}

output "data_subnet_id" {
  value = google_compute_subnetwork.data_tier.id
}

output "serverless_connector_id" {
  value = google_vpc_access_connector.serverless_connector.id
}

output "private_service_connection" {
  value = google_service_networking_connection.private_service_connection.network
}