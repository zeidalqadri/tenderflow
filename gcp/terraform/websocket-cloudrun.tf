# Enhanced Cloud Run configuration for WebSocket service
# Optimized for 10,000+ concurrent connections with auto-scaling

resource "google_cloud_run_v2_service" "websocket_service" {
  name     = "tenderflow-websocket"
  location = var.region
  
  deletion_policy = "ABANDON"
  
  template {
    # Scaling configuration for high concurrency
    scaling {
      min_instance_count = 2    # Always keep minimum instances warm
      max_instance_count = 50   # Scale up to handle peak load
    }
    
    # Session affinity annotation (required for WebSocket sticky sessions)
    annotations = {
      "run.googleapis.com/execution-environment" = "gen2"
      "autoscaling.knative.dev/maxScale"        = "50"
      "autoscaling.knative.dev/minScale"        = "2"
      "run.googleapis.com/sessionAffinity"      = "true"
      
      # WebSocket-specific optimizations
      "run.googleapis.com/cpu-throttling"       = "false"
      "run.googleapis.com/startup-cpu-boost"    = "true"
    }
    
    # Service account for GCP integrations
    service_account = google_service_account.websocket_service.email
    
    # Container specification
    containers {
      image = "gcr.io/${var.project_id}/tenderflow-websocket:latest"
      
      # Resource allocation optimized for WebSocket workload
      resources {
        limits = {
          cpu    = "2000m"    # 2 full CPUs for handling many connections
          memory = "4Gi"      # 4GB RAM for connection state and message buffering
        }
        cpu_idle = false      # Never throttle CPU for WebSocket responsiveness
      }
      
      ports {
        name           = "http1"
        container_port = 8080
      }
      
      # Environment variables
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      env {
        name  = "PORT"
        value = "8080"
      }
      
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      
      env {
        name  = "REDIS_HOST"
        value = google_redis_instance.websocket_cluster.host
      }
      
      env {
        name  = "REDIS_PORT"
        value = tostring(google_redis_instance.websocket_cluster.port)
      }
      
      # Redis authentication
      env {
        name = "REDIS_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.redis_auth.secret_id
            version = "latest"
          }
        }
      }
      
      # JWT secrets for authentication
      env {
        name = "JWT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_secret.secret_id
            version = "latest"
          }
        }
      }
      
      env {
        name = "JWT_REFRESH_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.jwt_refresh_secret.secret_id
            version = "latest"
          }
        }
      }
      
      # Frontend URL for CORS
      env {
        name  = "FRONTEND_URL"
        value = "https://${var.domain}"
      }
      
      # API URL for token validation
      env {
        name  = "API_URL"
        value = google_cloud_run_v2_service.api.uri
      }
      
      # WebSocket service URL for Pub/Sub push endpoints
      env {
        name  = "WEBSOCKET_SERVICE_URL"
        value = "https://${google_compute_global_address.websocket_ip.address}"
      }
      
      # Performance tuning environment variables
      env {
        name  = "UV_THREADPOOL_SIZE"
        value = "128"
      }
      
      env {
        name  = "NODE_OPTIONS"
        value = "--max-old-space-size=3072 --max-semi-space-size=256"
      }
      
      # WebSocket-specific configuration
      env {
        name  = "SOCKET_IO_PING_TIMEOUT"
        value = "60000"
      }
      
      env {
        name  = "SOCKET_IO_PING_INTERVAL"
        value = "25000"
      }
      
      env {
        name  = "SOCKET_IO_MAX_HTTP_BUFFER_SIZE"
        value = "1000000"
      }
      
      env {
        name  = "REDIS_CONNECT_TIMEOUT"
        value = "10000"
      }
      
      # Health check configuration
      startup_probe {
        initial_delay_seconds = 10
        timeout_seconds      = 5
        period_seconds       = 10
        failure_threshold    = 3
        
        http_get {
          path = "/health/websocket"
          port = 8080
        }
      }
      
      liveness_probe {
        initial_delay_seconds = 30
        timeout_seconds      = 5
        period_seconds       = 30
        failure_threshold    = 3
        
        http_get {
          path = "/health/websocket"
          port = 8080
        }
      }
      
      # Volume mounts for temporary files (if needed)
      volume_mounts {
        name       = "tmp"
        mount_path = "/tmp"
      }
    }
    
    # Temporary volume for file operations
    volumes {
      name = "tmp"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "100Mi"
      }
    }
    
    # Network configuration
    vpc_access {
      connector = google_vpc_access_connector.vpc_connector.id
      egress    = "PRIVATE_RANGES_ONLY"
    }
    
    # Timeout configuration (important for long-lived WebSocket connections)
    timeout = "3600s"  # 1 hour timeout for connections
    
    # Execution environment
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
  }
  
  # Traffic configuration for gradual rollouts
  traffic {
    percent = 100
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
  }
  
  depends_on = [
    google_redis_instance.websocket_cluster,
    google_secret_manager_secret_version.redis_auth,
    google_secret_manager_secret_version.jwt_secret,
    google_secret_manager_secret_version.jwt_refresh_secret,
  ]
}

# Service account for WebSocket service
resource "google_service_account" "websocket_service" {
  account_id   = "websocket-service"
  display_name = "WebSocket Service Account"
  description  = "Service account for WebSocket Cloud Run service"
}

# IAM roles for WebSocket service
resource "google_project_iam_member" "websocket_redis_user" {
  project = var.project_id
  role    = "roles/redis.editor"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

resource "google_project_iam_member" "websocket_pubsub_subscriber" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

resource "google_project_iam_member" "websocket_pubsub_publisher" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

resource "google_project_iam_member" "websocket_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

resource "google_project_iam_member" "websocket_monitoring_writer" {
  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

resource "google_project_iam_member" "websocket_logging_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.websocket_service.email}"
}

# Network Endpoint Group for load balancer integration
resource "google_compute_region_network_endpoint_group" "websocket_neg" {
  name         = "websocket-neg"
  region       = var.region
  network_endpoint_type = "SERVERLESS"
  
  cloud_run {
    service = google_cloud_run_v2_service.websocket_service.name
  }
}

# Connect NEG to backend service
resource "google_compute_backend_service" "websocket_backend_updated" {
  name        = "websocket-backend-updated"
  description = "WebSocket backend service with NEG"
  
  protocol    = "HTTP2"
  timeout_sec = 3600  # 1 hour timeout for WebSocket connections
  
  # Session affinity for sticky connections
  session_affinity = "CLIENT_IP"
  
  # Backend NEG
  backend {
    group = google_compute_region_network_endpoint_group.websocket_neg.id
  }
  
  # Health check
  health_checks = [google_compute_health_check.websocket_health.id]
  
  # Load balancing configuration
  load_balancing_scheme = "EXTERNAL_MANAGED"
  
  # Connection draining
  connection_draining_timeout_sec = 300  # 5 minutes
  
  # Logging
  log_config {
    enable      = true
    sample_rate = 0.1
  }
  
  # Security policy
  security_policy = google_compute_security_policy.websocket_security.id
  
  # Circuit breaker for reliability
  outlier_detection {
    consecutive_errors    = 5
    interval {
      seconds = 30
    }
    base_ejection_time {
      seconds = 30
    }
    max_ejection_percent = 50
  }
}

# Update URL map to use the new backend service
resource "google_compute_url_map" "websocket_urlmap_updated" {
  name        = "websocket-urlmap-updated"
  description = "URL map for WebSocket load balancer with NEG"
  
  default_service = google_compute_backend_service.websocket_backend_updated.id
  
  # WebSocket-specific routing
  host_rule {
    hosts        = ["ws.tenderflow.app", "websocket.${var.domain}", "realtime.${var.domain}"]
    path_matcher = "websocket-paths"
  }
  
  path_matcher {
    name            = "websocket-paths"
    default_service = google_compute_backend_service.websocket_backend_updated.id
    
    # Socket.IO specific paths
    path_rule {
      paths   = ["/socket.io/*"]
      service = google_compute_backend_service.websocket_backend_updated.id
    }
    
    # Health check path
    path_rule {
      paths   = ["/health/*"]
      service = google_compute_backend_service.websocket_backend_updated.id
    }
    
    # Pub/Sub webhook paths
    path_rule {
      paths   = ["/pubsub/*"]
      service = google_compute_backend_service.websocket_backend_updated.id
    }
    
    # API paths for manual event triggering
    path_rule {
      paths   = ["/api/*"]
      service = google_compute_backend_service.websocket_backend_updated.id
    }
  }
}

# Monitoring and alerting for WebSocket service
resource "google_monitoring_alert_policy" "websocket_high_connection_count" {
  display_name = "WebSocket High Connection Count"
  
  conditions {
    display_name = "WebSocket connections > 8000 per instance"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.websocket_service.name}\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 8000
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
  
  alert_strategy {
    auto_close = "1800s"  # 30 minutes
  }
}

resource "google_monitoring_alert_policy" "websocket_high_memory_usage" {
  display_name = "WebSocket High Memory Usage"
  
  conditions {
    display_name = "Memory usage > 80%"
    
    condition_threshold {
      filter          = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"${google_cloud_run_v2_service.websocket_service.name}\" AND metric.type=\"run.googleapis.com/container/memory/utilizations\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 0.8
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Outputs
output "websocket_service_url" {
  description = "WebSocket service URL"
  value       = google_cloud_run_v2_service.websocket_service.uri
}

output "websocket_service_account" {
  description = "WebSocket service account email"
  value       = google_service_account.websocket_service.email
}

output "websocket_neg_id" {
  description = "WebSocket Network Endpoint Group ID"
  value       = google_compute_region_network_endpoint_group.websocket_neg.id
}