# Enhanced Redis cluster configuration for WebSocket scaling
# Supports 10,000+ concurrent Socket.IO connections with high availability

resource "google_redis_instance" "websocket_cluster" {
  name               = "websocket-cluster"
  tier               = "STANDARD_HA"
  memory_size_gb     = 16
  region             = var.region
  location_id        = "${var.region}-a"
  alternative_location_id = "${var.region}-b"
  
  # Redis version optimized for Socket.IO adapter
  redis_version = "REDIS_7_0"
  
  # Network configuration
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  
  # Performance configuration for WebSocket workload
  redis_configs = {
    "maxmemory-policy"         = "allkeys-lru"
    "maxmemory-samples"        = "5"
    "maxclients"              = "20000"
    "timeout"                 = "300"
    "tcp-keepalive"           = "60"
    "notify-keyspace-events"  = "Ex"  # For Socket.IO adapter
  }
  
  # Enable automatic failover and persistence
  replica_count = 1
  read_replicas_mode = "READ_REPLICAS_ENABLED"
  
  # Maintenance and backup
  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 2
        minutes = 0
      }
    }
  }
  
  # Security and compliance
  auth_enabled = true
  transit_encryption_mode = "SERVER_CLIENT"
  
  labels = {
    environment = var.environment
    service     = "websocket"
    compliance  = "government"
    component   = "realtime"
  }
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Read replicas for load distribution
resource "google_redis_instance" "websocket_read_replica" {
  count = 2
  
  name               = "websocket-read-replica-${count.index + 1}"
  tier               = "STANDARD_HA"
  memory_size_gb     = 8
  region             = var.region
  location_id        = "${var.region}-${count.index == 0 ? "b" : "c"}"
  
  redis_version = "REDIS_7_0"
  
  # Read replica configuration
  replica_count = 0
  read_replicas_mode = "READ_REPLICAS_DISABLED"
  
  authorized_network = google_compute_network.vpc.id
  connect_mode       = "PRIVATE_SERVICE_ACCESS"
  
  # Performance tuning for read operations
  redis_configs = {
    "maxmemory-policy" = "allkeys-lru"
    "maxclients"      = "10000"
    "timeout"         = "300"
  }
  
  auth_enabled = true
  transit_encryption_mode = "SERVER_CLIENT"
  
  labels = {
    environment = var.environment
    service     = "websocket"
    type        = "read-replica"
  }
  
  depends_on = [google_service_networking_connection.private_vpc_connection]
}

# Redis connection pooling service account
resource "google_service_account" "redis_connection_pool" {
  account_id   = "redis-connection-pool"
  display_name = "Redis Connection Pool Service Account"
  description  = "Service account for WebSocket Redis connection pooling"
}

resource "google_project_iam_member" "redis_connection_pool_editor" {
  project = var.project_id
  role    = "roles/redis.editor"
  member  = "serviceAccount:${google_service_account.redis_connection_pool.email}"
}

# Redis monitoring and alerting
resource "google_monitoring_alert_policy" "redis_memory_usage" {
  display_name = "Redis Memory Usage Alert"
  
  conditions {
    display_name = "Redis memory usage > 80%"
    
    condition_threshold {
      filter          = "resource.type=\"gce_instance\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\""
      duration        = "300s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 0.8
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
  
  alert_strategy {
    auto_close = "86400s"  # 24 hours
  }
}

resource "google_monitoring_alert_policy" "redis_connection_count" {
  display_name = "Redis Connection Count Alert"
  
  conditions {
    display_name = "Redis connections > 15000"
    
    condition_threshold {
      filter          = "resource.type=\"gce_instance\" AND metric.type=\"redis.googleapis.com/stats/connections/total\""
      duration        = "60s"
      comparison      = "COMPARISON_GREATER_THAN"
      threshold_value = 15000
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
}

# Output Redis connection information
output "redis_host" {
  description = "Redis cluster primary endpoint"
  value       = google_redis_instance.websocket_cluster.host
}

output "redis_port" {
  description = "Redis cluster port"
  value       = google_redis_instance.websocket_cluster.port
}

output "redis_auth_string" {
  description = "Redis authentication string"
  value       = google_redis_instance.websocket_cluster.auth_string
  sensitive   = true
}

output "redis_read_replicas" {
  description = "Redis read replica endpoints"
  value = [
    for replica in google_redis_instance.websocket_read_replica : {
      name = replica.name
      host = replica.host
      port = replica.port
    }
  ]
}