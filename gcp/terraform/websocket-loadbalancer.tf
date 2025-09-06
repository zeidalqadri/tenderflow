# Load balancer configuration for WebSocket connections with session affinity
# Supports sticky sessions and high availability for Socket.IO connections

# Global static IP for WebSocket load balancer
resource "google_compute_global_address" "websocket_ip" {
  name = "websocket-global-ip"
  
  labels = {
    environment = var.environment
    service     = "websocket"
    component   = "loadbalancer"
  }
}

# SSL certificate for secure WebSocket connections
resource "google_compute_managed_ssl_certificate" "websocket_ssl" {
  name = "websocket-ssl-cert"
  
  managed {
    domains = [
      "ws.tenderflow.app",
      "websocket.${var.domain}",
      "realtime.${var.domain}"
    ]
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Backend service for WebSocket Cloud Run instances
resource "google_compute_backend_service" "websocket_backend" {
  name        = "websocket-backend"
  description = "WebSocket backend service with session affinity"
  
  protocol    = "HTTP2"
  timeout_sec = 300  # Extended timeout for WebSocket connections
  
  # Session affinity for sticky connections
  session_affinity = "CLIENT_IP"
  
  # Health check configuration
  health_checks = [google_compute_health_check.websocket_health.id]
  
  # Load balancing configuration optimized for WebSocket
  load_balancing_scheme = "EXTERNAL_MANAGED"
  
  # Connection draining for graceful shutdowns
  connection_draining_timeout_sec = 60
  
  # Backend configuration will be added by Cloud Run service
  backend {
    group = "placeholder"  # Will be replaced by Cloud Run NEG
  }
  
  # Logging configuration for monitoring
  log_config {
    enable      = true
    sample_rate = 0.1  # 10% sampling to reduce costs
  }
  
  # Security policy
  security_policy = google_compute_security_policy.websocket_security.id
  
  # Circuit breaker settings
  outlier_detection {
    consecutive_errors    = 3
    interval {
      seconds = 30
    }
    base_ejection_time {
      seconds = 30
    }
    max_ejection_percent = 50
  }
}

# Health check for WebSocket connections
resource "google_compute_health_check" "websocket_health" {
  name        = "websocket-health-check"
  description = "Health check for WebSocket service"
  
  timeout_sec         = 10
  check_interval_sec  = 30
  healthy_threshold   = 2
  unhealthy_threshold = 3
  
  http_health_check {
    port         = 8080
    request_path = "/health/websocket"
    
    # Custom headers for WebSocket health check
    response = "healthy"
  }
  
  log_config {
    enable = true
  }
}

# Security policy for DDoS protection and rate limiting
resource "google_compute_security_policy" "websocket_security" {
  name        = "websocket-security-policy"
  description = "Security policy for WebSocket endpoints"
  
  # Default rule - allow all traffic (will be refined by other rules)
  rule {
    action   = "allow"
    priority = 2147483647  # Lowest priority (default)
    
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
        count        = 1000  # Requests per period
        interval_sec = 60    # Period duration
      }
      
      ban_duration_sec = 300  # 5 minutes
    }
  }
  
  # Geographic restriction (if needed for compliance)
  rule {
    action   = "allow"
    priority = 500
    
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = [
          # Add specific country/region IP ranges if needed
          # for government compliance requirements
        ]
      }
    }
  }
  
  # Bot protection
  adaptive_protection_config {
    layer_7_ddos_defense_config {
      enable          = true
      rule_visibility = "STANDARD"
    }
  }
}

# URL map for routing WebSocket traffic
resource "google_compute_url_map" "websocket_urlmap" {
  name        = "websocket-urlmap"
  description = "URL map for WebSocket load balancer"
  
  default_service = google_compute_backend_service.websocket_backend.id
  
  # WebSocket-specific routing
  host_rule {
    hosts        = ["ws.tenderflow.app", "websocket.${var.domain}", "realtime.${var.domain}"]
    path_matcher = "websocket-paths"
  }
  
  path_matcher {
    name            = "websocket-paths"
    default_service = google_compute_backend_service.websocket_backend.id
    
    # Socket.IO specific paths
    path_rule {
      paths   = ["/socket.io/*"]
      service = google_compute_backend_service.websocket_backend.id
    }
    
    # Health check path
    path_rule {
      paths   = ["/health/*"]
      service = google_compute_backend_service.websocket_backend.id
    }
    
    # WebSocket upgrade path
    path_rule {
      paths   = ["/ws/*"]
      service = google_compute_backend_service.websocket_backend.id
    }
  }
  
  # Custom error pages for better user experience
  default_url_redirect {
    redirect_response_code = "FOUND"
    https_redirect         = true
    strip_query            = false
  }
}

# HTTPS proxy for SSL termination
resource "google_compute_target_https_proxy" "websocket_https_proxy" {
  name             = "websocket-https-proxy"
  url_map          = google_compute_url_map.websocket_urlmap.id
  ssl_certificates = [google_compute_managed_ssl_certificate.websocket_ssl.id]
  
  # SSL policy for security
  ssl_policy = google_compute_ssl_policy.websocket_ssl_policy.id
}

# SSL policy with strong security settings
resource "google_compute_ssl_policy" "websocket_ssl_policy" {
  name            = "websocket-ssl-policy"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
  
  # Custom cipher suites for government compliance
  custom_features = [
    "TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384",
    "TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256",
  ]
}

# HTTP to HTTPS redirect
resource "google_compute_target_http_proxy" "websocket_http_proxy" {
  name    = "websocket-http-proxy"
  url_map = google_compute_url_map.websocket_redirect.id
}

resource "google_compute_url_map" "websocket_redirect" {
  name = "websocket-redirect"
  
  default_url_redirect {
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    https_redirect         = true
    strip_query            = false
  }
}

# Global forwarding rules
resource "google_compute_global_forwarding_rule" "websocket_https" {
  name       = "websocket-https-forwarding-rule"
  target     = google_compute_target_https_proxy.websocket_https_proxy.id
  port_range = "443"
  ip_address = google_compute_global_address.websocket_ip.address
  
  labels = {
    environment = var.environment
    service     = "websocket"
    protocol    = "https"
  }
}

resource "google_compute_global_forwarding_rule" "websocket_http" {
  name       = "websocket-http-forwarding-rule"
  target     = google_compute_target_http_proxy.websocket_http_proxy.id
  port_range = "80"
  ip_address = google_compute_global_address.websocket_ip.address
  
  labels = {
    environment = var.environment
    service     = "websocket"
    protocol    = "http"
  }
}

# Cloud Armor logging
resource "google_logging_project_sink" "websocket_security_logs" {
  name = "websocket-security-logs"
  
  destination = "storage.googleapis.com/${google_storage_bucket.logs.name}"
  
  filter = <<-EOF
    resource.type="http_load_balancer" AND
    resource.labels.backend_service_name="${google_compute_backend_service.websocket_backend.name}"
  EOF
  
  unique_writer_identity = true
}

# Monitoring dashboard for WebSocket load balancer
resource "google_monitoring_dashboard" "websocket_lb_dashboard" {
  dashboard_json = jsonencode({
    displayName = "WebSocket Load Balancer Dashboard"
    mosaicLayout = {
      tiles = [
        {
          width  = 6
          height = 4
          widget = {
            title = "WebSocket Connection Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"gce_instance\" AND metric.type=\"loadbalancing.googleapis.com/https/request_count\""
                  }
                }
                plotType = "LINE"
              }]
              yAxis = {
                label = "Connections/sec"
              }
            }
          }
        },
        {
          width  = 6
          height = 4
          yPos   = 0
          xPos   = 6
          widget = {
            title = "Backend Latency"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"https_lb_rule\" AND metric.type=\"loadbalancing.googleapis.com/https/backend_latencies\""
                  }
                }
                plotType = "LINE"
              }]
              yAxis = {
                label = "Latency (ms)"
              }
            }
          }
        }
      ]
    }
  })
}

# Outputs
output "websocket_ip_address" {
  description = "Global IP address for WebSocket load balancer"
  value       = google_compute_global_address.websocket_ip.address
}

output "websocket_ssl_certificate" {
  description = "SSL certificate status"
  value = {
    name   = google_compute_managed_ssl_certificate.websocket_ssl.name
    status = google_compute_managed_ssl_certificate.websocket_ssl.managed[0].status
  }
}

output "websocket_endpoints" {
  description = "WebSocket endpoints"
  value = {
    https = "https://ws.tenderflow.app"
    wss   = "wss://ws.tenderflow.app/socket.io/"
  }
}