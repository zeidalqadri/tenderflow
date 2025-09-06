# Optimized Cloud Run Configurations for TenderFlow
# Implements auto-scaling, cost optimization, and performance tuning

# Cloud Run Service for API
resource "google_cloud_run_service" "api" {
  name     = "tenderflow-api"
  location = var.region
  
  template {
    spec {
      # Service account with Workload Identity
      service_account_name = google_service_account.api_service_account.email
      
      # Container concurrency optimization
      container_concurrency = 100  # Optimized for Fastify
      
      # Timeout for long-running operations
      timeout_seconds = 300
      
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tenderflow/api:${var.api_image_tag}"
        
        # Resource optimization based on load testing
        resources {
          limits = {
            cpu    = "2000m"  # 2 vCPUs
            memory = "4Gi"
          }
          requests = {
            cpu    = "500m"   # Minimum CPU for quick scaling
            memory = "512Mi"
          }
        }
        
        # Environment variables from secrets
        env {
          name = "NODE_ENV"
          value = var.environment
        }
        
        env {
          name = "GCP_PROJECT_ID"
          value = var.project_id
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
        
        env {
          name = "REDIS_URL"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.redis_url.secret_id
              key  = "latest"
            }
          }
        }
        
        env {
          name = "JWT_SECRET"
          value_from {
            secret_key_ref {
              name = google_secret_manager_secret.jwt_secret.secret_id
              key  = "latest"
            }
          }
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
        
        # Startup probe for initialization
        startup_probe {
          initial_delay_seconds = 10
          timeout_seconds      = 3
          period_seconds       = 10
          failure_threshold    = 3
          tcp_socket {
            port = 3000
          }
        }
        
        # Liveness probe
        liveness_probe {
          initial_delay_seconds = 30
          timeout_seconds      = 3
          period_seconds       = 30
          failure_threshold    = 3
          http_get {
            path = "/health"
            port = 3000
            http_headers {
              name  = "User-Agent"
              value = "GoogleHC/1.0"
            }
          }
        }
        
        # Volume mounts for temporary files
        volume_mounts {
          name       = "tmp"
          mount_path = "/tmp"
        }
        
        volume_mounts {
          name       = "cloudsql"
          mount_path = "/cloudsql"
        }
        
        ports {
          name           = "http1"
          container_port = 3000
        }
      }
      
      # Volumes
      volumes {
        name = "tmp"
        empty_dir {
          medium     = "Memory"
          size_limit = "512Mi"
        }
      }
      
      volumes {
        name = "cloudsql"
        cloud_sql_instance {
          instances = [google_alloydb_cluster.tenderflow_primary.name]
        }
      }
    }
    
    metadata {
      annotations = {
        # Auto-scaling configuration
        "autoscaling.knative.dev/minScale"         = "1"   # Never scale to zero
        "autoscaling.knative.dev/maxScale"         = "100"
        "autoscaling.knative.dev/target"           = "80"  # Target CPU utilization
        "autoscaling.knative.dev/scaleDownDelay"   = "60s" # Delay before scaling down
        
        # VPC connector for private resources
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.serverless_connector.id
        "run.googleapis.com/vpc-access-egress"    = "private-ranges-only"
        
        # CPU allocation
        "run.googleapis.com/cpu-throttling"       = "false"  # Always allocated CPU
        "run.googleapis.com/execution-environment" = "gen2"   # Second generation
        
        # Session affinity for WebSocket connections
        "run.googleapis.com/sessionAffinity" = "true"
      }
      
      labels = {
        environment = var.environment
        team        = "platform"
        app         = "api"
        version     = var.api_version
      }
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
  
  # Gradual rollout for production
  lifecycle {
    ignore_changes = [
      template[0].metadata[0].annotations["client.knative.dev/user-image"],
      template[0].metadata[0].annotations["run.googleapis.com/client-name"],
      template[0].metadata[0].annotations["run.googleapis.com/client-version"]
    ]
  }
}

# Cloud Run Service for Web Frontend
resource "google_cloud_run_service" "web" {
  name     = "tenderflow-web"
  location = var.region
  
  template {
    spec {
      service_account_name = google_service_account.web_service_account.email
      
      container_concurrency = 1000  # Static content can handle more
      timeout_seconds      = 60
      
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tenderflow/web:${var.web_image_tag}"
        
        resources {
          limits = {
            cpu    = "1000m"
            memory = "2Gi"
          }
          requests = {
            cpu    = "200m"
            memory = "256Mi"
          }
        }
        
        env {
          name  = "NODE_ENV"
          value = var.environment
        }
        
        env {
          name  = "NEXT_PUBLIC_API_URL"
          value = "https://api.${var.domain_name}"
        }
        
        env {
          name  = "NEXT_PUBLIC_ENVIRONMENT"
          value = var.environment
        }
        
        startup_probe {
          initial_delay_seconds = 5
          timeout_seconds      = 3
          period_seconds       = 5
          failure_threshold    = 3
          tcp_socket {
            port = 3000
          }
        }
        
        liveness_probe {
          initial_delay_seconds = 15
          timeout_seconds      = 3
          period_seconds       = 30
          failure_threshold    = 3
          http_get {
            path = "/api/health"
            port = 3000
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
        # Auto-scaling for web tier
        "autoscaling.knative.dev/minScale"       = var.environment == "production" ? "2" : "1"
        "autoscaling.knative.dev/maxScale"       = "50"
        "autoscaling.knative.dev/target"         = "100"
        "autoscaling.knative.dev/scaleDownDelay" = "120s"
        
        # Network configuration
        "run.googleapis.com/vpc-access-connector" = google_vpc_access_connector.serverless_connector.id
        "run.googleapis.com/vpc-access-egress"    = "private-ranges-only"
        
        # Performance optimization
        "run.googleapis.com/cpu-throttling"       = "true"  # Can throttle for cost savings
        "run.googleapis.com/execution-environment" = "gen2"
      }
      
      labels = {
        environment = var.environment
        team        = "frontend"
        app         = "web"
        version     = var.web_version
      }
    }
  }
  
  traffic {
    percent         = 100
    latest_revision = true
  }
}

# Cloud Run Job for batch processing
resource "google_cloud_run_v2_job" "batch_processor" {
  name     = "tenderflow-batch-processor"
  location = var.region
  
  template {
    parallelism = 10
    task_count  = 1
    
    template {
      service_account = google_service_account.batch_service_account.email
      
      max_retries = 3
      timeout     = "3600s"
      
      containers {
        image = "${var.region}-docker.pkg.dev/${var.project_id}/tenderflow/batch:${var.batch_image_tag}"
        
        resources {
          limits = {
            cpu    = "4000m"
            memory = "8Gi"
          }
        }
        
        env {
          name = "DATABASE_URL"
          value_source {
            secret_key_ref {
              secret  = google_secret_manager_secret.database_url.secret_id
              version = "latest"
            }
          }
        }
        
        env {
          name  = "BATCH_SIZE"
          value = "1000"
        }
        
        volume_mounts {
          name       = "tmp"
          mount_path = "/tmp"
        }
      }
      
      volumes {
        name = "tmp"
        empty_dir {
          medium     = "Memory"
          size_limit = "2Gi"
        }
      }
      
      vpc_access {
        connector = google_vpc_access_connector.serverless_connector.id
        egress    = "PRIVATE_RANGES_ONLY"
      }
    }
  }
  
  labels = {
    environment = var.environment
    type        = "batch"
  }
}

# Service Accounts with minimal permissions
resource "google_service_account" "api_service_account" {
  account_id   = "tenderflow-api-sa"
  display_name = "TenderFlow API Service Account"
  description  = "Service account for Cloud Run API service"
}

resource "google_service_account" "web_service_account" {
  account_id   = "tenderflow-web-sa"
  display_name = "TenderFlow Web Service Account"
  description  = "Service account for Cloud Run web service"
}

resource "google_service_account" "batch_service_account" {
  account_id   = "tenderflow-batch-sa"
  display_name = "TenderFlow Batch Service Account"
  description  = "Service account for batch processing jobs"
}

# IAM bindings for service accounts
resource "google_project_iam_member" "api_sa_bindings" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectViewer",
    "roles/pubsub.publisher",
    "roles/cloudtasks.enqueuer",
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
    "roles/monitoring.metricWriter"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.api_service_account.email}"
}

resource "google_project_iam_member" "web_sa_bindings" {
  for_each = toset([
    "roles/logging.logWriter",
    "roles/cloudtrace.agent",
    "roles/monitoring.metricWriter"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.web_service_account.email}"
}

resource "google_project_iam_member" "batch_sa_bindings" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/secretmanager.secretAccessor",
    "roles/storage.objectAdmin",
    "roles/pubsub.subscriber",
    "roles/cloudtasks.viewer",
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.batch_service_account.email}"
}

# Cloud Scheduler for batch jobs
resource "google_cloud_scheduler_job" "nightly_batch" {
  name             = "tenderflow-nightly-batch"
  description      = "Trigger nightly batch processing"
  schedule         = "0 2 * * *"  # 2 AM daily
  time_zone        = "UTC"
  attempt_deadline = "320s"
  
  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.batch_processor.name}:run"
    
    oauth_token {
      service_account_email = google_service_account.batch_service_account.email
    }
  }
  
  retry_config {
    retry_count = 3
  }
}

# Traffic management and domain mapping
resource "google_cloud_run_domain_mapping" "api_domain" {
  location = var.region
  name     = "api.${var.domain_name}"
  
  metadata {
    namespace = var.project_id
  }
  
  spec {
    route_name = google_cloud_run_service.api.name
  }
}

resource "google_cloud_run_domain_mapping" "web_domain" {
  location = var.region
  name     = var.domain_name
  
  metadata {
    namespace = var.project_id
  }
  
  spec {
    route_name = google_cloud_run_service.web.name
  }
}

# IAM for public access (web only)
resource "google_cloud_run_service_iam_member" "web_public" {
  service  = google_cloud_run_service.web.name
  location = google_cloud_run_service.web.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# IAM for authenticated API access
resource "google_cloud_run_service_iam_member" "api_authenticated" {
  service  = google_cloud_run_service.api.name
  location = google_cloud_run_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"  # Protected by application-level auth
}

# Monitoring dashboard for Cloud Run
resource "google_monitoring_dashboard" "cloud_run_dashboard" {
  dashboard_json = jsonencode({
    displayName = "Cloud Run Performance Dashboard"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width = 6
          height = 4
          widget = {
            title = "Request Rate"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/request_count\""
                  }
                }
              }]
            }
          }
        },
        {
          xPos = 6
          width = 6
          height = 4
          widget = {
            title = "Request Latency (p99)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/request_latencies\""
                  }
                }
              }]
            }
          }
        },
        {
          yPos = 4
          width = 6
          height = 4
          widget = {
            title = "Container CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/container/cpu/utilizations\""
                  }
                }
              }]
            }
          }
        },
        {
          xPos = 6
          yPos = 4
          width = 6
          height = 4
          widget = {
            title = "Container Memory Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/container/memory/utilizations\""
                  }
                }
              }]
            }
          }
        },
        {
          yPos = 8
          width = 12
          height = 4
          widget = {
            title = "Container Instance Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/container/instance_count\""
                  }
                }
              }]
            }
          }
        }
      ]
    }
  })
}

# Outputs
output "api_url" {
  value = google_cloud_run_service.api.status[0].url
}

output "web_url" {
  value = google_cloud_run_service.web.status[0].url
}

output "api_service_account" {
  value = google_service_account.api_service_account.email
}

output "web_service_account" {
  value = google_service_account.web_service_account.email
}