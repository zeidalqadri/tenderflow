# 🏢 TenderFlow - Professional Tender Management Platform

[![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)](https://typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14.0-black?logo=next.js)](https://nextjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4.0-green?logo=fastify)](https://fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5.0-indigo?logo=prisma)](https://prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue?logo=postgresql)](https://postgresql.org/)

TenderFlow is a comprehensive tender management platform that streamlines the entire tender lifecycle from discovery to outcome tracking. Built with modern technologies and designed for scalability, it provides teams with powerful automation, collaboration tools, and analytical insights.

## 🎯 Features

### Core Workflow
- **📥 Smart Inbox** - Automated tender scraping and organization
- **✅ AI Validation** - Intelligent data normalization and field completion  
- **🏷️ Auto-Categorization** - ML-powered tagging and qualification
- **🔔 Real-time Alerts** - Configurable notifications and monitoring
- **📄 Document Management** - OCR processing and version control
- **💼 Bid Workspace** - Collaborative proposal development
- **📤 Submission Portal** - Multi-channel submission with tracking
- **🏆 Outcome Management** - Win/loss analysis and learning
- **📊 Analytics Dashboard** - Performance metrics and forecasting

### Advanced Capabilities
- **Multi-tenant Architecture** with complete isolation
- **Role-based Access Control** (Owner/Contributor/Viewer per tender)
- **State Machine Workflow** with audit trail
- **OCR Document Processing** with Tesseract.js
- **Real-time Collaboration** with WebSocket support
- **Background Job Processing** with BullMQ
- **Comprehensive API** with OpenAPI documentation
- **Enterprise Security** with JWT authentication

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    TENDERFLOW ARCHITECTURE                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Frontend (Next.js 14)     Backend (Fastify)               │
│  ┌─────────────────┐       ┌─────────────────┐              │
│  │ • React 18      │◄────► │ • TypeScript    │              │
│  │ • Tailwind CSS  │       │ • Prisma ORM    │              │
│  │ • Zustand       │       │ • JWT Auth      │              │
│  │ • React Query   │       │ • WebSocket     │              │
│  │ • Radix UI      │       │ • BullMQ        │              │
│  └─────────────────┘       └─────────────────┘              │
│           │                          │                      │
│           └──────────────────────────┼──────────────────────┘
│                                      │
│  ┌─────────────────────────────────────────────────────────┐
│  │                 INFRASTRUCTURE                           │
│  ├─────────────────────────────────────────────────────────┤
│  │ PostgreSQL 15    Redis 7    MinIO S3    MailHog        │
│  │ ┌─────────────┐ ┌─────────┐ ┌─────────┐ ┌─────────────┐ │
│  │ │ • Database  │ │ • Cache │ │ • Files │ │ • Email     │ │
│  │ │ • Multi-    │ │ • Queue │ │ • OCR   │ │ • Testing   │ │
│  │ │   tenant    │ │ • Jobs  │ │ • Docs  │ │ • Dev Mode  │ │
│  │ └─────────────┘ └─────────┘ └─────────┘ └─────────────┘ │
│  └─────────────────────────────────────────────────────────┘
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- **Node.js** 20+ and npm 9+
- **Docker** and Docker Compose
- **Git** for version control

### 1. Clone and Setup
```bash
git clone <repository-url>
cd sustender
npm install
```

### 2. Start Infrastructure
```bash
# Start all services (PostgreSQL, Redis, MinIO, MailHog)
npm run docker:up

# Verify services are running
npm run docker:logs
```

### 3. Initialize Database
```bash
# Generate Prisma client
npm run db:generate

# Run database migrations
npm run db:migrate

# Load seed data
cd apps/api && npx tsx prisma/seed.ts
```

### 4. Start Development Servers
```bash
# Start all services in development mode
npm run dev

# Or start individually:
cd apps/api && npm run dev    # API server on :3001
cd apps/web && npm run dev    # Frontend on :8357
```

### 5. Access the Application
- **Frontend**: http://localhost:8357
- **API Health**: http://localhost:3001/health
- **MinIO Console**: http://localhost:9001 (admin/password123)
- **MailHog UI**: http://localhost:8025
- **Database**: localhost:5432 (tenderflow/tenderflow123)

## 📊 Database Schema

The system uses a comprehensive PostgreSQL schema with 15+ tables supporting the complete tender lifecycle:

```sql
Core Entities:
├── tenants           # Multi-tenant isolation
├── users            # User management with roles
├── tenders          # Central tender data
├── tender_assignments # Role-based tender access
├── documents        # File management with S3
├── bids             # Collaborative proposals
├── submissions      # Portal integration
├── tender_validations # AI scoring
├── state_transitions  # Workflow audit trail
├── comments         # Team collaboration
├── notifications    # Real-time alerts
├── audit_logs       # Complete audit trail
├── system_config    # Platform settings
├── job_queue        # Background processing
└── api_keys         # Integration management
```

### Sample Data Included
- **5 Test Users** across 2 tenants with different roles
- **5 Sample Tenders** with realistic project data ($985K total value)
- **Complete Workflow Examples** showing all states
- **Rich Supporting Data** (documents, bids, comments, notifications)

## 🎨 UI Components

TenderFlow uses a modern design system built with:
- **Radix UI** - Accessible component primitives
- **Tailwind CSS** - Utility-first styling
- **Lucide Icons** - Consistent iconography
- **Custom Components** - Domain-specific interfaces

### Design Tokens
```css
Colors: Primary (blue), Secondary (gray), Success (green), Warning (orange), Error (red)
Typography: Inter font family with 5 weight variations
Spacing: 4px base unit with consistent scale
Shadows: 3 elevation levels for depth
Animations: Smooth transitions with reduced motion support
```

## 🔌 API Reference

The TenderFlow API provides RESTful endpoints for all operations:

### Authentication
```http
POST /api/auth/login     # User authentication
POST /api/auth/refresh   # Token refresh  
GET  /api/auth/me        # Current user info
POST /api/auth/logout    # Session termination
```

### Tenders
```http
GET    /api/tenders           # List with filtering/pagination
POST   /api/tenders           # Create new tender
GET    /api/tenders/{id}      # Tender details
PATCH  /api/tenders/{id}      # Update tender
DELETE /api/tenders/{id}      # Archive tender
POST   /api/tenders/{id}/transition  # State changes
```

### Documents
```http
GET    /api/tenders/{id}/documents     # List documents
POST   /api/tenders/{id}/documents     # Upload file
GET    /api/documents/{id}             # Download file
DELETE /api/documents/{id}             # Delete file
POST   /api/documents/{id}/ocr         # Trigger OCR
```

### Real-time Updates
```javascript
// WebSocket events for live collaboration
socket.on('tender:updated', (data) => { /* Handle update */ })
socket.on('document:uploaded', (data) => { /* Handle upload */ })
socket.on('comment:added', (data) => { /* Handle comment */ })
```

## 🧪 Testing

### Test Accounts
```
Admin:     admin@techcorp.com (password: admin123)
Member:    john.smith@techcorp.com (password: member123)
Viewer:    viewer@techcorp.com (password: viewer123)
```

### Running Tests
```bash
# Unit tests
npm run test:unit

# Integration tests  
npm run test:integration

# E2E tests
npm run test:e2e

# All tests with coverage
npm run test:coverage

# Database tests
npm run test:db

# Security tests
npm run test:security

# Performance tests
npm run test:performance
```

## 📦 Project Structure

```
tenderflow/
├── apps/
│   ├── api/                 # Fastify backend
│   │   ├── src/
│   │   │   ├── routes/      # API endpoints
│   │   │   ├── plugins/     # Fastify plugins  
│   │   │   ├── schemas/     # Validation schemas
│   │   │   └── generated/   # Prisma client
│   │   └── prisma/
│   │       ├── schema.prisma # Database schema
│   │       └── seed.ts      # Seed data
│   └── web/                # Next.js frontend
│       ├── src/
│       │   ├── app/        # App Router pages
│       │   ├── components/ # UI components
│       │   ├── hooks/      # Custom hooks
│       │   ├── lib/        # Utilities
│       │   └── stores/     # State management
│       └── public/         # Static assets
├── packages/
│   ├── shared/             # Shared types/utilities
│   └── ui/                 # Component library
├── docs/                   # Documentation
└── docker-compose.yml      # Infrastructure
```

## 🔧 Configuration

### Environment Variables

**Backend (.env)**
```env
# Database
DATABASE_URL="postgresql://tenderflow:tenderflow123@localhost:5432/tenderflow"
REDIS_URL="redis://localhost:6379"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-in-production"
JWT_REFRESH_SECRET="your-super-secret-refresh-jwt-key-change-in-production"

# Storage
MINIO_ENDPOINT="localhost"
MINIO_PORT="9000"
MINIO_ACCESS_KEY="[SECURE_CREDENTIAL]"
MINIO_SECRET_KEY="[SECURE_CREDENTIAL]"

# Features
ENABLE_OCR="true"
ENABLE_RECEIPT_PARSING="true"
MAX_FILE_SIZE="50000000"
```

**Frontend (.env.local)**
```env
NEXT_PUBLIC_API_URL="http://localhost:3001"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
```

### Docker Services
```yaml
Services:
  postgres:  Database with persistent volume
  redis:     Cache and job queue  
  minio:     S3-compatible storage
  mailhog:   Email testing interface
```

## 🔐 Security Features

- **JWT Authentication** with refresh tokens
- **Role-based Access Control** at API and UI levels
- **Multi-tenant Isolation** with data segregation
- **Input Validation** using Zod schemas
- **SQL Injection Protection** via Prisma ORM
- **File Upload Security** with type/size validation
- **Audit Logging** for all operations
- **Rate Limiting** on API endpoints

## 🚀 Deployment

### Production Checklist
- [ ] Update JWT secrets to secure values
- [ ] Configure production database
- [ ] Set up SSL certificates
- [ ] Configure file storage (AWS S3/compatible)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy
- [ ] Set up CI/CD pipeline

### Docker Production
```bash
# Build production images
docker-compose -f docker-compose.prod.yml build

# Deploy with production configuration  
docker-compose -f docker-compose.prod.yml up -d
```

## 📈 Performance

### Optimization Features
- **Database Indexing** on frequently queried fields
- **Connection Pooling** for database efficiency
- **Redis Caching** for frequently accessed data
- **Background Processing** for heavy operations
- **Image Optimization** with Next.js Image component
- **Bundle Splitting** for faster page loads
- **Server-Side Rendering** for SEO and performance

### Monitoring
- Application metrics via Prometheus
- Error tracking with built-in logging
- Performance monitoring dashboards
- Database query optimization
- Real-time system health checks

## 🤝 Contributing

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** changes (`git commit -m 'Add amazing feature'`)
4. **Push** to branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Use Prettier for code formatting
- Write tests for new features
- Update documentation for API changes
- Follow semantic commit messages

## 📄 License

This project is licensed under the MIT License - see the [LICENSE.md](LICENSE.md) file for details.

## 🆘 Support

- **Documentation**: [docs/](docs/) folder
- **Issues**: GitHub Issues
- **Discussions**: GitHub Discussions
- **Email**: support@tenderflow.com

---

Built with ❤️ by the TenderFlow team. Empowering procurement teams worldwide.