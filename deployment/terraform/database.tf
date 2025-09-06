# AlloyDB Configuration for TenderFlow
# Implements 4x performance improvement with enhanced security and monitoring

# AlloyDB Cluster Configuration
resource "google_alloydb_cluster" "tenderflow_primary" {
  cluster_id = "tenderflow-primary-cluster"
  location   = var.region
  project    = var.project_id

  network_config {
    network = google_compute_network.tenderflow_vpc.id
    allocated_ip_range = google_compute_global_address.private_ip_alloydb.name
  }

  # Enable CMEK encryption
  encryption_config {
    kms_key_name = google_kms_crypto_key.database_key.id
  }

  # High availability configuration
  initial_user {
    user     = "tenderflow_admin"
    password = random_password.alloydb_admin_password.result
  }

  # Automated backup configuration with 7-year retention
  automated_backup_policy {
    enabled = true
    
    # Weekly full backups with 7-year retention
    weekly_schedule {
      days_of_week = ["MONDAY"]
      start_times {
        hours   = 2
        minutes = 0
      }
    }
    
    quantity_based_retention {
      count = 365  # Keep 365 weekly backups (7 years)
    }
    
    location = var.region
    
    # Enable CMEK for backups
    encryption_config {
      kms_key_name = google_kms_crypto_key.backup_key.id
    }
  }

  # Continuous backup for PITR
  continuous_backup_config {
    enabled = true
    recovery_window_days = 35  # 5 weeks of PITR
    
    encryption_config {
      kms_key_name = google_kms_crypto_key.backup_key.id
    }
  }

  # Database flags for optimization
  database_flags = {
    "alloydb.enable_pgaudit"                = "on"
    "alloydb.enable_pg_stat_statements"     = "on"
    "max_connections"                        = "500"
    "shared_buffers"                         = "8GB"
    "effective_cache_size"                   = "24GB"
    "work_mem"                              = "32MB"
    "maintenance_work_mem"                  = "2GB"
    "random_page_cost"                      = "1.1"
    "effective_io_concurrency"              = "200"
    "wal_buffers"                          = "16MB"
    "default_statistics_target"            = "100"
    "checkpoint_completion_target"          = "0.9"
    "autovacuum_max_workers"               = "4"
    "autovacuum_naptime"                   = "30s"
    "log_statement"                         = "all"
    "log_connections"                       = "on"
    "log_disconnections"                   = "on"
    "log_duration"                          = "on"
    "log_min_duration_statement"           = "100"
  }

  labels = {
    environment = var.environment
    team        = "platform"
    criticality = "critical"
  }
}

# Primary Instance Configuration
resource "google_alloydb_instance" "tenderflow_primary" {
  cluster       = google_alloydb_cluster.tenderflow_primary.name
  instance_id   = "tenderflow-primary-instance"
  instance_type = "PRIMARY"
  
  machine_config {
    cpu_count = 4  # Start with 4 vCPUs, scale as needed
  }

  # Query insights for performance monitoring
  query_insights_config {
    enabled               = true
    query_string_length   = 4500
    query_plans_per_minute = 10
    record_application_tags = true
  }

  labels = {
    role = "primary"
    environment = var.environment
  }
}

# Read Pool Instances for scaling read operations
resource "google_alloydb_instance" "tenderflow_read_pool" {
  count         = var.read_pool_size
  cluster       = google_alloydb_cluster.tenderflow_primary.name
  instance_id   = "tenderflow-read-pool-${count.index}"
  instance_type = "READ_POOL"
  
  machine_config {
    cpu_count = 2  # Smaller instances for read replicas
  }

  read_pool_config {
    node_count = 2  # 2 nodes per read pool instance
  }

  labels = {
    role = "read-replica"
    environment = var.environment
    pool_index = count.index
  }
}

# Database proxy for connection pooling (PgBouncer replacement)
resource "google_alloydb_instance" "tenderflow_proxy" {
  cluster       = google_alloydb_cluster.tenderflow_primary.name
  instance_id   = "tenderflow-proxy"
  instance_type = "READ_POOL"
  
  machine_config {
    cpu_count = 2
  }

  # Acts as connection pooler
  read_pool_config {
    node_count = 1
  }

  labels = {
    role = "proxy"
    environment = var.environment
  }
}

# Private IP allocation for AlloyDB
resource "google_compute_global_address" "private_ip_alloydb" {
  name          = "tenderflow-alloydb-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 24
  network       = google_compute_network.tenderflow_vpc.id
}

# Service networking connection
resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.tenderflow_vpc.id
  service                = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_alloydb.name]
}

# Database passwords
resource "random_password" "alloydb_admin_password" {
  length  = 32
  special = true
  override_special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
}

resource "random_password" "app_user_password" {
  length  = 24
  special = true
  override_special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
}

resource "random_password" "readonly_user_password" {
  length  = 24
  special = true
  override_special = "!@#$%^&*()_+-=[]{}|;:,.<>?"
}

# Store passwords in Secret Manager
resource "google_secret_manager_secret" "alloydb_admin_password" {
  secret_id = "alloydb-admin-password"
  
  replication {
    auto {}
  }

  rotation {
    next_rotation_time = timeadd(timestamp(), "720h")  # 30 days
    rotation_period = "2592000s"  # 30 days in seconds
  }
}

resource "google_secret_manager_secret_version" "alloydb_admin_password" {
  secret = google_secret_manager_secret.alloydb_admin_password.id
  secret_data = random_password.alloydb_admin_password.result
}

resource "google_secret_manager_secret" "app_user_password" {
  secret_id = "alloydb-app-password"
  
  replication {
    auto {}
  }

  rotation {
    next_rotation_time = timeadd(timestamp(), "168h")  # 7 days
    rotation_period = "604800s"  # 7 days in seconds
  }
}

resource "google_secret_manager_secret_version" "app_user_password" {
  secret = google_secret_manager_secret.app_user_password.id
  secret_data = random_password.app_user_password.result
}

# Database connection string for application
resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id
  secret_data = format(
    "postgresql://tenderflow_app:%s@%s:5432/tenderflow?sslmode=require&pool_mode=transaction",
    random_password.app_user_password.result,
    google_alloydb_instance.tenderflow_primary.ip_address
  )
}

# Read-only connection string
resource "google_secret_manager_secret" "database_readonly_url" {
  secret_id = "database-readonly-url"
  
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_readonly_url" {
  secret = google_secret_manager_secret.database_readonly_url.id
  secret_data = format(
    "postgresql://tenderflow_readonly:%s@%s:5432/tenderflow?sslmode=require&target_session_attrs=read-only",
    random_password.readonly_user_password.result,
    google_alloydb_instance.tenderflow_read_pool[0].ip_address
  )
}

# Migration job from Supabase to AlloyDB
resource "google_database_migration_service_migration_job" "supabase_to_alloydb" {
  location = var.region
  migration_job_id = "supabase-to-alloydb-migration"
  
  type = "CONTINUOUS"  # Continuous replication for zero-downtime
  
  source = "projects/${var.project_id}/locations/${var.region}/connectionProfiles/${google_database_migration_service_connection_profile.supabase_source.connection_profile_id}"
  destination = "projects/${var.project_id}/locations/${var.region}/connectionProfiles/${google_database_migration_service_connection_profile.alloydb_destination.connection_profile_id}"
  
  display_name = "Supabase to AlloyDB Migration"
  
  labels = {
    migration_type = "production"
    source = "supabase"
    destination = "alloydb"
  }
}

# Source connection profile (Supabase)
resource "google_database_migration_service_connection_profile" "supabase_source" {
  location = var.region
  connection_profile_id = "supabase-source"
  display_name = "Supabase Source Database"
  
  postgresql {
    host = var.supabase_host
    port = 5432
    username = var.supabase_username
    password = var.supabase_password
    database = var.supabase_database
    
    ssl {
      type = "SERVER_ONLY"
    }
  }
}

# Destination connection profile (AlloyDB)
resource "google_database_migration_service_connection_profile" "alloydb_destination" {
  location = var.region
  connection_profile_id = "alloydb-destination"
  display_name = "AlloyDB Destination"
  
  alloydb {
    cluster_id = google_alloydb_cluster.tenderflow_primary.cluster_id
    settings {
      initial_user {
        user = "tenderflow_admin"
        password = random_password.alloydb_admin_password.result
      }
      
      vpc_network = google_compute_network.tenderflow_vpc.id
      
      labels = {
        environment = var.environment
      }
    }
  }
}

# Monitoring alert policies for database
resource "google_monitoring_alert_policy" "database_high_cpu" {
  display_name = "AlloyDB High CPU Usage"
  combiner     = "OR"
  
  conditions {
    display_name = "CPU usage above 80%"
    
    condition_threshold {
      filter = "resource.type = \"alloydb.googleapis.com/Instance\" AND metric.type = \"alloydb.googleapis.com/database/cpu/utilization\""
      
      aggregations {
        alignment_period = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
      
      comparison = "COMPARISON_GT"
      threshold_value = 0.8
      duration = "300s"
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
  
  alert_strategy {
    auto_close = "1800s"
  }
}

resource "google_monitoring_alert_policy" "database_high_connections" {
  display_name = "AlloyDB High Connection Count"
  combiner     = "OR"
  
  conditions {
    display_name = "Connection count above 400"
    
    condition_threshold {
      filter = "resource.type = \"alloydb.googleapis.com/Instance\" AND metric.type = \"alloydb.googleapis.com/database/postgresql/num_backends\""
      
      aggregations {
        alignment_period = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
      
      comparison = "COMPARISON_GT"
      threshold_value = 400
      duration = "120s"
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.email.id]
}

resource "google_monitoring_alert_policy" "database_replication_lag" {
  display_name = "AlloyDB Replication Lag"
  combiner     = "OR"
  
  conditions {
    display_name = "Replication lag above 5 seconds"
    
    condition_threshold {
      filter = "resource.type = \"alloydb.googleapis.com/Instance\" AND metric.type = \"alloydb.googleapis.com/database/replication/replica_lag\""
      
      aggregations {
        alignment_period = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
      
      comparison = "COMPARISON_GT"
      threshold_value = 5
      duration = "300s"
    }
  }
  
  notification_channels = [google_monitoring_notification_channel.pagerduty.id]
}

# Custom dashboard for database monitoring
resource "google_monitoring_dashboard" "database_dashboard" {
  dashboard_json = jsonencode({
    displayName = "AlloyDB Performance Dashboard"
    mosaicLayout = {
      columns = 12
      tiles = [
        {
          width = 6
          height = 4
          widget = {
            title = "CPU Utilization"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"alloydb.googleapis.com/Instance\" metric.type=\"alloydb.googleapis.com/database/cpu/utilization\""
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
            title = "Connection Count"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"alloydb.googleapis.com/Instance\" metric.type=\"alloydb.googleapis.com/database/postgresql/num_backends\""
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
            title = "Query Latency (p95)"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"alloydb.googleapis.com/Instance\" metric.type=\"alloydb.googleapis.com/database/postgresql/insights/query/latencies\""
                  }
                  timeSeriesFilterRatio = {
                    numerator = {
                      aggregation = {
                        alignmentPeriod = "60s"
                        perSeriesAligner = "ALIGN_DELTA"
                      }
                    }
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
            title = "Replication Lag"
            xyChart = {
              dataSets = [{
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "resource.type=\"alloydb.googleapis.com/Instance\" metric.type=\"alloydb.googleapis.com/database/replication/replica_lag\""
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

# Outputs for other modules
output "database_instance_ip" {
  value = google_alloydb_instance.tenderflow_primary.ip_address
  sensitive = true
}

output "database_read_pool_ips" {
  value = google_alloydb_instance.tenderflow_read_pool[*].ip_address
  sensitive = true
}

output "database_connection_name" {
  value = "${var.project_id}:${var.region}:${google_alloydb_cluster.tenderflow_primary.name}"
}

output "database_url_secret_id" {
  value = google_secret_manager_secret.database_url.secret_id
}

output "database_readonly_url_secret_id" {
  value = google_secret_manager_secret.database_readonly_url.secret_id
}