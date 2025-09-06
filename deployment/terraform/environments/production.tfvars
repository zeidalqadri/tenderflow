# Production Environment Configuration
# TenderFlow Infrastructure - Production Environment (Government-Grade)

# Project Configuration
project_id = "tensurv"
region     = "us-central1"
zone       = "us-central1-a"
environment = "production"

# Network Configuration  
vpc_network_name = "tenderflow-prod-vpc"
subnet_name      = "tenderflow-prod-subnet"
subnet_cidr      = "10.2.0.0/24"

# Database Configuration - AlloyDB for Government Requirements
database_instance_name = "tenderflow-primary-cluster"
database_tier         = "db-custom-4-16384"  # 4 vCPU, 16GB RAM
database_disk_size    = 500
backup_enabled        = true
high_availability     = true
read_pool_size        = 3

# Redis Configuration - High Availability for 10k+ Users
redis_instance_name   = "websocket-cluster"
redis_memory_size     = 16
redis_tier           = "STANDARD_HA"
redis_version        = "REDIS_7_0"

# Cloud Run Configuration - Production Scale
api_service_name      = "tenderflow-api"
websocket_service_name = "tenderflow-websocket"
api_max_instances     = 1000
websocket_max_instances = 1000
api_memory_limit      = "2Gi"
websocket_memory_limit = "2Gi"
api_cpu_limit        = "2"
websocket_cpu_limit  = "2"

# Storage Configuration - Government Compliance
documents_bucket_name = "tenderflow-documents-tensurv"
thumbnails_bucket_name = "tenderflow-thumbnails-tensurv"
backups_bucket_name   = "tenderflow-backups-tensurv"
audit_bucket_name     = "tensurv-audit-logs"

# Monitoring and Alerting - 99.9% SLA
notification_email    = "production-alerts@tenderflow.app"
pagerduty_integration_key = "" # To be set via Secret Manager
uptime_check_enabled = true
custom_metrics_enabled = true
slo_target = 0.999  # 99.9% availability

# Security Configuration - Government Grade
ssl_certificate_domain = "api.tenderflow.app"
websocket_ssl_domain = "ws.tenderflow.app"
enable_audit_logs     = true
enable_cloud_armor    = true
enable_waf_rules     = true

# Performance Configuration - 10k+ Users
enable_preemptible_instances = false
auto_scaling_enabled = true
data_retention_days = 2555  # 7 years government requirement
max_connections = 300

# Government Compliance Features
enable_advanced_monitoring = true
enable_disaster_recovery = true
enable_multi_region = false  # Single region for compliance
enable_encryption_at_rest = true
enable_cmek_encryption = true

# Supabase Migration Configuration
supabase_host = "" # To be set via Secret Manager
supabase_username = "" # To be set via Secret Manager
supabase_password = "" # To be set via Secret Manager
supabase_database = "" # To be set via Secret Manager

# Cost Management
budget_amount = 2000  # Monthly budget limit in USD
enable_cost_alerts = true