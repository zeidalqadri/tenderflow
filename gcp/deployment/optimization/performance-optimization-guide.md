# ⚡ TenderFlow GCP Performance Optimization Guide

## Overview

This guide provides comprehensive performance optimization strategies for the TenderFlow platform on Google Cloud Platform, designed to support 10,000+ concurrent users with government-grade reliability and 99.9% uptime SLA.

## Performance Targets

| Metric | Target | Critical Threshold |
|--------|--------|-------------------|
| **API Response Time (95th percentile)** | <2 seconds | <5 seconds |
| **Database Query Time (90th percentile)** | <1 second | <3 seconds |
| **WebSocket Connection Time** | <500ms | <1 second |
| **Document Upload Time** | <30 seconds | <60 seconds |
| **Availability** | 99.9% | 99.0% |
| **Concurrent Users** | 10,000+ | 5,000 minimum |

---

## 1. Application-Level Optimizations

### 1.1 Node.js/Fastify Performance Tuning

#### Memory Management
```javascript
// apps/api/src/config/performance.js
export const performanceConfig = {
  // Node.js heap optimization for high concurrency
  nodeOptions: [
    '--max-old-space-size=4096',    // 4GB heap size
    '--max-semi-space-size=256',    // Optimize garbage collection
    '--optimize-for-size',          // Reduce memory footprint
    '--gc-interval=100',            // Frequent garbage collection
  ],
  
  // UV thread pool for I/O operations
  uvThreadPoolSize: 128,  // Handle many concurrent file operations
  
  // Fastify performance settings
  fastify: {
    logger: {
      level: 'info',
      serializers: {
        // Reduce log object overhead
        req: (req) => ({
          method: req.method,
          url: req.url,
          remoteAddress: req.ip,
        }),
      },
    },
    
    // Connection optimizations
    keepAliveTimeout: 72000,      // 72 seconds
    maxRequestsPerSocket: 0,      // Unlimited requests per socket
    requestTimeout: 30000,        // 30 second timeout
    bodyLimit: 10 * 1024 * 1024,  // 10MB body limit
    
    // JSON parsing optimization
    addContentTypeParser: {
      'application/json': { parseAs: 'string' },
      handler: (req, body, done) => {
        try {
          const json = JSON.parse(body);
          done(null, json);
        } catch (err) {
          err.statusCode = 400;
          done(err, undefined);
        }
      },
    },
  },
};
```

#### Connection Pooling Optimization
```javascript
// apps/api/src/config/database.js
export const databaseConfig = {
  // Prisma connection pooling
  prisma: {
    datasource: {
      url: process.env.DATABASE_URL,
    },
    generator: {
      // Enable query engine optimizations
      binaryTargets: ['native', 'debian-openssl-1.1.x'],
      previewFeatures: ['metrics', 'tracing'],
    },
  },
  
  // Connection pool settings for high load - UPDATED FOR 10K+ USERS
  connectionPool: {
    max: 300,             // Increased for 10k+ concurrent users (from Database Infrastructure Specialist)
    min: 20,              // Minimum connections to maintain warm pool
    acquireTimeoutMillis: 5000,    // Reduced timeout for faster failure detection
    createTimeoutMillis: 10000,    // Connection creation timeout
    idleTimeoutMillis: 600000,     // 10 minute idle timeout
    createRetryIntervalMillis: 100, // Fast retry for failed connections
  },
  
  // Query optimization settings
  querySettings: {
    statementTimeout: '30s',       // 30 second query timeout
    connectionTimeout: '10s',      // 10 second connection timeout
    poolTimeout: '5s',             // 5 second pool timeout
  },
};
```

### 1.2 Caching Strategy Optimization

#### Redis Caching Configuration
```yaml
# gcp/optimization/redis-cache-config.yaml
redis:
  # Memory optimization for 10,000+ connections
  maxMemoryPolicy: "allkeys-lru"
  maxMemoryReserved: "25%"
  
  # Connection optimization
  maxClients: 20000
  tcpKeepalive: 60
  timeout: 300
  
  # Performance tuning
  rdbCompression: true
  rdbChecksumEnabled: true
  stopWritesOnBgsaveError: false
  
  # Persistence for reliability
  save:
    - "900 1"    # Save if at least 1 key changed in 900 seconds
    - "300 10"   # Save if at least 10 keys changed in 300 seconds
    - "60 10000" # Save if at least 10000 keys changed in 60 seconds

# Application-level caching strategy
caching:
  # User session cache (30 minutes)
  userSessions:
    ttl: 1800
    keyPattern: "session:{userId}"
    
  # API response cache (5 minutes)
  apiResponses:
    ttl: 300
    keyPattern: "api:{endpoint}:{params_hash}"
    
  # Database query cache (10 minutes)
  queryCache:
    ttl: 600
    keyPattern: "query:{table}:{query_hash}"
    
  # WebSocket connection state (1 hour)
  websocketState:
    ttl: 3600
    keyPattern: "ws:{tenantId}:{userId}"
```

### 1.3 WebSocket Performance Optimization

#### Socket.IO Configuration
```javascript
// packages/realtime/src/config/websocket-performance.js
export const websocketPerformanceConfig = {
  // Socket.IO server optimization
  socketIO: {
    // Connection optimization
    pingTimeout: 60000,           // 60 seconds
    pingInterval: 25000,          // 25 seconds
    upgradeTimeout: 30000,        // 30 seconds
    maxHttpBufferSize: 1000000,   // 1MB message size limit
    
    // Transport optimization
    transports: ['websocket', 'polling'],
    allowEIO3: true,              // Backward compatibility
    
    // Performance settings
    serveClient: false,           // Don't serve client files
    allowRequest: async (req, callback) => {
      // Custom rate limiting per IP
      const ip = req.connection.remoteAddress;
      const connections = await getConnectionCountByIP(ip);
      
      if (connections > 100) {  // Max 100 connections per IP
        return callback('Too many connections from this IP', false);
      }
      
      callback(null, true);
    },
    
    // Memory optimization
    maxListeners: 20,             // Max event listeners per socket
    destroyUpgrade: true,         // Clean up failed upgrades
  },
  
  // Redis adapter optimization
  redisAdapter: {
    // Reduce Redis roundtrips
    requestsTimeout: 5000,        // 5 second timeout
    
    // Connection pooling
    pubClient: {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: true,
      maxMemoryPolicy: 'allkeys-lru',
    },
    
    subClient: {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: true,
    },
  },
};
```

---

## 2. Database Performance Optimization

### 2.1 PostgreSQL Configuration Tuning

#### Cloud SQL Instance Configuration
```yaml
# gcp/optimization/cloudsql-performance.yaml
cloudSQL:
  # Instance configuration for high performance
  tier: "db-custom-8-32768"  # 8 vCPUs, 32GB RAM
  availabilityType: "REGIONAL"
  diskType: "PD_SSD"
  diskSize: "500GB"
  diskAutoresize: true
  diskAutoresizeLimit: "2TB"
  
  # PostgreSQL performance flags
  databaseFlags:
    # Connection settings
    - name: "max_connections"
      value: "400"             # Support high concurrent load
    
    # Memory settings
    - name: "shared_buffers"
      value: "8GB"             # 25% of total RAM
    - name: "effective_cache_size"
      value: "24GB"            # 75% of total RAM
    - name: "work_mem"
      value: "32MB"            # Per-query memory
    - name: "maintenance_work_mem"
      value: "2GB"             # Maintenance operations
    
    # Checkpoint and WAL settings
    - name: "checkpoint_completion_target"
      value: "0.9"             # Smooth checkpoints
    - name: "wal_buffers"
      value: "64MB"            # WAL buffer size
    - name: "max_wal_size"
      value: "4GB"             # Large WAL for performance
    - name: "min_wal_size"
      value: "1GB"             # Minimum WAL size
    
    # Query optimization
    - name: "random_page_cost"
      value: "1.1"             # SSD optimization
    - name: "effective_io_concurrency"
      value: "200"             # SSD concurrent I/O
    - name: "default_statistics_target"
      value: "500"             # Better query planning
    
    # Logging and monitoring
    - name: "log_min_duration_statement"
      value: "1000"            # Log slow queries (>1s)
    - name: "log_statement"
      value: "ddl"             # Log DDL statements
    - name: "track_activity_query_size"
      value: "2048"            # Larger query tracking
```

### 2.2 Indexing Strategy

#### Performance-Critical Indexes
```sql
-- apps/api/prisma/performance-indexes.sql

-- Tenant isolation indexes (most critical)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenders_tenant_status_deadline 
ON tenders(tenant_id, status, deadline) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_tenant_tender_type 
ON documents(tenant_id, tender_id, type) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_tenant_active 
ON users(tenant_id) 
WHERE deleted_at IS NULL AND active = true;

-- Authentication and session indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_active 
ON users(email) 
WHERE deleted_at IS NULL AND active = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_key_active 
ON api_keys(key_hash) 
WHERE deleted_at IS NULL AND active = true;

-- WebSocket and real-time indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tender_assignments_user_tender 
ON tender_assignments(user_id, tender_id) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_comments_resource_type_id 
ON comments(resource_type, resource_id, created_at DESC) 
WHERE deleted_at IS NULL;

-- Audit and compliance indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_tenant_timestamp 
ON audit_logs(tenant_id, timestamp DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_logs_user_action_timestamp 
ON audit_logs(user_id, action, timestamp DESC);

-- Full-text search indexes for performance
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenders_search 
ON tenders 
USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, ''))) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_filename_search 
ON documents 
USING GIN(to_tsvector('english', filename || ' ' || COALESCE(original_name, ''))) 
WHERE deleted_at IS NULL;

-- Partial indexes for common queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tenders_active_by_deadline 
ON tenders(deadline ASC) 
WHERE deleted_at IS NULL AND status IN ('DRAFT', 'PUBLISHED', 'OPEN');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_documents_processing 
ON documents(created_at DESC) 
WHERE deleted_at IS NULL AND status = 'PROCESSING';

-- Composite indexes for complex queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_bids_tender_user_status 
ON bids(tender_id, user_id, status) 
WHERE deleted_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_user_unread_timestamp 
ON notifications(user_id, read_at, created_at DESC) 
WHERE deleted_at IS NULL;
```

### 2.3 Query Optimization Strategies

#### Optimized Query Patterns
```javascript
// apps/api/src/utils/optimized-queries.js

export class OptimizedQueries {
  // Paginated queries with cursor-based pagination for better performance
  static async getPaginatedTenders(prisma, tenantId, cursor, limit = 20) {
    return await prisma.tender.findMany({
      where: {
        tenantId,
        deletedAt: null,
        // Use cursor for better performance than OFFSET
        ...(cursor && {
          id: {
            gt: cursor,
          },
        }),
      },
      orderBy: {
        id: 'asc',  // Use indexed column for ordering
      },
      take: limit,
      select: {
        // Only select needed fields
        id: true,
        title: true,
        status: true,
        deadline: true,
        createdAt: true,
        // Don't select large text fields unless needed
      },
    });
  }
  
  // Batch queries to reduce database roundtrips
  static async getBatchTenderData(prisma, tenantId, tenderIds) {
    const [tenders, documents, bids] = await Promise.all([
      prisma.tender.findMany({
        where: {
          id: { in: tenderIds },
          tenantId,
          deletedAt: null,
        },
      }),
      prisma.document.findMany({
        where: {
          tenderId: { in: tenderIds },
          deletedAt: null,
        },
      }),
      prisma.bid.findMany({
        where: {
          tenderId: { in: tenderIds },
          deletedAt: null,
        },
      }),
    ]);
    
    return { tenders, documents, bids };
  }
  
  // Use database aggregations instead of application-level calculations
  static async getTenderStatistics(prisma, tenantId) {
    return await prisma.tender.groupBy({
      by: ['status'],
      where: {
        tenantId,
        deletedAt: null,
      },
      _count: {
        id: true,
      },
      _avg: {
        budget: true,
      },
      _sum: {
        budget: true,
      },
    });
  }
  
  // Optimized search with full-text search - SECURE VERSION
  static async searchTenders(prisma, tenantId, searchTerm, limit = 20) {
    // Input validation and sanitization
    if (typeof searchTerm !== 'string' || searchTerm.length > 100) {
      throw new Error('Invalid search term');
    }
    
    // Use parameterized query with proper escaping
    return await prisma.$queryRaw`
      SELECT id, title, description, status, deadline, ts_rank_cd(search_vector, query) AS rank
      FROM tenders, plainto_tsquery('english', ${searchTerm}::text) query
      WHERE tenant_id = ${tenantId}::uuid
        AND deleted_at IS NULL
        AND search_vector @@ query
      ORDER BY rank DESC, deadline ASC
      LIMIT ${limit}::integer
    `;
  }
}
```

---

## 3. Infrastructure Optimization

### 3.1 Cloud Run Performance Tuning

#### Service Configuration
```yaml
# gcp/optimization/cloudrun-performance.yaml
apiVersion: serving.knative.dev/v1
kind: Service
metadata:
  annotations:
    # Concurrency optimization
    autoscaling.knative.dev/maxScale: "100"
    autoscaling.knative.dev/minScale: "5"
    autoscaling.knative.dev/target: "70"  # Target 70 concurrent requests per instance
    
    # Performance optimization
    run.googleapis.com/execution-environment: "gen2"
    run.googleapis.com/cpu-throttling: "false"
    run.googleapis.com/startup-cpu-boost: "true"
    
    # Session affinity for WebSocket
    run.googleapis.com/sessionAffinity: "true"
    
spec:
  template:
    metadata:
      annotations:
        # Resource allocation
        run.googleapis.com/cpu: "4"        # 4 vCPUs per instance
        run.googleapis.com/memory: "8Gi"   # 8GB RAM per instance
        
        # Networking optimization
        run.googleapis.com/vpc-access-connector: "vpc-connector"
        run.googleapis.com/vpc-access-egress: "private-ranges-only"
        
        # Container optimization
        run.googleapis.com/container-dependencies: '{"api":["database","redis"]}'
        
    spec:
      containerConcurrency: 1000  # Up to 1000 concurrent requests per instance
      timeoutSeconds: 300         # 5 minute timeout
      
      containers:
      - image: gcr.io/tensurv/tenderflow-api:latest
        resources:
          limits:
            cpu: "4000m"    # 4 full CPUs
            memory: "8Gi"   # 8GB RAM
        
        ports:
        - containerPort: 8080
          name: http1
          
        env:
        # Performance environment variables
        - name: NODE_OPTIONS
          value: "--max-old-space-size=6144 --optimize-for-size"
        - name: UV_THREADPOOL_SIZE
          value: "128"
        - name: FASTIFY_KEEP_ALIVE_TIMEOUT
          value: "72000"
```

### 3.2 Load Balancer Optimization

#### Advanced Load Balancing Configuration
```yaml
# gcp/optimization/load-balancer-performance.yaml
loadBalancer:
  # Backend service optimization
  backendService:
    # Session affinity for WebSocket connections
    sessionAffinity: "CLIENT_IP"
    
    # Connection draining for graceful updates
    connectionDrainingTimeoutSec: 300
    
    # Health check optimization
    healthCheck:
      checkIntervalSec: 10      # Check every 10 seconds
      timeoutSec: 5             # 5 second timeout
      healthyThreshold: 2       # Healthy after 2 checks
      unhealthyThreshold: 3     # Unhealthy after 3 checks
      
    # Circuit breaker for reliability
    outlierDetection:
      consecutiveErrors: 3
      interval: 30s
      baseEjectionTime: 30s
      maxEjectionPercent: 50
      
    # Load balancing algorithm
    loadBalancingScheme: "EXTERNAL_MANAGED"
    localityLbPolicy: "LEAST_REQUEST"  # Best for API workloads
    
  # CDN optimization
  cdn:
    enabled: true
    cacheMode: "CACHE_ALL_STATIC"
    
    # Cache policies for different content types
    cachePolicies:
      - name: "api-responses"
        defaultTtl: "300s"      # 5 minutes for API responses
        maxTtl: "3600s"         # 1 hour maximum
        clientTtl: "60s"        # 1 minute client cache
        
      - name: "static-assets"
        defaultTtl: "86400s"    # 1 day for static assets
        maxTtl: "2592000s"      # 30 days maximum
        clientTtl: "3600s"      # 1 hour client cache
        
      - name: "thumbnails"
        defaultTtl: "3600s"     # 1 hour for thumbnails
        maxTtl: "86400s"        # 1 day maximum
        clientTtl: "1800s"      # 30 minutes client cache
```

### 3.3 Storage Performance Optimization

#### Google Cloud Storage Configuration
```yaml
# gcp/optimization/storage-performance.yaml
storage:
  # Primary document bucket
  documentsBucket:
    storageClass: "STANDARD"
    location: "US-CENTRAL1"
    
    # Lifecycle management for performance
    lifecycle:
      rules:
        - condition:
            age: 30
          action:
            type: "SetStorageClass"
            storageClass: "NEARLINE"
        - condition:
            age: 365
          action:
            type: "SetStorageClass"
            storageClass: "COLDLINE"
    
    # CORS for direct uploads
    cors:
      - origin: ["https://tenderflow.app"]
        method: ["GET", "POST", "PUT", "DELETE"]
        responseHeader: ["Content-Type", "x-goog-resumable"]
        maxAgeSeconds: 3600
  
  # Thumbnail bucket with CDN optimization
  thumbnailsBucket:
    storageClass: "STANDARD"
    location: "US-CENTRAL1"
    
    # Public access for CDN
    uniformBucketLevelAccess: true
    publicAccessPrevention: "inherited"
    
    # Cache control headers
    defaultEventBasedHold: false
    defaultObjectAcl: "publicRead"
    
  # Performance optimization settings
  performanceSettings:
    # Parallel upload configuration
    parallelCompositeUploadThreshold: "150MB"
    parallelCompositeUploadComponentSize: "50MB"
    
    # Transfer acceleration
    transferAcceleration: true
    
    # Request rate optimization
    requestRateLimit: 5000  # Requests per second per bucket
```

---

## 4. Monitoring and Performance Tuning

### 4.1 Real-time Performance Monitoring

#### Custom Performance Metrics
```javascript
// apps/api/src/monitoring/performance-metrics.js
import { Monitoring } from '@google-cloud/monitoring';

export class PerformanceMonitor {
  constructor() {
    this.monitoring = new Monitoring.MetricServiceClient();
    this.projectId = process.env.GCP_PROJECT_ID;
  }
  
  // Track API response times
  async recordAPILatency(endpoint, latency, statusCode) {
    const dataPoint = {
      interval: {
        endTime: {
          seconds: Date.now() / 1000,
        },
      },
      value: {
        doubleValue: latency,
      },
    };
    
    await this.monitoring.createTimeSeries({
      name: `projects/${this.projectId}`,
      timeSeries: [{
        metric: {
          type: 'custom.googleapis.com/api/response_time',
          labels: {
            endpoint: endpoint,
            status_code: statusCode.toString(),
          },
        },
        resource: {
          type: 'cloud_run_revision',
          labels: {
            project_id: this.projectId,
            service_name: 'tenderflow-api',
            revision_name: process.env.K_REVISION,
          },
        },
        points: [dataPoint],
      }],
    });
  }
  
  // Track database query performance
  async recordDatabaseMetrics(queryType, duration, rowCount) {
    const dataPoint = {
      interval: {
        endTime: {
          seconds: Date.now() / 1000,
        },
      },
      value: {
        doubleValue: duration,
      },
    };
    
    await this.monitoring.createTimeSeries({
      name: `projects/${this.projectId}`,
      timeSeries: [{
        metric: {
          type: 'custom.googleapis.com/database/query_duration',
          labels: {
            query_type: queryType,
            row_count_bucket: this.getRowCountBucket(rowCount),
          },
        },
        resource: {
          type: 'cloudsql_database',
          labels: {
            project_id: this.projectId,
            database_id: 'tenderflow-db',
          },
        },
        points: [dataPoint],
      }],
    });
  }
  
  // Track WebSocket connection metrics
  async recordWebSocketMetrics(event, connectionCount, tenantId) {
    const dataPoint = {
      interval: {
        endTime: {
          seconds: Date.now() / 1000,
        },
      },
      value: {
        int64Value: connectionCount,
      },
    };
    
    await this.monitoring.createTimeSeries({
      name: `projects/${this.projectId}`,
      timeSeries: [{
        metric: {
          type: 'custom.googleapis.com/websocket/connections',
          labels: {
            event: event,
            tenant_id: tenantId,
          },
        },
        resource: {
          type: 'cloud_run_revision',
          labels: {
            project_id: this.projectId,
            service_name: 'tenderflow-websocket',
            revision_name: process.env.K_REVISION,
          },
        },
        points: [dataPoint],
      }],
    });
  }
  
  getRowCountBucket(rowCount) {
    if (rowCount <= 10) return 'small';
    if (rowCount <= 100) return 'medium';
    if (rowCount <= 1000) return 'large';
    return 'xlarge';
  }
}
```

### 4.2 Automated Performance Optimization

#### Auto-scaling Configuration
```yaml
# gcp/optimization/auto-scaling-policy.yaml
autoScaling:
  # Cloud Run auto-scaling
  cloudRun:
    api:
      minInstances: 5           # Always keep 5 instances warm
      maxInstances: 100         # Scale up to 100 instances
      targetConcurrency: 70     # Target 70 requests per instance
      
      # CPU-based scaling
      cpuThreshold: 60          # Scale when CPU > 60%
      
      # Custom metrics scaling
      customMetrics:
        - metric: "custom.googleapis.com/api/queue_depth"
          target: 50            # Scale when queue > 50 requests
        - metric: "custom.googleapis.com/database/connection_utilization"
          target: 70            # Scale when DB connections > 70%
    
    websocket:
      minInstances: 3           # Keep WebSocket instances warm
      maxInstances: 50          # Fewer instances for WebSocket
      targetConcurrency: 200    # More connections per WebSocket instance
      
  # Database auto-scaling
  database:
    # Read replica scaling
    readReplicas:
      minReplicas: 1
      maxReplicas: 3
      targetCPU: 70
      targetConnections: 200
    
    # Storage auto-scaling
    diskAutoresize: true
    diskAutoresizeLimit: "2TB"
  
  # Redis memory scaling alerts
  redis:
    memoryThreshold: 80         # Alert when memory > 80%
    connectionThreshold: 15000  # Alert when connections > 15k
```

---

## 5. Cost Optimization Strategies

### 5.1 Resource Right-sizing

#### Cost-Performance Balance
```yaml
# gcp/optimization/cost-optimization.yaml
costOptimization:
  # Committed use discounts for predictable workloads
  committedUseDiscounts:
    cloudRun:
      cpu: "100 vCPU"          # 1-year commitment for base load
      memory: "400 GiB"        # Memory commitment
      
    cloudSQL:
      tier: "db-custom-4-16384" # Committed instance size
      duration: "1 year"       # Commitment period
      
    memorystore:
      memory: "16 GB"          # Redis memory commitment
      duration: "1 year"
  
  # Preemptible instances for batch processing
  batchProcessing:
    preemptibleInstances: true
    maxPreemptionRate: 50      # 50% of batch instances can be preemptible
    
  # Storage class optimization
  storageOptimization:
    # Automatic lifecycle transitions
    documents:
      - age: 30
        action: "NEARLINE"     # 30 days -> Nearline
      - age: 365
        action: "COLDLINE"     # 1 year -> Coldline
      - age: 2555             # 7 years for compliance
        action: "DELETE"
        
    logs:
      - age: 90
        action: "NEARLINE"
      - age: 365
        action: "COLDLINE"
        
    # Intelligent tiering for variable access patterns
    intelligentTiering: true
```

### 5.2 Performance vs Cost Trade-offs

#### Optimization Recommendations
```markdown
# Performance-Cost Matrix

## High Performance, High Cost
- Cloud Run: 4 vCPU, 8GB RAM per instance
- Database: db-custom-8-32768 (8 vCPU, 32GB RAM)
- Redis: 16GB Standard HA
- **Estimated Cost**: $1,200-1,400/month
- **Use Case**: Peak traffic, government SLA requirements

## Balanced Performance, Medium Cost  
- Cloud Run: 2 vCPU, 4GB RAM per instance
- Database: db-custom-4-16384 (4 vCPU, 16GB RAM)
- Redis: 8GB Standard HA
- **Estimated Cost**: $800-1,000/month
- **Use Case**: Normal operations, good performance

## Cost Optimized, Acceptable Performance
- Cloud Run: 1 vCPU, 2GB RAM per instance
- Database: db-custom-2-8192 (2 vCPU, 8GB RAM)
- Redis: 4GB Standard
- **Estimated Cost**: $500-700/month
- **Use Case**: Development/staging, lower traffic
```

---

## 6. Performance Testing and Validation

### 6.1 Continuous Performance Monitoring

#### Performance SLA Dashboard
```javascript
// gcp/monitoring/performance-dashboard.js
export const performanceDashboard = {
  widgets: [
    // API Performance SLA
    {
      title: "API Response Time SLA (95th percentile)",
      type: "line_chart",
      metrics: [
        "custom.googleapis.com/api/response_time",
      ],
      threshold: {
        value: 2000,  // 2 seconds
        color: "red",
        label: "SLA Violation"
      }
    },
    
    // Database Performance
    {
      title: "Database Query Performance",
      type: "heatmap",
      metrics: [
        "cloudsql.googleapis.com/database/postgresql/transaction_count",
      ],
      dimensions: ["query_type", "duration_bucket"]
    },
    
    // WebSocket Connection Health
    {
      title: "WebSocket Connection Success Rate",
      type: "scorecard",
      metrics: [
        "custom.googleapis.com/websocket/connection_success_rate",
      ],
      threshold: {
        value: 0.99,  // 99% success rate
        color: "red",
        label: "Below Target"
      }
    },
    
    // Resource Utilization
    {
      title: "System Resource Utilization",
      type: "stacked_area",
      metrics: [
        "run.googleapis.com/container/cpu/utilizations",
        "run.googleapis.com/container/memory/utilizations",
      ]
    }
  ]
};
```

### 6.2 Automated Performance Testing

#### CI/CD Performance Gates
```yaml
# .github/workflows/performance-testing.yml
name: Performance Testing
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  performance-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      
      - name: Run Load Tests
        run: |
          k6 run --out json=results.json gcp/deployment/testing/load-test-suite.js
          
      - name: Validate SLA Requirements
        run: |
          node scripts/validate-performance-sla.js results.json
          
      - name: Performance Regression Check
        run: |
          node scripts/performance-regression-check.js results.json baseline.json
          
      - name: Update Performance Baseline
        if: github.ref == 'refs/heads/main'
        run: |
          cp results.json baseline.json
          git add baseline.json
          git commit -m "Update performance baseline"
```

---

## 7. Troubleshooting Performance Issues

### 7.1 Common Performance Bottlenecks

#### Database Performance Issues
```sql
-- Query to identify slow queries
SELECT query, 
       mean_exec_time, 
       calls, 
       total_exec_time,
       mean_exec_time/calls as avg_time_per_call
FROM pg_stat_statements 
WHERE mean_exec_time > 1000  -- Queries slower than 1 second
ORDER BY mean_exec_time DESC 
LIMIT 20;

-- Query to identify blocking locks
SELECT blocked_locks.pid AS blocked_pid,
       blocked_activity.usename AS blocked_user,
       blocking_locks.pid AS blocking_pid,
       blocking_activity.usename AS blocking_user,
       blocked_activity.query AS blocked_statement,
       blocking_activity.query AS blocking_statement
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity 
  ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks 
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.DATABASE IS NOT DISTINCT FROM blocked_locks.DATABASE
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
JOIN pg_catalog.pg_stat_activity blocking_activity 
  ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.GRANTED;
```

#### Application Performance Profiling
```javascript
// apps/api/src/utils/performance-profiler.js
import { performance } from 'perf_hooks';

export class PerformanceProfiler {
  static async profileFunction(name, fn) {
    const start = performance.now();
    const result = await fn();
    const end = performance.now();
    
    const duration = end - start;
    
    // Log performance metrics
    console.log(`Performance: ${name} took ${duration.toFixed(2)}ms`);
    
    // Send to monitoring if duration is concerning
    if (duration > 1000) {  // > 1 second
      await this.sendToMonitoring(name, duration);
    }
    
    return result;
  }
  
  static async profileRoute(req, res, next) {
    const start = performance.now();
    
    res.on('finish', () => {
      const end = performance.now();
      const duration = end - start;
      
      // Log route performance
      console.log(`Route: ${req.method} ${req.path} - ${duration.toFixed(2)}ms`);
      
      // Track in custom metrics
      performanceMonitor.recordAPILatency(
        `${req.method} ${req.path}`,
        duration,
        res.statusCode
      );
    });
    
    next();
  }
}
```

### 7.2 Performance Optimization Checklist

#### Weekly Performance Review
- [ ] Review SLA compliance metrics (99.9% uptime target)
- [ ] Analyze API response time trends
- [ ] Check database query performance
- [ ] Monitor WebSocket connection stability
- [ ] Review resource utilization trends
- [ ] Validate cost vs performance balance
- [ ] Update auto-scaling thresholds if needed
- [ ] Check for memory leaks or resource exhaustion
- [ ] Review CDN cache hit rates
- [ ] Analyze error rates and patterns

---

## Implementation Priority

### Phase 1: Critical Performance (Week 1)
1. Database indexing optimization
2. Connection pooling tuning
3. Basic caching implementation
4. Cloud Run resource allocation

### Phase 2: Scale Optimization (Week 2-3)
1. Redis caching strategy
2. WebSocket performance tuning
3. Load balancer optimization
4. Auto-scaling configuration

### Phase 3: Advanced Optimization (Week 4+)
1. Custom metrics and monitoring
2. CDN optimization
3. Cost optimization strategies
4. Continuous performance testing

**This optimization guide ensures TenderFlow meets government SLA requirements while maintaining cost efficiency and operational excellence.**