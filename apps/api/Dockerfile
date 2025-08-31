# Multi-stage Dockerfile for TenderFlow API

# Stage 1: Build stage
FROM node:20-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY apps/api/package*.json ./apps/api/
COPY packages/shared/package*.json ./packages/shared/

# Install dependencies
RUN npm ci --only=production --ignore-scripts

# Copy source code
COPY apps/api/ ./apps/api/
COPY packages/shared/ ./packages/shared/
COPY tsconfig.json ./
COPY turbo.json ./

# Generate Prisma client
WORKDIR /app/apps/api
RUN npx prisma generate

# Build the application
RUN npm run build

# Stage 2: Production stage
FROM node:20-alpine AS production

# Install security updates and required packages
RUN apk update && apk upgrade && \
    apk add --no-cache \
    dumb-init \
    curl \
    && rm -rf /var/cache/apk/*

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S tenderflow -u 1001

# Set working directory
WORKDIR /app

# Copy built application from builder stage
COPY --from=builder --chown=tenderflow:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=tenderflow:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=tenderflow:nodejs /app/apps/api/package*.json ./
COPY --from=builder --chown=tenderflow:nodejs /app/apps/api/prisma ./prisma

# Create necessary directories
RUN mkdir -p logs tmp && chown -R tenderflow:nodejs logs tmp

# Switch to non-root user
USER tenderflow

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/v1/health || exit 1

# Use dumb-init to handle signals properly
ENTRYPOINT ["dumb-init", "--"]

# Start the application
CMD ["node", "dist/index.js"]

# Metadata
LABEL maintainer="TenderFlow Team"
LABEL version="1.0.0"
LABEL description="TenderFlow API Service"