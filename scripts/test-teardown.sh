#!/bin/bash

# TenderFlow Test Environment Teardown Script
set -e

echo "🧹 Tearing down TenderFlow test environment..."

# Stop and remove test containers
echo "🛑 Stopping test services..."
docker-compose -f docker-compose.test.yml down

# Remove test volumes if requested
if [[ "$1" == "--clean-volumes" ]]; then
    echo "🗑️ Removing test volumes..."
    docker-compose -f docker-compose.test.yml down -v
    docker volume prune -f
fi

# Remove test images if requested
if [[ "$1" == "--clean-all" ]]; then
    echo "🗑️ Removing test images and volumes..."
    docker-compose -f docker-compose.test.yml down -v --rmi all
    docker volume prune -f
    docker image prune -f
fi

echo "✅ Test environment cleaned up!"