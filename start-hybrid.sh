#!/bin/bash

# TenderFlow Hybrid System Startup Script
# Quick start for local development and testing

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}================================${NC}"
echo -e "${BLUE}TenderFlow Hybrid System Startup${NC}"
echo -e "${BLUE}================================${NC}"
echo ""

# Check environment
if [ -z "$GCP_PROJECT_ID" ]; then
    echo -e "${YELLOW}Warning: GCP_PROJECT_ID not set. Using local mode.${NC}"
    export GCP_PROJECT_ID="local-development"
fi

# Function to wait for service
wait_for_service() {
    local name=$1
    local url=$2
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for $name"
    while [ $attempt -le $max_attempts ]; do
        if curl -s $url > /dev/null 2>&1; then
            echo -e " ${GREEN}✓${NC}"
            return 0
        fi
        echo -n "."
        sleep 2
        attempt=$((attempt + 1))
    done
    echo -e " ${YELLOW}timeout${NC}"
    return 1
}

# Start local infrastructure
echo -e "${BLUE}Starting local infrastructure...${NC}"
cd deployment
docker-compose -f docker-compose.hybrid.yml up -d scraper-db scraper-redis prometheus grafana
cd ..

# Wait for services
wait_for_service "PostgreSQL" "localhost:5433"
wait_for_service "Redis" "localhost:6380"
wait_for_service "Prometheus" "localhost:9090/-/healthy"
wait_for_service "Grafana" "localhost:3001/api/health"

# Initialize scraper database
echo -e "${BLUE}Initializing scraper database...${NC}"
docker exec -i tenderflow-scraper-db psql -U scraper -d scraper_queue << EOF > /dev/null 2>&1 || true
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
echo -e "Database initialized ${GREEN}✓${NC}"

# Start API server (if not in GCP mode)
if [ "$1" != "--gcp" ]; then
    echo -e "${BLUE}Starting local API server...${NC}"
    cd apps/api
    if [ ! -d "node_modules" ]; then
        echo "Installing API dependencies..."
        npm install
    fi
    
    # Start API in background
    DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tenderflow_dev" \
    DISABLE_AUTH=true \
    PORT=3457 \
    npm run dev > /tmp/api.log 2>&1 &
    API_PID=$!
    cd ../..
    
    wait_for_service "API" "localhost:3457/api/ingestion/health"
    
    echo -e "API server started (PID: $API_PID) ${GREEN}✓${NC}"
fi

# Create scraper environment file
echo -e "${BLUE}Configuring scraper...${NC}"
cat > scraper/.env << EOF
# GCP Configuration
GCP_PROJECT_ID=${GCP_PROJECT_ID}
TENDERFLOW_API_URL=${TENDERFLOW_API_URL:-http://localhost:3457}
TENDERFLOW_SCRAPER_ID=local-scraper-$(hostname)

# Local Database
DATABASE_URL=postgresql://scraper:scraper_local_dev@localhost:5433/scraper_queue
REDIS_URL=redis://localhost:6380

# Scraper Configuration
SCRAPE_INTERVAL_MINUTES=30
MAX_CONCURRENT_SCRAPERS=3
RETRY_MAX_ATTEMPTS=5
CIRCUIT_BREAKER_THRESHOLD=5

# Monitoring
ENABLE_MONITORING=false
LOG_LEVEL=INFO
EOF

# Install Python dependencies
echo -e "${BLUE}Installing Python dependencies...${NC}"
cd scraper
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -q -r requirements.txt
pip install -q -r requirements-monitoring.txt

# Start scraper
echo -e "${BLUE}Starting scraper...${NC}"
python main.py --enable-monitoring > /tmp/scraper.log 2>&1 &
SCRAPER_PID=$!
deactivate
cd ..

wait_for_service "Scraper" "localhost:8080/health"

# Print status
echo ""
echo -e "${GREEN}================================${NC}"
echo -e "${GREEN}System Started Successfully!${NC}"
echo -e "${GREEN}================================${NC}"
echo ""
echo "Services running:"
echo "  • PostgreSQL (scraper): localhost:5433"
echo "  • Redis: localhost:6380"
echo "  • Prometheus: http://localhost:9090"
echo "  • Grafana: http://localhost:3001 (admin/admin)"
echo "  • Scraper Health: http://localhost:8080/health"
if [ "$1" != "--gcp" ]; then
    echo "  • API: http://localhost:3457"
fi
echo ""
echo "Logs:"
echo "  • API: tail -f /tmp/api.log"
echo "  • Scraper: tail -f /tmp/scraper.log"
echo ""
echo "To stop all services:"
echo "  ./stop-hybrid.sh"
echo ""
echo -e "${BLUE}Monitoring Dashboard:${NC} http://localhost:3001"
echo ""

# Keep script running if interactive
if [ -t 0 ]; then
    echo "Press Ctrl+C to stop all services..."
    
    # Trap Ctrl+C
    trap 'echo ""; ./stop-hybrid.sh; exit 0' INT
    
    # Wait indefinitely
    while true; do
        sleep 1
    done
fi