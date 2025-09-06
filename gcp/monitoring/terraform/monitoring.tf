# Comprehensive monitoring and observability infrastructure for TenderFlow
# Government compliance with 99.9% uptime SLA and audit requirements

# Enable required APIs
resource "google_project_service" "monitoring_apis" {
  for_each = toset([
    "monitoring.googleapis.com",
    "logging.googleapis.com",
    "cloudtrace.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "cloudprofiler.googleapis.com"
  ])
  
  project = var.project_id
  service = each.value
  
  disable_dependent_services = false
}

# Service account for monitoring and observability
resource "google_service_account" "monitoring_service" {
  account_id   = "monitoring-service"
  display_name = "Monitoring Service Account"
  description  = "Service account for monitoring, logging, and observability"
}

# IAM roles for monitoring service account
resource "google_project_iam_member" "monitoring_roles" {
  for_each = toset([
    "roles/monitoring.editor",
    "roles/logging.admin",
    "roles/cloudtrace.agent",
    "roles/errorreporting.writer",
    "roles/cloudprofiler.agent"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.monitoring_service.email}"
}

# Notification channels for alerts
resource "google_monitoring_notification_channel" "email_critical" {
  display_name = "Critical Alerts Email"
  type         = "email"
  
  labels = {
    email_address = var.alert_email_critical
  }
  
  enabled = true
  
  description = "High-priority alerts requiring immediate attention"
}

resource "google_monitoring_notification_channel" "email_performance" {
  display_name = "Performance Alerts Email"
  type         = "email"
  
  labels = {
    email_address = var.alert_email_performance
  }
  
  enabled = true
  
  description = "Performance degradation notifications"
}

resource "google_monitoring_notification_channel" "slack_alerts" {
  display_name = "Slack Alerts"
  type         = "slack"
  
  labels = {
    channel_name = var.slack_channel_name
    url         = var.slack_webhook_url
  }
  
  enabled = true
  
  description = "Slack notifications for team awareness"
}

# Uptime checks for critical endpoints
resource "google_monitoring_uptime_check_config" "api_health" {
  display_name = "API Health Check"
  timeout      = "10s"
  period       = "60s"
  
  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
    
    headers = {
      "User-Agent" = "Google-Cloud-Uptime-Check"
    }
  }
  
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "api.${var.domain}"
    }
  }
  
  content_matchers {
    content = "healthy"
    matcher = "CONTAINS_STRING"
  }
  
  checker_type = "STATIC_IP_CHECKERS"
}

resource "google_monitoring_uptime_check_config" "websocket_health" {
  display_name = "WebSocket Service Health Check"
  timeout      = "10s"
  period       = "60s"
  
  http_check {
    path         = "/health/websocket"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }
  
  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "ws.${var.domain}"
    }
  }
  
  content_matchers {
    content = "healthy"
    matcher = "CONTAINS_STRING"
  }
  
  checker_type = "STATIC_IP_CHECKERS"
}

# SLO definitions for government compliance
resource "google_monitoring_slo" "api_availability" {
  service      = google_monitoring_service.api_service.service_id
  display_name = "API Availability SLO"
  
  goal                = 0.999  # 99.9% availability
  rolling_period_days = 30
  
  request_based_sli {
    good_total_ratio {
      total_service_filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"tenderflow-api.*\""
      good_service_filter  = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"tenderflow-api.*\" AND metric.label.response_code_class!=\"5xx\""
    }
  }
}

resource "google_monitoring_slo" "api_latency" {
  service      = google_monitoring_service.api_service.service_id
  display_name = "API Latency SLO"
  
  goal                = 0.95   # 95% of requests under 2s
  rolling_period_days = 7
  
  request_based_sli {
    distribution_cut {
      distribution_filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"tenderflow-api.*\" AND metric.type=\"run.googleapis.com/request_latencies\""
      
      range {
        max = 2000  # 2 seconds in milliseconds
      }
    }
  }
}

resource "google_monitoring_slo" "websocket_availability" {
  service      = google_monitoring_service.websocket_service.service_id
  display_name = "WebSocket Availability SLO"
  
  goal                = 0.995  # 99.5% availability for real-time services
  rolling_period_days = 7
  
  request_based_sli {
    good_total_ratio {
      total_service_filter = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"tenderflow-websocket\""
      good_service_filter  = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=\"tenderflow-websocket\" AND metric.label.response_code_class!=\"5xx\""
    }
  }
}

# Service definitions for SLO monitoring
resource "google_monitoring_service" "api_service" {
  service_id   = "api-service"
  display_name = "TenderFlow API Service"
  
  basic_service {
    service_type = "CLOUD_RUN"
    service_labels = {
      service_name = "tenderflow-api"
      location     = var.region
    }
  }
}

resource "google_monitoring_service" "websocket_service" {
  service_id   = "websocket-service"
  display_name = "TenderFlow WebSocket Service"
  
  basic_service {
    service_type = "CLOUD_RUN"
    service_labels = {
      service_name = "tenderflow-websocket"
      location     = var.region
    }
  }
}

# Alert policies for SLO violations
resource "google_monitoring_alert_policy" "api_availability_slo_alert" {
  display_name = "API Availability SLO Violation"
  
  conditions {
    display_name = "API availability below 99.9%"
    
    condition_threshold {
      filter         = "select_slo_health(\"${google_monitoring_slo.api_availability.name}\")"
      duration       = "300s"  # 5 minutes
      comparison     = "COMPARISON_LESS_THAN"
      threshold_value = 0.999
      
      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.email_critical.id,
    google_monitoring_notification_channel.slack_alerts.id
  ]
  
  alert_strategy {
    auto_close = "86400s"  # 24 hours
    
    notification_rate_limit {
      period = "300s"  # Max one notification per 5 minutes
    }
  }
  
  severity = "CRITICAL"
  
  documentation {
    content = "API availability has dropped below the required 99.9% SLA. This violates government compliance requirements."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "high_error_rate" {
  display_name = "High Error Rate Alert"
  
  conditions {
    display_name = "Error rate > 1%"
    
    condition_threshold {
      filter     = "resource.type=\"cloud_run_revision\" AND metric.type=\"run.googleapis.com/request_count\" AND (metric.label.response_code_class=\"4xx\" OR metric.label.response_code_class=\"5xx\")"
      duration   = "180s"  # 3 minutes
      comparison = "COMPARISON_GREATER_THAN"
      threshold_value = 0.01  # 1%
      
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.email_critical.id
  ]
  
  severity = "CRITICAL"
  
  documentation {
    content = "Application error rate has exceeded 1%. Immediate investigation required."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "High API Latency Alert"
  
  conditions {
    display_name = "API latency > 2s (95th percentile)"
    
    condition_threshold {
      filter     = "resource.type=\"cloud_run_revision\" AND resource.label.service_name=~\"tenderflow-api.*\" AND metric.type=\"run.googleapis.com/request_latencies\""
      duration   = "600s"  # 10 minutes
      comparison = "COMPARISON_GREATER_THAN"
      threshold_value = 2000  # 2 seconds
      
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.email_performance.id
  ]
  
  severity = "WARNING"
  
  documentation {
    content = "API response times have exceeded 2 seconds for the 95th percentile."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "database_connection_spike" {
  display_name = "Database Connection Spike"
  
  conditions {
    display_name = "Database connections > 80% of max"
    
    condition_threshold {
      filter     = "resource.type=\"cloudsql_database\" AND metric.type=\"cloudsql.googleapis.com/database/postgresql/num_backends\""
      duration   = "300s"
      comparison = "COMPARISON_GREATER_THAN"
      threshold_value = 80  # Adjust based on your connection limit
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.email_performance.id
  ]
  
  severity = "WARNING"
  
  documentation {
    content = "Database connection count is approaching limits. Check for connection leaks."
    mime_type = "text/markdown"
  }
}

resource "google_monitoring_alert_policy" "redis_memory_high" {
  display_name = "Redis Memory Usage High"
  
  conditions {
    display_name = "Redis memory usage > 80%"
    
    condition_threshold {
      filter     = "resource.type=\"redis_instance\" AND metric.type=\"redis.googleapis.com/stats/memory/usage_ratio\""
      duration   = "300s"
      comparison = "COMPARISON_GREATER_THAN"
      threshold_value = 0.8
      
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }
  
  notification_channels = [
    google_monitoring_notification_channel.email_performance.id
  ]
  
  severity = "WARNING"
  
  documentation {
    content = "Redis memory usage is high. Consider scaling or cache optimization."
    mime_type = "text/markdown"
  }
}

# Custom metrics for business monitoring
resource "google_monitoring_metric_descriptor" "active_tenders" {
  type        = "custom.googleapis.com/business/active_tenders"
  metric_kind = "GAUGE"
  value_type  = "INT64"
  
  display_name = "Active Tenders Count"
  description  = "Number of active tenders in the system"
  
  labels {
    key         = "tenant_id"
    value_type  = "STRING"
    description = "Tenant identifier"
  }
  
  labels {
    key         = "status"
    value_type  = "STRING"
    description = "Tender status"
  }
}

resource "google_monitoring_metric_descriptor" "document_processing_time" {
  type        = "custom.googleapis.com/business/document_processing_time"
  metric_kind = "GAUGE"
  value_type  = "DOUBLE"
  unit        = "s"
  
  display_name = "Document Processing Time"
  description  = "Time taken to process documents (OCR, validation)"
  
  labels {
    key         = "document_type"
    value_type  = "STRING"
    description = "Type of document processed"
  }
  
  labels {
    key         = "processing_stage"
    value_type  = "STRING"
    description = "Processing stage (upload, ocr, validation)"
  }
}

resource "google_monitoring_metric_descriptor" "websocket_connections" {
  type        = "custom.googleapis.com/websocket/active_connections"
  metric_kind = "GAUGE"
  value_type  = "INT64"
  
  display_name = "Active WebSocket Connections"
  description  = "Number of active WebSocket connections"
  
  labels {
    key         = "tenant_id"
    value_type  = "STRING"
    description = "Tenant identifier"
  }
  
  labels {
    key         = "connection_type"
    value_type  = "STRING"
    description = "Type of connection (websocket, polling)"
  }
}

resource "google_monitoring_metric_descriptor" "auth_failures" {
  type        = "custom.googleapis.com/auth/failed_attempts"
  metric_kind = "GAUGE"
  value_type  = "INT64"
  
  display_name = "Authentication Failures"
  description  = "Number of failed authentication attempts"
  
  labels {
    key         = "source_ip"
    value_type  = "STRING"
    description = "Source IP address"
  }
  
  labels {
    key         = "failure_reason"
    value_type  = "STRING"
    description = "Reason for authentication failure"
  }
}

# Log-based metrics for custom monitoring
resource "google_logging_metric" "auth_failures_metric" {
  name   = "auth_failures"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.event=\"auth_failed\""
  
  label_extractors = {
    source_ip      = "EXTRACT(jsonPayload.source_ip)"
    failure_reason = "EXTRACT(jsonPayload.reason)"
    tenant_id      = "EXTRACT(jsonPayload.tenant_id)"
  }
  
  metric_descriptor {
    metric_kind = "COUNTER"
    value_type  = "INT64"
    display_name = "Authentication Failures"
  }
}

resource "google_logging_metric" "slow_queries_metric" {
  name   = "slow_database_queries"
  filter = "resource.type=\"cloud_run_revision\" AND jsonPayload.event=\"slow_query\" AND jsonPayload.duration_ms > 1000"
  
  label_extractors = {
    query_type = "EXTRACT(jsonPayload.query_type)"
    duration   = "EXTRACT(jsonPayload.duration_ms)"
  }
  
  metric_descriptor {
    metric_kind = "COUNTER"
    value_type  = "INT64"
    display_name = "Slow Database Queries"
  }
}

# Dashboard creation (reference to external JSON files)
resource "google_monitoring_dashboard" "main_dashboard" {
  dashboard_json = file("${path.module}/../dashboards/main-dashboard.json")
}

# Log sink for audit compliance
resource "google_logging_project_sink" "audit_logs" {
  name        = "audit-logs-sink"
  destination = "storage.googleapis.com/${google_storage_bucket.audit_logs.name}"
  
  filter = <<-EOT
    protoPayload.@type="type.googleapis.com/google.cloud.audit.AuditLog"
    OR
    resource.type="cloud_run_revision" AND (
      jsonPayload.event="user_action" 
      OR jsonPayload.event="auth_success"
      OR jsonPayload.event="auth_failed"
      OR jsonPayload.event="data_access"
    )
  EOT
  
  unique_writer_identity = true
}

# Storage bucket for audit logs
resource "google_storage_bucket" "audit_logs" {
  name          = "${var.project_id}-audit-logs"
  location      = var.region
  force_destroy = false
  
  # Retention policy for compliance
  retention_policy {
    retention_period = 2557440000  # 7 years in seconds
  }
  
  # Versioning for integrity
  versioning {
    enabled = true
  }
  
  # Lifecycle management
  lifecycle_rule {
    condition {
      age = 30  # days
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
  
  lifecycle_rule {
    condition {
      age = 365  # days
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }
  
  # Uniform bucket-level access
  uniform_bucket_level_access = true
  
  labels = {
    environment = var.environment
    purpose     = "audit-logs"
    compliance  = "government"
  }
}

# IAM for audit log sink
resource "google_project_iam_member" "audit_log_writer" {
  project = var.project_id
  role    = "roles/storage.objectCreator"
  member  = google_logging_project_sink.audit_logs.writer_identity
}

# Output values
output "monitoring_service_account" {
  description = "Monitoring service account email"
  value       = google_service_account.monitoring_service.email
}

output "notification_channels" {
  description = "Created notification channels"
  value = {
    critical    = google_monitoring_notification_channel.email_critical.id
    performance = google_monitoring_notification_channel.email_performance.id
    slack       = google_monitoring_notification_channel.slack_alerts.id
  }
}

output "uptime_checks" {
  description = "Created uptime checks"
  value = {
    api_health       = google_monitoring_uptime_check_config.api_health.id
    websocket_health = google_monitoring_uptime_check_config.websocket_health.id
  }
}

output "audit_log_bucket" {
  description = "Audit log storage bucket"
  value       = google_storage_bucket.audit_logs.name
}