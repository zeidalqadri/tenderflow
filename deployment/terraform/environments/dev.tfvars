# Development Environment Configuration
# TenderFlow Infrastructure - Development Environment

# Project Configuration
project_id = "tensurv-dev"
region     = "us-central1"
zone       = "us-central1-a"
environment = "dev"

# Network Configuration
vpc_network_name = "tenderflow-dev-vpc"
subnet_name      = "tenderflow-dev-subnet"
subnet_cidr      = "10.0.0.0/24"

# Database Configuration
database_instance_name = "tenderflow-dev-db"
database_tier         = "db-f1-micro"
database_disk_size    = 20
backup_enabled        = false
high_availability     = false

# Redis Configuration
redis_instance_name   = "tenderflow-dev-redis"
redis_memory_size     = 1
redis_tier           = "BASIC"
redis_version        = "REDIS_7_0"

# Cloud Run Configuration
api_service_name      = "tenderflow-dev-api"
websocket_service_name = "tenderflow-dev-websocket"
api_max_instances     = 10
websocket_max_instances = 10
api_memory_limit      = "512Mi"
websocket_memory_limit = "512Mi"

# Storage Configuration
documents_bucket_name = "tenderflow-dev-documents"
backups_bucket_name   = "tenderflow-dev-backups"
audit_bucket_name     = "tensurv-dev-audit-logs"

# Monitoring and Alerting
notification_email    = "dev-alerts@tenderflow.app"
uptime_check_enabled = true
custom_metrics_enabled = false

# Security Configuration
ssl_certificate_domain = "dev.tenderflow.app"
enable_audit_logs     = true
enable_cloud_armor    = false

# Cost Optimization (Development)
enable_preemptible_instances = true
auto_scaling_enabled = false
data_retention_days = 30

# Feature Flags
enable_advanced_monitoring = false
enable_disaster_recovery = false
enable_multi_region = false