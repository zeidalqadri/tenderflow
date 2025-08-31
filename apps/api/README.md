# TenderFlow API

A comprehensive Fastify-based REST API for the TenderFlow tender management system, featuring multi-tenancy, role-based access control, and complete tender lifecycle management.

## 🚀 Features

- **Multi-tenant Architecture**: Complete tenant isolation with subdomain-based routing
- **JWT Authentication**: Secure token-based authentication with refresh tokens
- **Role-based Access Control**: Per-tender role enforcement (owner/contributor/viewer)
- **State Machine**: Tender state transitions with validation and audit trail
- **Document Management**: S3-based file storage with presigned URLs
- **Real-time Notifications**: WebSocket support for live updates
- **Comprehensive API**: Full CRUD operations for all resources
- **TypeScript**: Fully typed with Zod validation
- **Testing**: Complete test suite with mocking
- **Swagger Documentation**: Auto-generated API documentation

## 📋 Prerequisites

- Node.js 18+ 
- PostgreSQL 12+
- Redis 6+
- S3-compatible storage (AWS S3, MinIO, etc.)

## 🛠️ Installation

1. **Clone the repository**
```bash
git clone <repository-url>
cd sustender/apps/api
```

2. **Install dependencies**
```bash
npm install
```

3. **Set up environment variables**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Set up the database**
```bash
npm run db:generate
npm run db:migrate
npm run db:seed
```

5. **Start the server**
```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## 🏗️ Architecture

### Core Components

- **Server**: Fastify application with plugins and middleware
- **Plugins**: Modular authentication, authorization, and utilities
- **Routes**: RESTful API endpoints organized by resource
- **Schemas**: Zod validation schemas for type safety
- **Database**: Prisma ORM with PostgreSQL

### Plugin System

1. **Error Handler**: Structured error handling and logging
2. **JWT Authentication**: Token validation and user context
3. **Multi-tenant**: Tenant isolation and validation
4. **ACL**: Per-tender role-based access control
5. **Audit**: Comprehensive audit logging
6. **Validation**: Request/response validation with Zod

## 🔌 API Endpoints

### Authentication (`/api/v1/auth`)
- `POST /login` - Authenticate user
- `POST /refresh` - Refresh access token
- `POST /logout` - Logout user
- `POST /register` - Create tenant and admin user
- `GET /me` - Get current user info

### Tenders (`/api/v1/tenders`)
- `GET /` - List tenders with filtering/pagination
- `POST /` - Create new tender
- `GET /:id` - Get tender details
- `PUT /:id` - Update tender
- `DELETE /:id` - Soft delete tender
- `POST /:id/transition` - Transition tender state
- `GET /:id/history` - Get state transition history

### Assignments (`/api/v1/tenders/:tenderId/assignees`)
- `GET /` - List tender assignees
- `POST /` - Assign user to tender
- `POST /bulk` - Bulk assign users
- `PUT /:userId` - Update user role
- `DELETE /:userId` - Remove user from tender
- `POST /:userId/transfer-ownership` - Transfer ownership

### Permissions (`/api/v1/tenders/:tenderId/permissions`)
- `GET /` - Check user permissions
- `GET /:action` - Check specific permission
- `POST /bulk` - Bulk permission check
- `GET /accessible-tenders` - Get accessible tenders

### Documents (`/api/v1/documents`)
- `GET /` - List documents with filtering
- `POST /presign` - Get presigned upload URL
- `POST /confirm` - Confirm upload completion

### Bids (`/api/v1/bids`)
- `GET /:tenderId` - Get bid workspace
- `PUT /:tenderId` - Update bid data
- `POST /:tenderId/submit` - Submit bid

### Submissions (`/api/v1/submissions`)
- `GET /` - List submissions
- `POST /` - Create submission record
- `PUT /:id` - Update submission
- `POST /:id/parse-receipt` - Trigger receipt parsing

### Outcomes (`/api/v1/outcomes`)
- `POST /:tenderId/won` - Mark tender as WON
- `POST /:tenderId/lost` - Mark tender as LOST

### Alerts (`/api/v1/alerts`)
- `GET /` - List alert rules
- `POST /` - Create alert rule
- `GET /:id` - Get alert rule
- `PUT /:id` - Update alert rule
- `DELETE /:id` - Delete alert rule
- `POST /:id/test` - Test alert rule

### Exports (`/api/v1/exports`)
- `POST /request` - Request data export
- `GET /status/:exportId` - Check export status
- `GET /download/:exportId` - Download export file

## 🔒 Authentication & Authorization

### Authentication Flow
1. Login with email/password → receive JWT access + refresh tokens
2. Include `Authorization: Bearer <token>` header in requests
3. Refresh tokens when access token expires

### Multi-tenancy
- Specify tenant via `X-Tenant-ID` header or subdomain
- All data automatically filtered by tenant context
- Cross-tenant access prevented at database level

### Per-Tender Roles
- **Owner**: Full access (read/write/delete/manage assignees)
- **Contributor**: Read/write access, can transition states
- **Viewer**: Read-only access
- **Admin**: Bypass all role checks (tenant-scoped)

## 🗄️ Database Schema

### Core Models
- **Tenant**: Multi-tenant isolation
- **User**: System users with roles
- **Tender**: Main tender entities
- **TenderAssignment**: User-tender role mapping
- **Document**: File attachments
- **Bid**: Tender bid workspaces
- **Submission**: Submission tracking
- **StateTransition**: Audit trail for state changes
- **AuditLog**: Comprehensive audit logging

### State Machine
```
SCRAPED → VALIDATED → QUALIFIED → IN_BID → SUBMITTED → WON/LOST
    ↓         ↓          ↓          ↓         ↓
  ARCHIVED  ARCHIVED   ARCHIVED   ARCHIVED  ARCHIVED
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Run specific test suite
npm test auth
npm test tenders

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Test Structure
- **Unit Tests**: Individual function testing
- **Integration Tests**: API endpoint testing
- **Authorization Tests**: Role and permission testing
- **State Transition Tests**: Business logic validation

## 📚 API Documentation

Interactive Swagger documentation available at:
- Development: `http://localhost:3001/docs`
- Production: `https://api.tenderflow.com/docs`

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | Environment mode | `development` |
| `PORT` | Server port | `3001` |
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `JWT_SECRET` | JWT signing secret | Required |
| `REDIS_URL` | Redis connection string | Required |
| `S3_BUCKET` | S3 bucket name | Required |

See `.env.example` for complete list.

### Security Settings
- JWT tokens expire in 15 minutes
- Refresh tokens expire in 7 days
- Rate limiting: 100 requests/minute
- File upload limit: 50MB
- CORS configured for frontend domains

## 📊 Monitoring & Logging

### Structured Logging
- Request/response logging with correlation IDs
- Error tracking with stack traces
- Performance metrics and timings
- Security event logging

### Audit Trail
- All CRUD operations logged
- State transitions tracked
- User actions recorded with IP/user agent
- Tenant-scoped audit logs

## 🚀 Deployment

### Docker
```bash
# Build image
docker build -t tenderflow-api .

# Run container
docker run -p 3001:3001 --env-file .env tenderflow-api
```

### Production Checklist
- [ ] Set strong JWT secret
- [ ] Configure CORS for production domains  
- [ ] Set up SSL/TLS termination
- [ ] Configure Redis for sessions
- [ ] Set up S3 bucket with proper permissions
- [ ] Configure SMTP for notifications
- [ ] Set up monitoring and alerting
- [ ] Configure backup strategy
- [ ] Set up log aggregation

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

### Development Guidelines
- Follow TypeScript strict mode
- Add tests for new features
- Update API documentation
- Follow conventional commit format
- Ensure all tests pass

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 📞 Support

For support, email support@tenderflow.com or join our Slack channel.

---

Built with ❤️ using Fastify, TypeScript, and modern web technologies.