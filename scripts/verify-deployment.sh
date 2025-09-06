#!/bin/bash

# TenderFlow Deployment Verification Script
# Checks all components of the hybrid deployment

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "======================================"
echo "TenderFlow Deployment Verification"
echo "======================================"
echo ""

# Track overall status
FAILED_CHECKS=0

# Function to check status
check_status() {
    local name=$1
    local command=$2
    
    echo -n "Checking $name... "
    if eval $command > /dev/null 2>&1; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

# Function to check file exists
check_file() {
    local name=$1
    local file=$2
    
    echo -n "Checking $name... "
    if [ -f "$file" ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗ (missing)${NC}"
        FAILED_CHECKS=$((FAILED_CHECKS + 1))
    fi
}

echo "1. Checking Core Files"
echo "----------------------"
check_file "Cloud Uploader" "scraper/cloud_uploader.py"
check_file "Monitoring Module" "scraper/monitoring.py"
check_file "Scraper Main" "scraper/main.py"
check_file "Scraper Dockerfile" "scraper/Dockerfile"
check_file "Requirements" "scraper/requirements.txt"
check_file "Ingestion Routes" "apps/api/src/routes/ingestion.ts"
check_file "Monitoring Plugin" "apps/api/src/plugins/monitoring.ts"
echo ""

echo "2. Checking Deployment Files"
echo "----------------------------"
check_file "Docker Compose" "deployment/docker-compose.hybrid.yml"
check_file "Cloud Build" "deployment/gcp/cloudbuild.yaml"
check_file "Terraform Config" "deployment/terraform/main.tf"
check_file "Deploy Script" "deployment/scripts/deploy-hybrid.sh"
echo ""

echo "3. Checking Documentation"
echo "-------------------------"
check_file "Architecture Doc" "HYBRID-ARCHITECTURE.md"
check_file "GCP Plan" "GCP-DEPLOYMENT-PLAN.md"
check_file "Runbook" "docs/runbooks/ingestion-pipeline.md"
echo ""

echo "4. Checking Monitoring Config"
echo "-----------------------------"
check_file "Dashboard Config" "monitoring/dashboards/ingestion-pipeline.json"
check_file "Alert Policies" "monitoring/alerts/ingestion-alerts.yaml"
echo ""

echo "5. Checking Environment"
echo "-----------------------"
# Check for required environment variables
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "GCP_PROJECT_ID... ${YELLOW}⚠ (not set)${NC}"
else
    echo -e "GCP_PROJECT_ID... ${GREEN}✓ ($GCP_PROJECT_ID)${NC}"
fi

if [ -z "$TENDERFLOW_API_URL" ]; then
    echo -e "TENDERFLOW_API_URL... ${YELLOW}⚠ (using default)${NC}"
else
    echo -e "TENDERFLOW_API_URL... ${GREEN}✓ ($TENDERFLOW_API_URL)${NC}"
fi
echo ""

echo "6. Checking Dependencies"
echo "------------------------"
check_status "Docker" "docker --version"
check_status "Python 3" "python3 --version"
check_status "Node.js" "node --version"
check_status "npm" "npm --version"
echo ""

echo "7. Checking Local Services (if running)"
echo "---------------------------------------"
# Check if local services are running
if docker ps | grep -q tenderflow-scraper-db; then
    echo -e "PostgreSQL (scraper)... ${GREEN}✓ (running)${NC}"
else
    echo -e "PostgreSQL (scraper)... ${YELLOW}⚠ (not running)${NC}"
fi

if docker ps | grep -q tenderflow-scraper-redis; then
    echo -e "Redis (scraper)... ${GREEN}✓ (running)${NC}"
else
    echo -e "Redis (scraper)... ${YELLOW}⚠ (not running)${NC}"
fi

if docker ps | grep -q tenderflow-prometheus; then
    echo -e "Prometheus... ${GREEN}✓ (running)${NC}"
else
    echo -e "Prometheus... ${YELLOW}⚠ (not running)${NC}"
fi

if docker ps | grep -q tenderflow-grafana; then
    echo -e "Grafana... ${GREEN}✓ (running)${NC}"
else
    echo -e "Grafana... ${YELLOW}⚠ (not running)${NC}"
fi
echo ""

echo "8. Testing Connectivity (if services running)"
echo "---------------------------------------------"
# Test local endpoints if available
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "Scraper Health Endpoint... ${GREEN}✓${NC}"
else
    echo -e "Scraper Health Endpoint... ${YELLOW}⚠ (not accessible)${NC}"
fi

if curl -s http://localhost:9090/-/healthy > /dev/null 2>&1; then
    echo -e "Prometheus... ${GREEN}✓${NC}"
else
    echo -e "Prometheus... ${YELLOW}⚠ (not accessible)${NC}"
fi

if curl -s http://localhost:3001/api/health > /dev/null 2>&1; then
    echo -e "Grafana... ${GREEN}✓${NC}"
else
    echo -e "Grafana... ${YELLOW}⚠ (not accessible)${NC}"
fi
echo ""

echo "======================================"
echo "Verification Summary"
echo "======================================"

if [ $FAILED_CHECKS -eq 0 ]; then
    echo -e "${GREEN}✓ All critical checks passed!${NC}"
    echo ""
    echo "Your TenderFlow hybrid deployment is ready."
    echo ""
    echo "Next steps:"
    echo "1. Set environment variables:"
    echo "   export GCP_PROJECT_ID=your-project-id"
    echo "   export TENDERFLOW_API_URL=https://api.tenderflow.app"
    echo ""
    echo "2. Deploy to GCP:"
    echo "   ./deployment/scripts/deploy-hybrid.sh"
    echo ""
    echo "3. Start local scraper:"
    echo "   cd deployment"
    echo "   docker-compose -f docker-compose.hybrid.yml up -d"
    echo ""
    echo "4. Monitor deployment:"
    echo "   - Grafana: http://localhost:3001"
    echo "   - Prometheus: http://localhost:9090"
    echo "   - Scraper Health: http://localhost:8080/health"
else
    echo -e "${RED}✗ $FAILED_CHECKS checks failed${NC}"
    echo ""
    echo "Please review the failed checks above and ensure all"
    echo "required files are present before deploying."
fi

echo ""
echo "Documentation:"
echo "- Architecture: HYBRID-ARCHITECTURE.md"
echo "- Deployment Plan: GCP-DEPLOYMENT-PLAN.md"
echo "- Runbook: docs/runbooks/ingestion-pipeline.md"
echo ""

exit $FAILED_CHECKS