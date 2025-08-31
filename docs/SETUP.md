# 🛠️ TenderFlow Setup Guide

This guide will walk you through setting up the complete TenderFlow development environment.

## Prerequisites

### Required Software
- **Node.js 20+** - [Download from nodejs.org](https://nodejs.org/)
- **npm 9+** - Comes with Node.js
- **Docker Desktop** - [Download from docker.com](https://www.docker.com/products/docker-desktop/)
- **Git** - [Download from git-scm.com](https://git-scm.com/)

### Recommended Tools
- **VS Code** with TypeScript and Prisma extensions
- **Docker Desktop** for container management
- **Postman** or **Insomnia** for API testing
- **DBeaver** or **pgAdmin** for database management

## Installation Steps

### 1. Clone Repository
```bash
git clone <repository-url>
cd sustender
```

### 2. Install Dependencies
```bash
# Install all dependencies (takes 2-3 minutes)
npm install

# Verify installation
npm run type-check
```

### 3. Start Infrastructure Services
```bash
# Start Docker services (PostgreSQL, Redis, MinIO, MailHog)
npm run docker:up

# Wait for services to start (30-60 seconds)
# Check status:
docker ps

# Should show 4 running containers:
# - tenderflow-postgres
# - tenderflow-redis  
# - tenderflow-minio
# - tenderflow-mailhog
```

### 4. Initialize Database

#### Option A: Automated Setup (Recommended)
```bash
# Run complete database setup
cd apps/api
npm run db:setup
```

#### Option B: Manual Setup
```bash
cd apps/api

# Generate Prisma client
npx prisma generate

# Create database tables
npx prisma db push

# Load seed data (5 users, 5 tenders, full workflow examples)
npx tsx prisma/seed.ts
```

### 5. Start Development Servers

#### Option A: All Services
```bash
# Start both API and Web servers
npm run dev
```

#### Option B: Individual Services
```bash
# Terminal 1 - API Server
cd apps/api
npm run dev

# Terminal 2 - Web Server  
cd apps/web
npm run dev
```

### 6. Verify Installation
```bash
# Check API health
curl http://localhost:3001/health

# Should return: {"status":"ok","timestamp":"..."}

# Check database connection
curl http://localhost:3001/test/db

# Should return tenant count and connection status
```

## Service URLs

Once everything is running, you can access:

| Service | URL | Description |
|---------|-----|-------------|
| **TenderFlow Web** | http://localhost:8357 | Main application |
| **API Server** | http://localhost:3001 | Backend API |
| **MinIO Console** | http://localhost:9001 | File storage (admin/minioadmin) |
| **MailHog** | http://localhost:8025 | Email testing |
| **PostgreSQL** | localhost:5432 | Database (tenderflow/tenderflow123) |
| **Redis** | localhost:6379 | Cache/Queue |

## Test Accounts

Use these accounts to test the application:

| Email | Password | Role | Tenant |
|-------|----------|------|---------|
| admin@techcorp.com | admin123 | Admin | TechCorp Solutions |
| john.smith@techcorp.com | member123 | Member | TechCorp Solutions |
| emma.wilson@techcorp.com | member123 | Member | TechCorp Solutions |
| viewer@techcorp.com | viewer123 | Viewer | TechCorp Solutions |
| admin@globalconsulting.com | admin123 | Admin | Global Consulting |

## Configuration Files

### Environment Variables

The following files contain configuration:

**Root `.env`**
```env
# Database
DATABASE_URL="postgresql://tenderflow:tenderflow123@localhost:5432/tenderflow?schema=public"

# API URLs
API_BASE_URL="http://localhost:3001"
WEB_BASE_URL="http://localhost:8357"
```

**API `.env` (`apps/api/.env`)**
```env
# Database
DATABASE_URL="postgresql://tenderflow:tenderflow123@localhost:5432/tenderflow"

# Redis
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-jwt-key-change-in-production"

# Storage
MINIO_ENDPOINT="localhost"
MINIO_ACCESS_KEY="minioadmin"
MINIO_SECRET_KEY="minioadmin"

# Features
ENABLE_OCR="true"
ENABLE_RECEIPT_PARSING="true"
MAX_FILE_SIZE="50000000"
```

### Docker Services Configuration

**`docker-compose.yml`** defines:
- **PostgreSQL 15** - Main database
- **Redis 7** - Caching and job queue
- **MinIO** - S3-compatible file storage
- **MailHog** - Email testing in development

## Development Workflow

### Daily Development
```bash
# Start services (if not already running)
npm run docker:up

# Start development servers
npm run dev

# Your app is now running at:
# - Frontend: http://localhost:8357
# - API: http://localhost:3001
```

### Working with Database
```bash
# View database in browser
cd apps/api && npx prisma studio

# Reset database (careful - deletes all data!)
npx prisma db push --force-reset

# Reload seed data
npx tsx prisma/seed.ts

# Generate new migration
npx prisma migrate dev --name feature_name
```

### Code Quality
```bash
# Format all code
npm run format

# Check TypeScript types
npm run type-check

# Run linting
npm run lint

# Run all tests
npm run test
```

## Troubleshooting

### Common Issues

#### "Port already in use"
```bash
# Kill processes using required ports
sudo lsof -ti:3001,8357,5432,6379,9000,8025 | xargs kill -9

# Or use different ports in .env files
```

#### "Database connection failed"
```bash
# Check if PostgreSQL is running
docker ps | grep postgres

# Restart database service
docker-compose restart postgres

# Check database logs
docker-compose logs postgres
```

#### "Permission denied on database"
```bash
# Reset database with proper permissions
docker exec tenderflow-postgres psql -U postgres -c "
  DROP DATABASE IF EXISTS tenderflow;
  DROP USER IF EXISTS tenderflow;
  CREATE USER tenderflow WITH PASSWORD 'tenderflow123' CREATEDB;
  CREATE DATABASE tenderflow OWNER tenderflow;
"
```

#### "npm install fails"
```bash
# Clear npm cache
npm cache clean --force

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

#### "Prisma client not generated"
```bash
cd apps/api
npx prisma generate

# If still failing, delete and regenerate
rm -rf src/generated
npx prisma generate
```

### Service Logs
```bash
# View all service logs
npm run docker:logs

# View specific service logs
docker logs tenderflow-postgres
docker logs tenderflow-redis
docker logs tenderflow-minio
docker logs tenderflow-mailhog

# Follow logs in real-time
docker logs -f tenderflow-postgres
```

### Reset Everything
```bash
# Stop all services
npm run docker:down

# Remove all containers and volumes (DESTRUCTIVE!)
docker-compose down -v
docker system prune -f

# Start fresh
npm run docker:up
cd apps/api && npm run db:setup
```

## File Upload Testing

### MinIO Storage Setup
1. Open MinIO Console: http://localhost:9001
2. Login: `minioadmin` / `minioadmin`  
3. Verify buckets exist:
   - `tender-documents`
   - `user-uploads`
   - `system-backups`

### Test File Uploads
```bash
# Upload a test document via API
curl -X POST \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -F "file=@/path/to/document.pdf" \
  -F "type=RFP" \
  http://localhost:3001/api/tenders/TENDER_ID/documents
```

## Email Testing

### MailHog Setup
1. Open MailHog: http://localhost:8025
2. All emails sent by the application appear here
3. Test email functionality:
   - User registration emails
   - Deadline notifications  
   - Assignment notifications

## Production Deployment

### Environment Setup
1. **Update secrets** in production `.env` files
2. **Configure SSL** certificates
3. **Set up external database** (not Docker)
4. **Configure external storage** (AWS S3 or compatible)
5. **Set up monitoring** and logging
6. **Configure backup strategy**

### Build for Production
```bash
# Build all applications
npm run build

# Run production servers
npm start
```

### Docker Production
```bash
# Use production Docker Compose
docker-compose -f docker-compose.prod.yml up -d
```

## Next Steps

Once your environment is set up:

1. **Explore the UI** - Visit http://localhost:8357
2. **Test the API** - Use the test accounts to navigate
3. **Review documentation** - Check `/docs/` folder
4. **Run the test suite** - `npm run test`
5. **Check the mockups** - Open `/docs/mockups/index.html`

## Getting Help

- **Documentation**: Check `/docs/` folder
- **API Reference**: Visit http://localhost:3001/docs (when implemented)
- **Component Library**: Open `/docs/components.html`
- **Database Schema**: View `/docs/database/schema.html`

---

🎉 **Congratulations!** Your TenderFlow development environment is ready.