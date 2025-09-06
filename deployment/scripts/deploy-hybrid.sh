#!/bin/bash

# TenderFlow Hybrid Deployment Script
# Deploys API/Frontend to GCP and configures local scraper

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ID=${GCP_PROJECT_ID:-""}
REGION=${GCP_REGION:-"us-central1"}
ENVIRONMENT=${ENVIRONMENT:-"production"}

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check gcloud
    if ! command -v gcloud &> /dev/null; then
        print_error "gcloud CLI not found. Please install Google Cloud SDK."
        exit 1
    fi
    
    # Check terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform not found. Please install Terraform."
        exit 1
    fi
    
    # Check docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker not found. Please install Docker."
        exit 1
    fi
    
    # Check project ID
    if [ -z "$PROJECT_ID" ]; then
        print_error "GCP_PROJECT_ID environment variable not set."
        exit 1
    fi
    
    print_status "Prerequisites check completed."
}

# Deploy infrastructure with Terraform
deploy_infrastructure() {
    print_status "Deploying GCP infrastructure with Terraform..."
    
    cd deployment/terraform
    
    # Initialize Terraform
    terraform init
    
    # Plan deployment
    terraform plan -var="project_id=$PROJECT_ID" -var="region=$REGION" -var="environment=$ENVIRONMENT" -out=tfplan
    
    # Apply infrastructure
    terraform apply tfplan
    
    # Export outputs
    export API_IP=$(terraform output -raw api_ip)
    export DB_CONNECTION=$(terraform output -raw database_connection_name)
    export REDIS_HOST=$(terraform output -raw redis_host)
    export STORAGE_BUCKET=$(terraform output -raw storage_bucket)
    
    cd ../..
    
    print_status "Infrastructure deployment completed."
}

# Build and push Docker images
build_and_push_images() {
    print_status "Building and pushing Docker images..."
    
    # Configure Docker for GCR
    gcloud auth configure-docker gcr.io
    
    # Build API image
    docker build -t gcr.io/$PROJECT_ID/tenderflow-api:latest -f apps/api/Dockerfile .
    docker push gcr.io/$PROJECT_ID/tenderflow-api:latest
    
    # Build Frontend image
    docker build -t gcr.io/$PROJECT_ID/tenderflow-web:latest \
        --build-arg NEXT_PUBLIC_API_URL=https://api.tenderflow.app \
        -f apps/web/Dockerfile .
    docker push gcr.io/$PROJECT_ID/tenderflow-web:latest
    
    print_status "Docker images built and pushed."
}

# Deploy to Cloud Run
deploy_cloud_run() {
    print_status "Deploying services to Cloud Run..."
    
    # Deploy API
    gcloud run deploy tenderflow-api \
        --image gcr.io/$PROJECT_ID/tenderflow-api:latest \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --add-cloudsql-instances $DB_CONNECTION \
        --set-env-vars NODE_ENV=production,GCP_PROJECT_ID=$PROJECT_ID \
        --set-secrets DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest,JWT_REFRESH_SECRET=jwt-refresh-secret:latest \
        --min-instances 1 \
        --max-instances 100 \
        --cpu 2 \
        --memory 4Gi \
        --timeout 60 \
        --concurrency 250
    
    # Get API URL
    API_URL=$(gcloud run services describe tenderflow-api --region=$REGION --format='value(status.url)')
    
    # Deploy Frontend
    gcloud run deploy tenderflow-web \
        --image gcr.io/$PROJECT_ID/tenderflow-web:latest \
        --region $REGION \
        --platform managed \
        --allow-unauthenticated \
        --set-env-vars NEXT_PUBLIC_API_URL=$API_URL \
        --min-instances 1 \
        --max-instances 50 \
        --cpu 1 \
        --memory 2Gi \
        --timeout 60 \
        --concurrency 80
    
    print_status "Cloud Run deployment completed."
}

# Configure monitoring
setup_monitoring() {
    print_status "Setting up monitoring..."
    
    # Create monitoring dashboards
    gcloud monitoring dashboards create --config-from-file=monitoring/dashboards/ingestion-pipeline.json
    
    # Create alert policies
    for alert_file in monitoring/alerts/*.yaml; do
        # Replace PROJECT_ID placeholder
        sed "s/PROJECT_ID/$PROJECT_ID/g" $alert_file > /tmp/alert_temp.yaml
        gcloud alpha monitoring policies create --policy-from-file=/tmp/alert_temp.yaml
    done
    
    print_status "Monitoring setup completed."
}

# Setup local scraper
setup_local_scraper() {
    print_status "Setting up local scraper..."
    
    # Create scraper service account key
    gcloud iam service-accounts keys create scraper-key.json \
        --iam-account=tenderflow-scraper@$PROJECT_ID.iam.gserviceaccount.com
    
    # Create .env file for scraper
    cat > scraper/.env << EOF
# GCP Configuration
GCP_PROJECT_ID=$PROJECT_ID
GOOGLE_APPLICATION_CREDENTIALS=./scraper-key.json
TENDERFLOW_API_URL=$API_URL
TENDERFLOW_SCRAPER_ID=local-scraper-$(hostname)

# Scraper Configuration
SCRAPE_INTERVAL_MINUTES=30
MAX_CONCURRENT_SCRAPERS=3
RETRY_MAX_ATTEMPTS=5
CIRCUIT_BREAKER_THRESHOLD=5

# Local Storage
DATABASE_URL=postgresql://scraper:scraper_local_dev@localhost:5433/scraper_queue
REDIS_URL=redis://localhost:6380

# Monitoring
ENABLE_MONITORING=true
LOG_LEVEL=INFO
EOF
    
    # Move service account key
    mv scraper-key.json scraper/
    
    # Start local services
    cd deployment
    docker-compose -f docker-compose.hybrid.yml up -d scraper-db scraper-redis prometheus grafana
    
    print_status "Waiting for local services to start..."
    sleep 10
    
    # Initialize scraper database
    docker-compose -f docker-compose.hybrid.yml exec -T scraper-db psql -U scraper -d scraper_queue << EOF
CREATE TABLE IF NOT EXISTS upload_jobs (
    id TEXT PRIMARY KEY,
    file_path TEXT NOT NULL,
    batch_id TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    next_retry_at TIMESTAMP,
    error_message TEXT,
    metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_status ON upload_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch ON upload_jobs(batch_id);
EOF
    
    cd ..
    
    print_status "Local scraper setup completed."
}

# Generate scraper authentication token
generate_scraper_token() {
    print_status "Generating scraper authentication token..."
    
    # Create JWT token for scraper
    SCRAPER_TOKEN=$(gcloud run services describe tenderflow-api --region=$REGION --format='value(status.url)' | \
        xargs -I {} curl -X POST {}/api/auth/scraper-token \
        -H "Content-Type: application/json" \
        -d "{\"scraperId\": \"local-scraper-$(hostname)\", \"type\": \"scraper\"}" | \
        jq -r '.token')
    
    # Save token to scraper config
    echo "TENDERFLOW_API_KEY=$SCRAPER_TOKEN" >> scraper/.env
    
    print_status "Scraper token generated and saved."
}

# Start local scraper
start_scraper() {
    print_status "Starting local scraper..."
    
    cd scraper
    
    # Install Python dependencies
    pip install -r requirements.txt
    pip install -r requirements-monitoring.txt
    
    # Start scraper with monitoring
    python main.py --enable-monitoring --project-id $PROJECT_ID &
    
    cd ..
    
    print_status "Local scraper started."
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check API health
    API_HEALTH=$(curl -s $API_URL/api/ingestion/health | jq -r '.status')
    if [ "$API_HEALTH" = "healthy" ]; then
        print_status "API health check: ✓"
    else
        print_warning "API health check failed"
    fi
    
    # Check scraper health
    SCRAPER_HEALTH=$(curl -s http://localhost:8080/health | jq -r '.status')
    if [ "$SCRAPER_HEALTH" = "healthy" ]; then
        print_status "Scraper health check: ✓"
    else
        print_warning "Scraper health check failed"
    fi
    
    # Check monitoring
    GRAFANA_STATUS=$(curl -s http://localhost:3001/api/health | jq -r '.database')
    if [ "$GRAFANA_STATUS" = "ok" ]; then
        print_status "Monitoring health check: ✓"
    else
        print_warning "Monitoring health check failed"
    fi
    
    print_status "Deployment verification completed."
}

# Print deployment summary
print_summary() {
    echo ""
    echo "========================================="
    echo "TenderFlow Hybrid Deployment Complete"
    echo "========================================="
    echo ""
    echo "GCP Services:"
    echo "  API URL: $API_URL"
    echo "  Frontend URL: $(gcloud run services describe tenderflow-web --region=$REGION --format='value(status.url)')"
    echo "  Project ID: $PROJECT_ID"
    echo "  Region: $REGION"
    echo ""
    echo "Local Services:"
    echo "  Scraper Status: Running"
    echo "  Prometheus: http://localhost:9090"
    echo "  Grafana: http://localhost:3001 (admin/admin)"
    echo ""
    echo "Next Steps:"
    echo "  1. Configure DNS to point to the Cloud Run services"
    echo "  2. Set up notification channels for alerts"
    echo "  3. Review and customize monitoring dashboards"
    echo "  4. Test end-to-end data flow"
    echo ""
}

# Main execution
main() {
    print_status "Starting TenderFlow hybrid deployment..."
    
    check_prerequisites
    deploy_infrastructure
    build_and_push_images
    deploy_cloud_run
    setup_monitoring
    setup_local_scraper
    generate_scraper_token
    start_scraper
    verify_deployment
    print_summary
    
    print_status "Deployment completed successfully!"
}

# Run main function
main "$@"