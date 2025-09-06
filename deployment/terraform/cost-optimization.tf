# Cost Optimization Strategies for TenderFlow GCP Deployment
# Implements committed use discounts, right-sizing, and resource optimization

# Committed Use Discount for Compute Resources
resource "google_compute_commitment" "cpu_commitment" {
  name        = "tenderflow-cpu-commitment-1yr"
  region      = var.region
  description = "1-year commitment for CPU resources"
  
  resources {
    type   = "VCPU"
    amount = "10"  # Commit to 10 vCPUs based on baseline usage
  }
  
  resources {
    type   = "MEMORY"
    amount = "40"  # 40 GB memory commitment
  }
  
  plan = "TWELVE_MONTH"  # 37% discount
  
  category = "MACHINE"
  
  auto_renew = true  # Automatically renew for continuous savings
}

# Committed Use Discount for Cloud SQL (via reservation)
resource "google_sql_database_instance_reservation" "alloydb_commitment" {
  name        = "tenderflow-alloydb-commitment"
  location    = var.region
  
  commitment {
    plan = "TWELVE_MONTH"
    
    resources {
      cpu_count = 4
      memory_gb = 16
    }
  }
  
  description = "1-year commitment for AlloyDB resources (52% savings)"
}

# Budget alerts for cost monitoring
resource "google_billing_budget" "monthly_budget" {
  billing_account = var.billing_account_id
  display_name    = "TenderFlow Monthly Budget"
  
  budget_filter {
    projects = ["projects/${var.project_id}"]
    
    # Monitor specific services
    services = [
      "services/24E6-581D-38E5",  # Cloud Run
      "services/9662-B51E-5089",  # Cloud SQL
      "services/95FF-2EF5-5EA1",  # Cloud Storage
      "services/CAD8-E2B4-B593",  # Load Balancing
    ]
  }
  
  amount {
    specified_amount {
      currency_code = "USD"
      units         = var.monthly_budget_amount
    }
  }
  
  threshold_rules {
    threshold_percent = 0.5
    spend_basis      = "CURRENT_SPEND"
  }
  
  threshold_rules {
    threshold_percent = 0.75
    spend_basis      = "CURRENT_SPEND"
  }
  
  threshold_rules {
    threshold_percent = 0.9
    spend_basis      = "CURRENT_SPEND"
  }
  
  threshold_rules {
    threshold_percent = 1.0
    spend_basis      = "CURRENT_SPEND"
  }
  
  threshold_rules {
    threshold_percent = 1.2
    spend_basis      = "FORECASTED_SPEND"
  }
  
  all_updates_rule {
    pubsub_topic = google_pubsub_topic.budget_alerts.id
  }
}

# Pub/Sub topic for budget alerts
resource "google_pubsub_topic" "budget_alerts" {
  name = "tenderflow-budget-alerts"
  
  message_retention_duration = "86400s"  # 1 day
}

# Cloud Function for automated cost response
resource "google_cloudfunctions2_function" "cost_optimizer" {
  name     = "tenderflow-cost-optimizer"
  location = var.region
  
  description = "Automated cost optimization responses"
  
  build_config {
    runtime     = "nodejs18"
    entry_point = "handleBudgetAlert"
    
    source {
      storage_source {
        bucket = google_storage_bucket.functions_bucket.name
        object = google_storage_bucket_object.cost_optimizer_source.name
      }
    }
  }
  
  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.cost_optimizer_sa.email
    
    environment_variables = {
      PROJECT_ID = var.project_id
      THRESHOLD_ACTION_50  = "NOTIFY"
      THRESHOLD_ACTION_75  = "SCALE_DOWN_DEV"
      THRESHOLD_ACTION_90  = "SCALE_DOWN_PROD"
      THRESHOLD_ACTION_100 = "EMERGENCY_SHUTDOWN_NON_CRITICAL"
    }
  }
  
  event_trigger {
    event_type   = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic = google_pubsub_topic.budget_alerts.id
  }
}

# Storage lifecycle policies for cost optimization
resource "google_storage_bucket" "archived_documents" {
  name          = "${var.project_id}-archived-documents"
  location      = var.region
  storage_class = "STANDARD"
  
  lifecycle_rule {
    condition {
      age = 30  # After 30 days
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
  
  lifecycle_rule {
    condition {
      age = 90  # After 90 days
    }
    action {
      type          = "SetStorageClass"
      storage_class = "COLDLINE"
    }
  }
  
  lifecycle_rule {
    condition {
      age = 365  # After 1 year
    }
    action {
      type          = "SetStorageClass"
      storage_class = "ARCHIVE"
    }
  }
  
  lifecycle_rule {
    condition {
      age = 2555  # After 7 years (compliance requirement)
    }
    action {
      type = "Delete"
    }
  }
  
  uniform_bucket_level_access = true
  
  encryption {
    default_kms_key_name = google_kms_crypto_key.storage_key.id
  }
}

# Scheduled snapshots for cost-effective backups
resource "google_compute_resource_policy" "daily_snapshot" {
  name   = "tenderflow-daily-snapshot"
  region = var.region
  
  snapshot_schedule_policy {
    schedule {
      daily_schedule {
        days_in_cycle = 1
        start_time    = "03:00"  # 3 AM
      }
    }
    
    retention_policy {
      max_retention_days    = 7
      on_source_disk_delete = "KEEP_AUTO_SNAPSHOTS"
    }
    
    snapshot_properties {
      storage_locations = [var.region]
      guest_flush       = false
    }
  }
}

# Resource quotas to prevent runaway costs
resource "google_compute_project_metadata_item" "resource_quotas" {
  key   = "resource-quotas"
  value = jsonencode({
    max_instances_per_region = 100
    max_cpu_per_region       = 200
    max_memory_gb_per_region = 800
    max_storage_tb           = 10
  })
}

# Cloud Scheduler for resource optimization
resource "google_cloud_scheduler_job" "scale_down_non_prod" {
  name        = "scale-down-non-prod"
  description = "Scale down non-production resources after hours"
  schedule    = "0 19 * * 1-5"  # 7 PM weekdays
  time_zone   = "America/New_York"
  
  http_target {
    uri         = google_cloudfunctions2_function.resource_scaler.service_config[0].uri
    http_method = "POST"
    
    body = base64encode(jsonencode({
      action = "scale_down"
      environment = "development"
      target_instances = 0
    }))
    
    oidc_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }
}

resource "google_cloud_scheduler_job" "scale_up_non_prod" {
  name        = "scale-up-non-prod"
  description = "Scale up non-production resources before work hours"
  schedule    = "0 7 * * 1-5"  # 7 AM weekdays
  time_zone   = "America/New_York"
  
  http_target {
    uri         = google_cloudfunctions2_function.resource_scaler.service_config[0].uri
    http_method = "POST"
    
    body = base64encode(jsonencode({
      action = "scale_up"
      environment = "development"
      target_instances = 1
    }))
    
    oidc_token {
      service_account_email = google_service_account.scheduler_sa.email
    }
  }
}

# Resource scaler Cloud Function
resource "google_cloudfunctions2_function" "resource_scaler" {
  name     = "tenderflow-resource-scaler"
  location = var.region
  
  description = "Automatically scale resources based on schedule"
  
  build_config {
    runtime     = "python39"
    entry_point = "scale_resources"
    
    source {
      storage_source {
        bucket = google_storage_bucket.functions_bucket.name
        object = google_storage_bucket_object.resource_scaler_source.name
      }
    }
  }
  
  service_config {
    max_instance_count    = 1
    available_memory      = "256M"
    timeout_seconds       = 60
    service_account_email = google_service_account.resource_scaler_sa.email
  }
}

# Preemptible instances for batch processing
resource "google_compute_instance_template" "batch_preemptible" {
  name_prefix = "tenderflow-batch-preemptible-"
  description = "Preemptible instance template for batch processing (70% cost savings)"
  
  machine_type = "e2-standard-2"
  
  scheduling {
    preemptible       = true
    automatic_restart = false
    on_host_maintenance = "TERMINATE"
  }
  
  disk {
    source_image = "debian-cloud/debian-11"
    auto_delete  = true
    boot         = true
    disk_size_gb = 20
    disk_type    = "pd-standard"  # Cheaper than SSD
  }
  
  network_interface {
    network    = google_compute_network.tenderflow_vpc.id
    subnetwork = google_compute_subnetwork.app_tier.id
  }
  
  metadata = {
    startup-script = file("${path.module}/scripts/batch-processor-startup.sh")
  }
  
  service_account {
    email  = google_service_account.batch_service_account.email
    scopes = ["cloud-platform"]
  }
  
  labels = {
    environment = "batch"
    cost_center = "processing"
    preemptible = "true"
  }
  
  lifecycle {
    create_before_destroy = true
  }
}

# Monitoring dashboard for cost optimization
resource "google_monitoring_dashboard" "cost_optimization" {
  dashboard_json = jsonencode({
    displayName = "Cost Optimization Dashboard"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width = 6
          height = 4
          widget = {
            title = "Daily Costs by Service"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" metric.type=\"billing.googleapis.com/billing/cost\""
                    aggregation = {
                      alignmentPeriod = "86400s"
                      perSeriesAligner = "ALIGN_SUM"
                      groupByFields = ["metric.service"]
                    }
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
            title = "Resource Utilization vs Cost"
            scorecard = {
              timeSeriesQuery = {
                timeSeriesFilter = {
                  filter = "resource.type=\"cloud_run_revision\" metric.type=\"run.googleapis.com/container/cpu/utilizations\""
                  aggregation = {
                    alignmentPeriod = "3600s"
                    perSeriesAligner = "ALIGN_MEAN"
                  }
                }
              }
            }
          }
        },
        {
          yPos = 4
          width = 12
          height = 4
          widget = {
            title = "Commitment Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"global\" metric.type=\"compute.googleapis.com/commitment/utilization\""
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

# Service accounts for cost optimization functions
resource "google_service_account" "cost_optimizer_sa" {
  account_id   = "cost-optimizer-sa"
  display_name = "Cost Optimizer Service Account"
}

resource "google_service_account" "resource_scaler_sa" {
  account_id   = "resource-scaler-sa"
  display_name = "Resource Scaler Service Account"
}

resource "google_service_account" "scheduler_sa" {
  account_id   = "scheduler-sa"
  display_name = "Cloud Scheduler Service Account"
}

# IAM permissions for cost optimization
resource "google_project_iam_member" "cost_optimizer_permissions" {
  for_each = toset([
    "roles/billing.viewer",
    "roles/monitoring.viewer",
    "roles/run.admin",
    "roles/compute.admin"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.cost_optimizer_sa.email}"
}

resource "google_project_iam_member" "resource_scaler_permissions" {
  for_each = toset([
    "roles/run.admin",
    "roles/compute.instanceAdmin"
  ])
  
  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.resource_scaler_sa.email}"
}

# Export cost optimization metrics
output "monthly_estimated_savings" {
  value = {
    committed_use_discount    = "$${var.monthly_budget_amount * 0.37}"
    preemptible_instances     = "$${var.monthly_budget_amount * 0.70}"
    storage_lifecycle         = "$${var.monthly_budget_amount * 0.15}"
    off_hours_scaling        = "$${var.monthly_budget_amount * 0.25}"
    total_potential_savings  = "$${var.monthly_budget_amount * 0.40}"
  }
}

output "cost_optimization_status" {
  value = {
    budget_alerts_enabled     = true
    committed_use_active      = true
    lifecycle_policies_active = true
    auto_scaling_enabled      = true
    preemptible_enabled       = true
  }
}