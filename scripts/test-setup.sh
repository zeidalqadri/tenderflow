#!/bin/bash

# TenderFlow Test Environment Setup Script
set -e

echo "🚀 Setting up TenderFlow test environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker and try again."
    exit 1
fi

# Function to wait for service to be healthy
wait_for_service() {
    local service_name=$1
    local max_attempts=30
    local attempt=1
    
    echo "⏳ Waiting for $service_name to be ready..."
    
    while [ $attempt -le $max_attempts ]; do
        if docker-compose -f docker-compose.test.yml ps $service_name | grep -q "healthy"; then
            echo "✅ $service_name is ready!"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts - $service_name not ready yet..."
        sleep 2
        ((attempt++))
    done
    
    echo "❌ $service_name failed to start within timeout"
    return 1
}

# Start test services
echo "🐳 Starting test services..."
docker-compose -f docker-compose.test.yml up -d

# Wait for core services
wait_for_service "postgres-test"
wait_for_service "redis-test"
wait_for_service "localstack"

# Run database migrations
echo "🔄 Running database migrations..."
cd apps/api
npx prisma migrate deploy --schema=./prisma/schema.prisma
npx prisma generate --schema=./prisma/schema.prisma
cd ../..

# Set up LocalStack resources
echo "☁️ Setting up LocalStack resources..."
aws --endpoint-url=http://localhost:4566 s3 mb s3://test-bucket --region us-east-1 || echo "Bucket already exists"
aws --endpoint-url=http://localhost:4566 sqs create-queue --queue-name test-queue --region us-east-1 || echo "Queue already exists"

# Create test data
echo "📊 Creating test data..."
npm run db:test:seed

echo "✅ Test environment is ready!"
echo ""
echo "Available services:"
echo "  - PostgreSQL Test DB: localhost:5433"
echo "  - Redis Test: localhost:6380"
echo "  - LocalStack: localhost:4566"
echo "  - MailHog UI: http://localhost:8025"
echo ""
echo "To run tests:"
echo "  npm run test:unit     # Unit tests"
echo "  npm run test:integration # Integration tests"
echo "  npm run test:e2e      # End-to-end tests"
echo ""
echo "To stop test environment:"
echo "  docker-compose -f docker-compose.test.yml down"