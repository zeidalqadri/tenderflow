-- Test database initialization script for TenderFlow
-- This script creates multiple test databases for different testing scenarios

-- Main test database (already created by POSTGRES_DB)
-- CREATE DATABASE tenderflow_test;

-- Integration test database
CREATE DATABASE tenderflow_integration_test;

-- E2E test database
CREATE DATABASE tenderflow_e2e_test;

-- Performance test database
CREATE DATABASE tenderflow_performance_test;

-- Grant permissions to test user
GRANT ALL PRIVILEGES ON DATABASE tenderflow_test TO test_user;
GRANT ALL PRIVILEGES ON DATABASE tenderflow_integration_test TO test_user;
GRANT ALL PRIVILEGES ON DATABASE tenderflow_e2e_test TO test_user;
GRANT ALL PRIVILEGES ON DATABASE tenderflow_performance_test TO test_user;

-- Connect to each database and set up extensions
\c tenderflow_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\c tenderflow_integration_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\c tenderflow_e2e_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

\c tenderflow_performance_test;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";