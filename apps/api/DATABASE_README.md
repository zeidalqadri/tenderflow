# TenderFlow Database Setup

Complete database schema and utilities for the TenderFlow tender management system.

## 📋 Overview

This database setup provides a comprehensive PostgreSQL schema with:
- **Multi-tenant architecture** with proper data isolation
- **Per-tender assignment roles** (owner/contributor/viewer)
- **Enhanced submission model** with parsed receipt metadata
- **Full audit trail** and state management
- **Soft-delete support** for data retention
- **Performance optimization** with proper indexing
- **Development tools** and utilities

## 🗃️ Schema Overview

### Core Models

#### **Tenant** 
Multi-tenant organization structure
- Isolated data per organization
- Configurable settings and features
- Subdomain-based routing

#### **User**
User management with role-based access
- Roles: `admin`, `member`, `viewer`
- Tenant-scoped permissions
- Activity tracking

#### **Tender**
Core tender management with workflow states
- States: `SCRAPED → VALIDATED → QUALIFIED → IN_BID → SUBMITTED → WON/LOST`
- Rich metadata and requirements storage
- External portal integration

#### **TenderAssignment**
Per-tender role assignments (from patch specification)
- Roles: `owner`, `contributor`, `viewer`
- Granular access control
- Assignment audit trail

#### **Bid**
Comprehensive bid management
- Structured bid components (technical, commercial, team)
- Timeline and methodology tracking
- Risk assessment and quality planning

#### **Submission**
Enhanced submission tracking with parsed metadata
- Multiple submission methods
- Receipt parsing and structured metadata storage
- Portal integration data

#### **Document**
File management with S3 integration
- Type-categorized documents
- Metadata extraction
- Full-text search support

### Supporting Models

- **TenderValidation**: Validation scoring and criteria
- **StateTransition**: Complete audit trail of status changes  
- **Comment**: Collaboration and communication
- **Notification**: Real-time notification system
- **AuditLog**: Comprehensive audit logging
- **SystemConfig**: Application configuration
- **JobQueue**: Background job management
- **ApiKey**: API access management

## 🚀 Quick Start

### 1. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Configure your database URL
DATABASE_URL="postgresql://postgres:password@localhost:5432/tenderflow_dev"
```

### 2. Start Development Services

```bash
# Start PostgreSQL, Redis, MinIO, and other services
docker-compose -f docker-compose.dev.yml up -d

# Verify services are running
docker-compose -f docker-compose.dev.yml ps
```

### 3. Initialize Database

```bash
# Install dependencies
npm install

# Initialize database with migrations and seed data
npm run db:init

# Or use the setup script for more control
npx tsx scripts/db-setup.ts init --seed
```

### 4. Verify Setup

```bash
# Run health check
npx tsx scripts/db-setup.ts health --verbose

# Check database statistics  
npx tsx scripts/db-setup.ts stats --tables --indexes
```

## 📝 Available Scripts

### Package.json Scripts
```bash
# Database operations
npm run db:generate    # Generate Prisma client
npm run db:push        # Push schema changes (development)
npm run db:migrate     # Run migrations (development)
npm run db:studio      # Open Prisma Studio
npm run db:seed        # Seed development data

# Development
npm run dev            # Start API server
npm run build          # Build for production
npm run test           # Run tests
```

### Database CLI Tool
```bash
# Initialize database
npx tsx scripts/db-setup.ts init [--seed] [--force]

# Migration management
npx tsx scripts/db-setup.ts migrate [--deploy]
npx tsx scripts/db-setup.ts seed [--environment dev]

# Health and monitoring
npx tsx scripts/db-setup.ts health [--verbose]
npx tsx scripts/db-setup.ts stats [--slow-queries] [--indexes] [--tables]

# Backup and restore
npx tsx scripts/db-setup.ts backup [--output path] [--compress]
npx tsx scripts/db-setup.ts restore --file backup.sql [--yes]

# Maintenance
npx tsx scripts/db-setup.ts maintenance [--vacuum] [--cleanup] [--archive] [--optimize]

# Reset (DESTRUCTIVE)
npx tsx scripts/db-setup.ts reset [--yes]
```

## 🔧 Configuration

### Environment Variables

#### Database Configuration
```env
DATABASE_URL="postgresql://username:password@host:port/database"
DATABASE_POOL_SIZE=10
DATABASE_CONNECTION_TIMEOUT=30000
```

#### Feature Flags
```env
FEATURE_DOCUMENT_PARSING=true
FEATURE_ADVANCED_ANALYTICS=true
FEATURE_API_ACCESS=true
FEATURE_REAL_TIME_NOTIFICATIONS=true
```

#### File Storage (MinIO/S3)
```env
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET_NAME=tenderflow-documents
```

### Prisma Configuration

The schema includes:
- **UUID primary keys** for all entities
- **Timestamps** (createdAt, updatedAt) on all models
- **Soft-delete support** with deletedAt fields
- **Comprehensive indexing** for query performance
- **Full-text search** indexes for PostgreSQL
- **Foreign key constraints** with proper cascading

## 🏗️ Architecture Patterns

### Multi-Tenancy
- **Tenant isolation** at the database level
- **Row-level security** through tenant filtering
- **Shared schema, isolated data** approach

### Access Control
- **Tenant-level roles**: admin, member, viewer
- **Per-tender assignments**: owner, contributor, viewer
- **Hierarchical permissions** with proper inheritance

### Audit Trail
- **Complete action tracking** (CREATE, UPDATE, DELETE, VIEW)
- **Before/after value storage** for changes
- **User and IP address logging**
- **Tenant-scoped audit logs**

### State Management
- **Explicit state transitions** with audit trail
- **Business rule enforcement** through application logic
- **State change notifications** and webhooks

## 📊 Performance Optimizations

### Indexing Strategy
- **Primary indexes** on all ID fields
- **Composite indexes** for common query patterns
- **Partial indexes** for active/non-deleted records
- **Full-text search indexes** for content search

### Query Optimization
- **Connection pooling** with configurable limits
- **Prepared statement caching**
- **Query performance monitoring**
- **Slow query identification**

### Caching Layers
- **Application-level caching** with Redis
- **Query result caching** for expensive operations  
- **Static data caching** with TTL
- **Cache invalidation** on data changes

## 🔐 Security Features

### Data Protection
- **Tenant data isolation** with validation
- **Soft-delete** for data retention
- **Audit logging** for compliance
- **Input validation** and sanitization

### Access Control
- **Role-based permissions** at tenant level
- **Resource-level access control** for tenders
- **API key management** with scoped permissions
- **Session management** with JWT tokens

## 📈 Monitoring and Maintenance

### Health Monitoring
```bash
# Basic health check
curl http://localhost:3001/api/health/db

# Detailed statistics
npx tsx scripts/db-setup.ts stats --verbose
```

### Performance Monitoring
- **Slow query detection** with configurable thresholds
- **Connection pool monitoring**
- **Index usage analysis**
- **Table size and growth tracking**

### Maintenance Tasks
```bash
# Run vacuum and analyze
npx tsx scripts/db-setup.ts maintenance --vacuum

# Clean up old audit logs (older than 7 years)
npx tsx scripts/db-setup.ts maintenance --cleanup

# Archive completed tenders (older than 1 year)
npx tsx scripts/db-setup.ts maintenance --archive
```

## 🧪 Development Workflow

### Schema Changes
1. **Modify** `prisma/schema.prisma`
2. **Generate migration**: `npm run db:migrate`
3. **Update client**: `npm run db:generate`
4. **Test changes**: `npm test`

### Adding New Models
1. **Define model** in schema.prisma
2. **Add relationships** and indexes
3. **Create repository** class if needed
4. **Update seed data** with sample records
5. **Add tests** for new functionality

### Testing
```bash
# Run all tests
npm test

# Test specific database operations
npm test -- --grep "database"

# Integration tests with real database
npm run test:integration
```

## 🔄 Migration Management

### Development Migrations
```bash
# Create and apply migration
npm run db:migrate

# Reset and reapply all migrations
npx tsx scripts/db-setup.ts reset --yes
npm run db:migrate
```

### Production Migrations
```bash
# Deploy migrations to production
npx tsx scripts/db-setup.ts migrate --deploy

# Verify deployment
npx tsx scripts/db-setup.ts health --verbose
```

### Rollback Strategy
```bash
# Backup before changes
npx tsx scripts/db-setup.ts backup --compress

# If rollback needed
npx tsx scripts/db-setup.ts restore --file backup.sql.gz --yes
```

## 📊 Seed Data

The seed script creates comprehensive test data:
- **3 tenants** with different configurations
- **15 users** across all tenants and roles
- **15 tenders** in various states with assignments
- **Complete workflow data** (bids, documents, submissions)
- **Audit trails** and state transitions
- **System configuration** with defaults

### Customizing Seed Data
Edit `src/database/seed.ts` to:
- **Modify tenant configurations**
- **Add more sample tenders**
- **Change user roles and assignments**
- **Update business logic scenarios**

## 🛠️ Utilities and Helpers

### Database Client
```typescript
import { prisma, transaction, healthCheck } from './src/database';

// Basic operations
const user = await prisma.user.findUnique({ where: { id } });

// Transactions
const result = await transaction(async (tx) => {
  const tender = await tx.tender.create({ data: tenderData });
  await tx.tenderAssignment.create({ 
    data: { tenderId: tender.id, userId, role: 'owner' }
  });
  return tender;
});

// Health monitoring
const health = await healthCheck();
```

### Repository Pattern
```typescript
import { TenderRepository } from './src/database/repositories';

const tenderRepo = new TenderRepository();

// Tenant-aware operations
const tenders = await tenderRepo.findManyByTenant(tenantId, {
  page: 1,
  limit: 25,
  search: 'construction',
  filters: { status: 'IN_BID' }
});
```

### Utility Classes
```typescript
import { 
  SearchUtils, 
  ValidationUtils, 
  AuditLogger,
  PerformanceMonitor 
} from './src/database/utils';

// Search and filtering
const conditions = SearchUtils.buildFilterConditions(filters);

// Validation
const isValid = ValidationUtils.validateUUID(id);

// Performance monitoring
const { result, duration } = await PerformanceMonitor.measureQuery(
  'complex-tender-query',
  () => complexQuery()
);
```

## 🚨 Troubleshooting

### Common Issues

#### Connection Issues
```bash
# Check if PostgreSQL is running
docker-compose -f docker-compose.dev.yml ps postgres

# Test connection manually
psql "postgresql://postgres:password@localhost:5432/tenderflow_dev"
```

#### Migration Failures
```bash
# Check migration status
npx prisma migrate status

# Reset and retry
npx tsx scripts/db-setup.ts reset --yes
npm run db:migrate
```

#### Performance Issues
```bash
# Check for slow queries
npx tsx scripts/db-setup.ts stats --slow-queries

# Analyze index usage  
npx tsx scripts/db-setup.ts stats --indexes

# Run maintenance
npx tsx scripts/db-setup.ts maintenance --optimize
```

### Getting Help

1. **Check logs**: Application and database logs for errors
2. **Run diagnostics**: Use the health check and stats commands
3. **Verify environment**: Ensure all environment variables are set
4. **Check services**: Ensure PostgreSQL, Redis, and MinIO are running
5. **Review schema**: Check for any manual schema modifications

## 📚 Additional Resources

- **Prisma Documentation**: https://www.prisma.io/docs/
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/
- **Multi-tenant Patterns**: Database design best practices
- **Performance Tuning**: PostgreSQL optimization guides

## 🤝 Contributing

When contributing database changes:
1. **Follow naming conventions** (snake_case for tables, camelCase for fields)
2. **Add proper indexes** for query performance  
3. **Include audit logging** for sensitive operations
4. **Update seed data** with relevant examples
5. **Add tests** for new database functionality
6. **Document changes** in migration comments

---

This database setup provides a robust, scalable foundation for the TenderFlow application with enterprise-grade features including multi-tenancy, comprehensive audit trails, and performance optimizations.