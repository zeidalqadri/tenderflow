# Staging Environment Configuration
# TenderFlow Infrastructure - Staging Environment (Pre-Production Testing)

# Project Configuration
project_id = "tensurv-staging"
region     = "us-central1"
zone       = "us-central1-a"
environment = "staging"

# Network Configuration
vpc_network_name = "tenderflow-staging-vpc"
subnet_name      = "tenderflow-staging-subnet"
subnet_cidr      = "10.1.0.0/24"

# Database Configuration
database_instance_name = "tenderflow-staging-db"
database_tier         = "db-n1-standard-2"
database_disk_size    = 100
backup_enabled        = true
high_availability     = true

# Redis Configuration
redis_instance_name   = "tenderflow-staging-redis"
redis_memory_size     = 4
redis_tier           = "STANDARD_HA"
redis_version        = "REDIS_7_0"

# Cloud Run Configuration
api_service_name      = "tenderflow-staging-api"
websocket_service_name = "tenderflow-staging-websocket"
api_max_instances     = 50
websocket_max_instances = 50
api_memory_limit      = "1Gi"
websocket_memory_limit = "1Gi"

# Storage Configuration
documents_bucket_name = "tenderflow-staging-documents"
backups_bucket_name   = "tenderflow-staging-backups"
audit_bucket_name     = "tensurv-staging-audit-logs"

# Monitoring and Alerting
notification_email    = "staging-alerts@tenderflow.app"
uptime_check_enabled = true
custom_metrics_enabled = true

# Security Configuration
ssl_certificate_domain = "staging.tenderflow.app"
enable_audit_logs     = true
enable_cloud_armor    = true

# Performance (Staging - Production-like)
enable_preemptible_instances = false
auto_scaling_enabled = true
data_retention_days = 90

# Feature Flags
enable_advanced_monitoring = true
enable_disaster_recovery = false
enable_multi_region = false

# Load Testing Configuration
read_pool_size = 2
max_connections = 200