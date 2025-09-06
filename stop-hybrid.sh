#!/bin/bash

# TenderFlow Hybrid System Shutdown Script

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${RED}================================${NC}"
echo -e "${RED}Stopping TenderFlow Hybrid System${NC}"
echo -e "${RED}================================${NC}"
echo ""

# Stop Python scraper
echo -n "Stopping scraper... "
pkill -f "python.*main.py" 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

# Stop API server
echo -n "Stopping API server... "
pkill -f "node.*api" 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

# Stop Docker services
echo -n "Stopping Docker services... "
cd deployment 2>/dev/null && docker-compose -f docker-compose.hybrid.yml down || true
cd .. 2>/dev/null
echo -e "${GREEN}✓${NC}"

# Clean up temp files
echo -n "Cleaning up... "
rm -f /tmp/api.log /tmp/scraper.log 2>/dev/null || true
echo -e "${GREEN}✓${NC}"

echo ""
echo -e "${GREEN}All services stopped successfully!${NC}"
echo ""