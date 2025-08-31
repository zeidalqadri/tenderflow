# 🏛️ TenderFlow Architecture Documentation

This document describes the technical architecture of the TenderFlow platform, including system design decisions, data flows, and implementation patterns.

## System Overview

TenderFlow is built as a modern, scalable web application using a microservices-inspired architecture with a clear separation of concerns.

```
┌─────────────────────────────────────────────────────────────────┐
│                    TENDERFLOW SYSTEM ARCHITECTURE                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────┐ │
│  │   Presentation  │    │    Business     │    │    Data     │ │
│  │     Layer       │◄──►│     Logic       │◄──►│   Layer     │ │
│  │                 │    │     Layer       │    │             │ │
│  │ • Next.js 14    │    │ • Fastify API   │    │ • PostgreSQL│ │
│  │ • React 18      │    │ • TypeScript    │    │ • Prisma    │ │
│  │ • Tailwind CSS  │    │ • Zod Validation│    │ • Redis     │ │
│  │ • Zustand       │    │ • JWT Auth      │    │ • MinIO     │ │
│  │ • React Query   │    │ • WebSocket     │    │             │ │
│  └─────────────────┘    └─────────────────┘    └─────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

### Frontend Stack
- **Framework**: Next.js 14 with App Router
- **Runtime**: React 18 with Server Components
- **Styling**: Tailwind CSS with design system
- **State Management**: Zustand for global state
- **Data Fetching**: TanStack Query (React Query)
- **UI Components**: Radix UI primitives
- **Forms**: React Hook Form with Zod validation
- **Icons**: Lucide React

### Backend Stack  
- **Framework**: Fastify 4 with TypeScript
- **Database**: PostgreSQL 15 with Prisma ORM
- **Cache/Queue**: Redis 7 with BullMQ
- **Authentication**: JWT with refresh tokens
- **File Storage**: MinIO (S3-compatible)
- **Validation**: Zod schemas
- **Documentation**: Fastify Swagger

### Infrastructure
- **Containerization**: Docker with Docker Compose
- **Database**: PostgreSQL with connection pooling
- **Cache**: Redis for sessions and job queue
- **Storage**: MinIO for document management
- **Email**: MailHog for development testing
- **Monitoring**: Prometheus and Grafana (optional)

## Architecture Patterns

### 1. Monorepo Structure
```
tenderflow/
├── apps/
│   ├── api/           # Backend application
│   └── web/           # Frontend application  
├── packages/
│   ├── shared/        # Shared types and utilities
│   └── ui/            # Reusable UI components
└── docs/             # Documentation
```

**Benefits:**
- Shared code reuse between frontend and backend
- Consistent type definitions across applications
- Simplified dependency management
- Coordinated releases

### 2. Domain-Driven Design

The system is organized around business domains:

```
Domains:
├── Authentication    # User management and access control
├── Tenders          # Core tender lifecycle management
├── Documents        # File storage and OCR processing
├── Collaboration    # Comments, assignments, notifications
├── Submissions      # Portal integration and tracking
├── Analytics        # Reporting and business intelligence
└── System           # Configuration, audit, jobs
```

### 3. Multi-Tenant Architecture

TenderFlow supports multiple organizations (tenants) with complete data isolation:

```sql
-- Every major table includes tenantId for isolation
CREATE TABLE tenders (
  id UUID PRIMARY KEY,
  tenantId UUID NOT NULL REFERENCES tenants(id),
  title VARCHAR NOT NULL,
  -- ... other fields
);

-- Row-level security ensures data isolation
CREATE POLICY tenant_isolation ON tenders
  FOR ALL TO application_user  
  USING (tenantId = current_setting('app.current_tenant')::UUID);
```

**Benefits:**
- Complete data isolation between organizations
- Shared infrastructure costs
- Simplified compliance and backup strategies
- Scalable to thousands of tenants

## Data Architecture

### Database Schema Design

The database uses a normalized schema with careful attention to performance and referential integrity:

```
Core Entity Relationships:

tenants (1) ──┬── users (N)
              ├── tenders (N) ──┬── documents (N)
              │                 ├── bids (1)
              │                 ├── submissions (N)
              │                 ├── comments (N)
              │                 ├── tender_assignments (N) ── users (N)
              │                 └── state_transitions (N)
              ├── audit_logs (N)
              └── api_keys (N)
```

### Key Design Decisions

#### 1. UUID Primary Keys
- **Why**: Distributed system compatibility, no ID guessing
- **Impact**: Larger storage but better security and scalability

#### 2. JSONB for Flexible Data
- **Usage**: Tender metadata, bid details, notification data
- **Why**: Schema flexibility without losing query performance
- **Indexing**: GIN indexes for fast JSONB queries

#### 3. Soft Deletes
- **Implementation**: `deletedAt` timestamps instead of hard deletes  
- **Why**: Audit trail preservation, undo functionality
- **Queries**: Include `WHERE deletedAt IS NULL` filters

#### 4. Audit Trail
- **Pattern**: Every mutation tracked in `audit_logs`
- **Data**: Old values, new values, user, timestamp, IP
- **Compliance**: Meets regulatory requirements

### State Management

#### Frontend State Architecture
```typescript
// Global State (Zustand)
interface AppState {
  auth: AuthState;        // User authentication
  ui: UIState;           // Global UI state (modals, notifications)
  settings: SettingsState; // User preferences
}

// Server State (React Query)
interface ServerState {
  tenders: TenderQueries;     // Tender data with caching
  documents: DocumentQueries; // File management
  users: UserQueries;        // Team management
}

// Local State (useState/useReducer)
// Form state, component-specific state
```

#### Backend State Management
- **Database**: Single source of truth
- **Cache**: Redis for frequently accessed data
- **Jobs**: BullMQ for background processing
- **Sessions**: JWT tokens (stateless)

## Security Architecture

### Authentication & Authorization

```
Request Flow:
1. User login → JWT token issued
2. Client stores token (httpOnly cookie preferred)
3. Each API request includes token
4. Server validates token and extracts user info
5. Authorization checked against resource permissions
```

#### Role-Based Access Control (RBAC)
```typescript
interface User {
  role: 'admin' | 'member' | 'viewer';  // Global role
  tenantId: string;                     // Tenant isolation
}

interface TenderAssignment {
  userId: string;
  tenderId: string;
  role: 'owner' | 'contributor' | 'viewer'; // Per-tender role
}
```

#### Security Layers
1. **Network**: HTTPS only, CORS configuration
2. **Authentication**: JWT with refresh token rotation  
3. **Authorization**: Role-based access control
4. **Input Validation**: Zod schemas on all inputs
5. **SQL Injection**: Prisma ORM prevents injection
6. **File Upload**: Type/size validation, virus scanning
7. **Rate Limiting**: Prevent abuse and DoS
8. **Audit Logging**: Complete operation trail

### Data Protection
- **Encryption at Rest**: Database encryption
- **Encryption in Transit**: TLS 1.3 for all communications
- **Secrets Management**: Environment variables, no hardcoded secrets
- **Data Retention**: Configurable retention policies
- **GDPR Compliance**: User data export/deletion

## API Architecture

### RESTful Design
```http
# Resource-based URLs
GET    /api/tenders           # List resources
POST   /api/tenders           # Create resource
GET    /api/tenders/{id}      # Get specific resource
PATCH  /api/tenders/{id}      # Update resource
DELETE /api/tenders/{id}      # Delete resource

# Nested resources
GET    /api/tenders/{id}/documents     # Related resources
POST   /api/tenders/{id}/comments      # Create related

# Actions on resources  
POST   /api/tenders/{id}/transition    # State changes
POST   /api/documents/{id}/ocr         # Trigger processing
```

### API Response Format
```typescript
// Successful response
interface APIResponse<T> {
  success: true;
  data: T;
  meta?: {
    timestamp: string;
    requestId: string;
  };
}

// Error response
interface APIError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  meta: {
    timestamp: string;
    requestId: string;
  };
}

// Paginated response
interface PaginatedResponse<T> {
  success: true;
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}
```

### Real-time Communication
```typescript
// WebSocket events for live updates
interface WebSocketEvents {
  'tender:updated': TenderUpdateEvent;
  'document:uploaded': DocumentUploadEvent;  
  'comment:added': CommentAddedEvent;
  'notification:new': NotificationEvent;
  'user:presence': UserPresenceEvent;
}
```

## Performance Architecture

### Frontend Performance
- **Code Splitting**: Dynamic imports for route-based splitting
- **Image Optimization**: Next.js Image component with WebP
- **Bundle Optimization**: Tree shaking and minification
- **Caching**: React Query for server state caching
- **Prefetching**: Link prefetching for critical routes
- **Progressive Enhancement**: Works without JavaScript

### Backend Performance
- **Database Indexing**: Strategic indexes on query patterns
- **Connection Pooling**: Efficient database connections
- **Caching Strategy**: Redis for frequently accessed data
- **Background Jobs**: Non-blocking async processing
- **Response Compression**: Gzip/Brotli compression
- **Query Optimization**: N+1 prevention with Prisma

### Database Performance
```sql
-- Key indexes for performance
CREATE INDEX idx_tenders_tenant_status ON tenders(tenantId, status);
CREATE INDEX idx_tenders_deadline ON tenders(deadline) WHERE deadline IS NOT NULL;
CREATE INDEX idx_documents_tender_type ON documents(tenderId, type);
CREATE INDEX idx_audit_logs_tenant_timestamp ON audit_logs(tenantId, timestamp);

-- Full-text search indexes
CREATE INDEX tenders_search_idx ON tenders 
  USING GIN(to_tsvector('english', title || ' ' || COALESCE(description, '')));
```

### Caching Strategy
```typescript
// Cache hierarchy
interface CacheStrategy {
  browser: {
    static: '1 year',      // CSS, JS, images
    api: '5 minutes',      // API responses
  };
  cdn: {
    static: 'forever',     // Immutable assets
    api: '1 minute',       // Dynamic content
  };
  redis: {
    sessions: '24 hours',  // User sessions
    queries: '5 minutes',  # Expensive queries
    aggregates: '1 hour',  // Analytics data
  };
}
```

## Scalability Considerations

### Horizontal Scaling
- **Stateless API**: Can run multiple instances
- **Database Read Replicas**: Separate read/write workloads
- **Redis Clustering**: Cache layer scaling
- **CDN Integration**: Global content distribution
- **Load Balancing**: Request distribution

### Vertical Scaling
- **Database**: Connection pooling, query optimization
- **API Server**: Memory management, worker processes
- **File Storage**: Distributed storage (S3/MinIO)
- **Background Jobs**: Queue scaling with BullMQ

### Monitoring and Observability
```typescript
// Health check endpoints
GET /health              # Basic health check
GET /health/database     # Database connectivity
GET /health/cache        # Redis connectivity  
GET /health/storage      # File storage connectivity
GET /metrics            # Prometheus metrics
```

## Deployment Architecture

### Development Environment
```yaml
# docker-compose.yml
services:
  postgres:   # Development database
  redis:      # Cache and job queue
  minio:      # Local file storage
  mailhog:    # Email testing
```

### Production Environment
```yaml
# docker-compose.prod.yml  
services:
  api:           # Application server (multiple replicas)
  web:           # Static file serving (Nginx)
  postgres:      # Production database (external)
  redis:         # Production cache (external)
  # External services:
  # - AWS S3 for file storage
  # - AWS SES for email
  # - CloudFlare for CDN
```

### CI/CD Pipeline
```yaml
# Continuous Integration
stages:
  - test:       # Unit, integration, e2e tests
  - lint:       # Code quality checks  
  - security:   # Security scanning
  - build:      # Docker image creation
  - deploy:     # Environment deployment

# Deployment Strategy
strategy: blue-green   # Zero-downtime deployments
rollback: automatic    # Health check failures
monitoring: real-time  # Application metrics
```

## Error Handling Strategy

### Error Categories
1. **Client Errors (4xx)**: Invalid requests, authentication
2. **Server Errors (5xx)**: Application bugs, service outages  
3. **Business Logic Errors**: Domain-specific validation failures
4. **Infrastructure Errors**: Database, cache, storage failures

### Error Response Patterns
```typescript
// Validation error
{
  success: false,
  error: {
    code: 'VALIDATION_ERROR',
    message: 'Invalid input data',
    details: {
      fields: [
        { field: 'email', message: 'Invalid email format' },
        { field: 'password', message: 'Password too short' }
      ]
    }
  }
}

// Authentication error  
{
  success: false,
  error: {
    code: 'AUTHENTICATION_ERROR',
    message: 'Invalid or expired token'
  }
}

// Business logic error
{
  success: false,
  error: {
    code: 'TENDER_ALREADY_SUBMITTED', 
    message: 'Cannot modify submitted tender',
    details: { tenderId: 'uuid', status: 'SUBMITTED' }
  }
}
```

## Future Architecture Considerations

### Microservices Migration
- **Current**: Modular monolith
- **Future**: Extract domains to separate services
- **Benefits**: Independent scaling, technology diversity
- **Challenges**: Distributed data management

### Event-Driven Architecture
- **Current**: Direct API calls  
- **Future**: Event streaming with message queues
- **Benefits**: Loose coupling, better resilience
- **Implementation**: Apache Kafka or AWS EventBridge

### Global Distribution
- **Current**: Single region deployment
- **Future**: Multi-region with data replication
- **Benefits**: Lower latency, disaster recovery
- **Challenges**: Data consistency, compliance

---

This architecture provides a solid foundation for the TenderFlow platform while maintaining flexibility for future growth and evolution.