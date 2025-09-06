#!/bin/sh
set -e

# WebSocket Service Entrypoint Script for GCP Cloud Run
# Optimized for high-concurrency connections and graceful shutdown

echo "Starting TenderFlow WebSocket Service..."
echo "Environment: ${NODE_ENV:-development}"
echo "Port: ${PORT:-8080}"
echo "Redis Host: ${REDIS_HOST:-localhost}"
echo "GCP Project: ${GCP_PROJECT_ID:-unknown}"

# Validate required environment variables
validate_env() {
    local missing_vars=""
    
    if [ -z "$REDIS_HOST" ]; then
        missing_vars="$missing_vars REDIS_HOST"
    fi
    
    if [ -z "$GCP_PROJECT_ID" ]; then
        missing_vars="$missing_vars GCP_PROJECT_ID"
    fi
    
    if [ -z "$JWT_SECRET" ] && [ "$NODE_ENV" = "production" ]; then
        missing_vars="$missing_vars JWT_SECRET"
    fi
    
    if [ -n "$missing_vars" ]; then
        echo "ERROR: Missing required environment variables:$missing_vars"
        exit 1
    fi
}

# Wait for Redis to be available
wait_for_redis() {
    echo "Waiting for Redis connection..."
    local redis_host="${REDIS_HOST:-localhost}"
    local redis_port="${REDIS_PORT:-6379}"
    local max_attempts=30
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if nc -z "$redis_host" "$redis_port" 2>/dev/null; then
            echo "Redis is available at $redis_host:$redis_port"
            return 0
        fi
        
        echo "Attempt $attempt/$max_attempts: Redis not available, waiting..."
        sleep 2
        attempt=$((attempt + 1))
    done
    
    echo "ERROR: Redis not available after $max_attempts attempts"
    exit 1
}

# Set up signal handlers for graceful shutdown
setup_signal_handlers() {
    # Forward signals to Node.js process
    trap 'echo "Received SIGTERM, shutting down gracefully..."; kill -TERM $node_pid; wait $node_pid' TERM
    trap 'echo "Received SIGINT, shutting down gracefully..."; kill -INT $node_pid; wait $node_pid' INT
    trap 'echo "Received SIGQUIT, shutting down gracefully..."; kill -QUIT $node_pid; wait $node_pid' QUIT
}

# Optimize system settings for WebSocket connections
optimize_system() {
    echo "Optimizing system settings for WebSocket workload..."
    
    # Increase file descriptor limits (if running as root in init container)
    if [ "$(id -u)" = "0" ]; then
        echo "Running as root, applying system optimizations..."
        
        # Set file descriptor limits
        ulimit -n 65536
        
        # Optimize TCP settings for many connections
        sysctl -w net.core.somaxconn=65536 2>/dev/null || echo "Warning: Could not set somaxconn"
        sysctl -w net.core.netdev_max_backlog=5000 2>/dev/null || echo "Warning: Could not set netdev_max_backlog"
        sysctl -w net.ipv4.tcp_max_syn_backlog=65536 2>/dev/null || echo "Warning: Could not set tcp_max_syn_backlog"
        
        # TCP keepalive settings
        sysctl -w net.ipv4.tcp_keepalive_time=120 2>/dev/null || echo "Warning: Could not set tcp_keepalive_time"
        sysctl -w net.ipv4.tcp_keepalive_intvl=30 2>/dev/null || echo "Warning: Could not set tcp_keepalive_intvl"
        sysctl -w net.ipv4.tcp_keepalive_probes=3 2>/dev/null || echo "Warning: Could not set tcp_keepalive_probes"
    else
        echo "Running as non-root user, skipping system optimizations"
    fi
    
    # Set Node.js specific optimizations
    export UV_THREADPOOL_SIZE=128
    export NODE_OPTIONS="--max-old-space-size=2048 --max-semi-space-size=128"
    
    # WebSocket specific settings
    export SOCKET_IO_PING_TIMEOUT=${SOCKET_IO_PING_TIMEOUT:-60000}
    export SOCKET_IO_PING_INTERVAL=${SOCKET_IO_PING_INTERVAL:-25000}
    export SOCKET_IO_UPGRADE_TIMEOUT=${SOCKET_IO_UPGRADE_TIMEOUT:-30000}
    export SOCKET_IO_MAX_HTTP_BUFFER_SIZE=${SOCKET_IO_MAX_HTTP_BUFFER_SIZE:-1000000}
}

# Check application health before starting
health_check() {
    echo "Running pre-start health checks..."
    
    # Check if main application file exists
    if [ ! -f "./dist/index.js" ]; then
        echo "ERROR: Application file not found at ./dist/index.js"
        exit 1
    fi
    
    # Check Node.js version
    node_version=$(node --version)
    echo "Node.js version: $node_version"
    
    # Check available memory
    if [ -r /proc/meminfo ]; then
        available_memory=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
        echo "Available memory: ${available_memory}KB"
        
        # Warn if memory is low (less than 1GB)
        if [ "$available_memory" -lt 1048576 ]; then
            echo "WARNING: Low available memory, WebSocket performance may be affected"
        fi
    fi
}

# Log startup information
log_startup_info() {
    echo "==================== STARTUP INFO ===================="
    echo "Service: TenderFlow WebSocket"
    echo "Environment: ${NODE_ENV:-development}"
    echo "Port: ${PORT:-8080}"
    echo "Redis: ${REDIS_HOST:-localhost}:${REDIS_PORT:-6379}"
    echo "GCP Project: ${GCP_PROJECT_ID:-unknown}"
    echo "Max Connections Target: 10,000+"
    echo "Memory Limit: ${MEMORY_LIMIT:-2Gi}"
    echo "CPU Limit: ${CPU_LIMIT:-2}"
    echo "Node Options: ${NODE_OPTIONS}"
    echo "UV ThreadPool Size: ${UV_THREADPOOL_SIZE}"
    echo "====================================================="
}

# Main startup sequence
main() {
    echo "Initializing WebSocket service..."
    
    # Set up signal handlers first
    setup_signal_handlers
    
    # Run validations
    validate_env
    
    # Optimize system settings
    optimize_system
    
    # Health checks
    health_check
    
    # Wait for dependencies
    wait_for_redis
    
    # Log startup information
    log_startup_info
    
    # Start the application
    echo "Starting Node.js application..."
    node ./dist/index.js &
    node_pid=$!
    
    echo "WebSocket service started with PID: $node_pid"
    echo "Health check endpoint: http://localhost:${PORT:-8080}/health/websocket"
    
    # Wait for the Node.js process
    wait $node_pid
    exit_code=$?
    
    echo "WebSocket service exited with code: $exit_code"
    exit $exit_code
}

# Handle specific startup modes
case "${1:-}" in
    "health-check")
        echo "Running health check..."
        curl -f "http://localhost:${PORT:-8080}/health/websocket" || exit 1
        ;;
    "validate")
        echo "Running validation only..."
        validate_env
        health_check
        echo "Validation passed"
        ;;
    *)
        # Default startup
        main
        ;;
esac