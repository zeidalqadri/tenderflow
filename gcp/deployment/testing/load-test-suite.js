/**
 * TenderFlow Load Testing Suite
 * Validates system performance under 10,000+ concurrent users
 * Government SLA compliance testing (99.9% uptime, <2s response time)
 */

const k6 = require('k6');
const http = require('k6/http');
const ws = require('k6/ws');
const check = require('k6/check');
const { Rate, Counter, Trend } = require('k6/metrics');

// Custom metrics for TenderFlow business logic
const authSuccessRate = new Rate('auth_success_rate');
const tenderAPIRate = new Rate('tender_api_success_rate');
const documentUploadRate = new Rate('document_upload_success_rate');
const websocketConnectionRate = new Rate('websocket_connection_rate');
const businessOperationDuration = new Trend('business_operation_duration');

const authFailures = new Counter('auth_failures');
const apiErrors = new Counter('api_errors');
const websocketErrors = new Counter('websocket_errors');

// Test configuration
const BASE_URL = __ENV.BASE_URL || 'https://api.tenderflow.app';
const WS_URL = __ENV.WS_URL || 'wss://ws.tenderflow.app';

// Test scenarios for different load patterns
export const options = {
  scenarios: {
    // Scenario 1: Normal business hours load
    normal_load: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 100 },   // Ramp up to 100 users
        { duration: '5m', target: 100 },   // Stay at 100 users
        { duration: '2m', target: 200 },   // Ramp up to 200 users
        { duration: '5m', target: 200 },   // Stay at 200 users
        { duration: '2m', target: 0 },     // Ramp down
      ],
    },

    // Scenario 2: Peak tender submission period
    peak_submission_load: {
      executor: 'ramping-vus',
      startTime: '20m',
      startVUs: 0,
      stages: [
        { duration: '1m', target: 500 },   // Rapid ramp to 500 users
        { duration: '10m', target: 1000 }, // Scale to 1000 users
        { duration: '5m', target: 1000 },  // Sustain peak load
        { duration: '2m', target: 0 },     // Ramp down
      ],
    },

    // Scenario 3: Stress test for 10,000+ users
    stress_test: {
      executor: 'ramping-vus',
      startTime: '40m',
      startVUs: 0,
      stages: [
        { duration: '5m', target: 2000 },  // Ramp to 2000
        { duration: '5m', target: 5000 },  // Ramp to 5000
        { duration: '5m', target: 8000 },  // Ramp to 8000
        { duration: '10m', target: 10000 }, // Ramp to 10,000 users
        { duration: '10m', target: 10000 }, // Sustain 10,000 users
        { duration: '5m', target: 5000 },  // Gradual ramp down
        { duration: '5m', target: 1000 },  // Continue ramp down
        { duration: '2m', target: 0 },     // Complete shutdown
      ],
    },

    // Scenario 4: WebSocket real-time connections
    websocket_load: {
      executor: 'constant-vus',
      vus: 500,
      duration: '30m',
      exec: 'websocket_test',
    },

    // Scenario 5: API health checks (government monitoring)
    health_monitoring: {
      executor: 'constant-arrival-rate',
      rate: 10, // 10 requests per second
      timeUnit: '1s',
      duration: '60m',
      preAllocatedVUs: 5,
      maxVUs: 20,
      exec: 'health_check_test',
    },
  },

  // SLA thresholds for government compliance
  thresholds: {
    // 99.9% availability requirement
    http_req_failed: ['rate<0.001'], // <0.1% error rate
    
    // Response time requirements
    http_req_duration: [
      'p(95)<2000',  // 95% of requests under 2s
      'p(99)<5000',  // 99% of requests under 5s
    ],
    
    // Business-specific SLAs
    auth_success_rate: ['rate>0.999'],      // 99.9% auth success
    tender_api_success_rate: ['rate>0.995'], // 99.5% tender operations
    websocket_connection_rate: ['rate>0.99'], // 99% WebSocket success
    
    // Custom business metrics
    business_operation_duration: ['p(90)<3000'], // 90% under 3s
    
    // Error thresholds
    auth_failures: ['count<100'],      // Max 100 auth failures
    api_errors: ['count<50'],         // Max 50 API errors
    websocket_errors: ['count<25'],   // Max 25 WebSocket errors
  },
};

// Test data for realistic load simulation - Load from environment variables
const TEST_USERS = JSON.parse(__ENV.TEST_USERS || JSON.stringify([
  { email: 'contractor1@test.com', password: 'TestPass123!' },
  { email: 'govofficial1@test.com', password: 'TestPass123!' },
  { email: 'procurement1@test.com', password: 'TestPass123!' },
  // Add more test users as needed
]));

// Validate that test credentials are provided
if (!__ENV.TEST_USERS && (__ENV.ENVIRONMENT === 'production' || __ENV.ENVIRONMENT === 'staging')) {
  throw new Error('TEST_USERS environment variable must be provided for non-development environments');
}

const TENDER_TEMPLATES = [
  {
    title: 'Road Construction Project Phase 1',
    description: 'Major highway construction project',
    category: 'construction',
    budget: 5000000,
    deadline: '2024-12-31',
  },
  {
    title: 'IT Infrastructure Upgrade',
    description: 'Government IT modernization project',
    category: 'technology',
    budget: 2000000,
    deadline: '2024-06-30',
  },
  // Add more tender templates
];

// Utility functions
function getRandomUser() {
  return TEST_USERS[Math.floor(Math.random() * TEST_USERS.length)];
}

function getRandomTender() {
  return TENDER_TEMPLATES[Math.floor(Math.random() * TENDER_TEMPLATES.length)];
}

function authenticateUser() {
  const user = getRandomUser();
  const loginPayload = JSON.stringify({
    email: user.email,
    password: user.password,
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
    },
  };

  const response = http.post(`${BASE_URL}/auth/login`, loginPayload, params);
  
  const success = check(response, {
    'authentication successful': (r) => r.status === 200,
    'response time < 2s': (r) => r.timings.duration < 2000,
    'returns valid token': (r) => r.json('data.accessToken') !== undefined,
  });

  authSuccessRate.add(success);
  
  if (!success) {
    authFailures.add(1);
    return null;
  }

  return response.json('data.accessToken');
}

// Main load test function
export default function () {
  // Step 1: Authentication
  const token = authenticateUser();
  if (!token) {
    return; // Skip this iteration if auth failed
  }

  const authHeaders = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };

  // Step 2: Dashboard/Health Check
  const healthResponse = http.get(`${BASE_URL}/health`, {
    headers: authHeaders,
  });

  check(healthResponse, {
    'health check successful': (r) => r.status === 200,
    'health response time < 1s': (r) => r.timings.duration < 1000,
  });

  // Step 3: Tender Operations (Core Business Logic)
  const startTime = Date.now();
  
  // List tenders
  const tendersResponse = http.get(`${BASE_URL}/api/tenders?page=1&limit=20`, {
    headers: authHeaders,
  });

  const tendersSuccess = check(tendersResponse, {
    'tenders list successful': (r) => r.status === 200,
    'tenders response time < 2s': (r) => r.timings.duration < 2000,
    'returns tender data': (r) => r.json('data').length !== undefined,
  });

  tenderAPIRate.add(tendersSuccess);

  // Create a new tender (20% of users)
  if (Math.random() < 0.2) {
    const tenderTemplate = getRandomTender();
    const createTenderPayload = JSON.stringify(tenderTemplate);

    const createResponse = http.post(`${BASE_URL}/api/tenders`, createTenderPayload, {
      headers: authHeaders,
    });

    const createSuccess = check(createResponse, {
      'tender creation successful': (r) => r.status === 201,
      'create response time < 3s': (r) => r.timings.duration < 3000,
    });

    tenderAPIRate.add(createSuccess);

    if (!createSuccess) {
      apiErrors.add(1);
    }
  }

  // Document operations (30% of users)
  if (Math.random() < 0.3) {
    // Simulate document upload preparation
    const docPresignResponse = http.post(`${BASE_URL}/api/documents/presign`, 
      JSON.stringify({
        filename: 'test-document.pdf',
        mimeType: 'application/pdf',
        size: 1024000, // 1MB
        type: 'tender_document',
      }), {
        headers: authHeaders,
      });

    const docSuccess = check(docPresignResponse, {
      'document presign successful': (r) => r.status === 200,
      'presign response time < 2s': (r) => r.timings.duration < 2000,
    });

    documentUploadRate.add(docSuccess);

    if (!docSuccess) {
      apiErrors.add(1);
    }
  }

  // User profile operations (10% of users)
  if (Math.random() < 0.1) {
    const profileResponse = http.get(`${BASE_URL}/api/users/profile`, {
      headers: authHeaders,
    });

    check(profileResponse, {
      'profile fetch successful': (r) => r.status === 200,
      'profile response time < 1s': (r) => r.timings.duration < 1000,
    });
  }

  // Record overall business operation duration
  const operationDuration = Date.now() - startTime;
  businessOperationDuration.add(operationDuration);

  // Step 4: Simulate user think time
  k6.sleep(Math.random() * 3 + 1); // 1-4 seconds think time
}

// WebSocket load testing
export function websocket_test() {
  const token = authenticateUser();
  if (!token) {
    return;
  }

  const wsUrl = `${WS_URL}/socket.io/?EIO=4&transport=websocket&token=${token}`;
  
  const response = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', function () {
      console.log('WebSocket connection established');
      
      // Join a tender room (simulate real-time tender monitoring)
      socket.send(JSON.stringify({
        type: 'join:tender',
        data: { tenderId: 'test-tender-123' }
      }));

      // Send periodic presence updates
      const presenceInterval = setInterval(() => {
        socket.send(JSON.stringify({
          type: 'presence:update',
          data: { status: 'online', location: { page: 'tender', tenderId: 'test-tender-123' } }
        }));
      }, 30000); // Every 30 seconds

      // Listen for real-time events
      socket.on('message', function (message) {
        const data = JSON.parse(message);
        console.log('Received message:', data.type);
      });

      // Keep connection alive for test duration
      socket.setTimeout(() => {
        clearInterval(presenceInterval);
        socket.close();
      }, 300000); // 5 minutes
    });

    socket.on('close', function () {
      console.log('WebSocket connection closed');
    });

    socket.on('error', function (e) {
      console.log('WebSocket error:', e);
      websocketErrors.add(1);
    });
  });

  const wsSuccess = check(response, {
    'websocket connection established': (r) => r && r.status === 101,
  });

  websocketConnectionRate.add(wsSuccess);
}

// Health check monitoring test
export function health_check_test() {
  const healthResponse = http.get(`${BASE_URL}/health`);
  
  check(healthResponse, {
    'health check responds': (r) => r.status === 200,
    'health check fast': (r) => r.timings.duration < 500,
    'health status healthy': (r) => r.json('status') === 'healthy',
  });

  // WebSocket health check
  const wsHealthResponse = http.get(`${WS_URL}/health/websocket`);
  
  check(wsHealthResponse, {
    'websocket health responds': (r) => r.status === 200,
    'websocket health fast': (r) => r.timings.duration < 500,
  });
}

// Setup function (runs once at start)
export function setup() {
  console.log('Starting TenderFlow Load Test Suite');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`WebSocket URL: ${WS_URL}`);
  console.log('Test will validate:');
  console.log('- 99.9% availability (government SLA)');
  console.log('- Response times <2s (95th percentile)');
  console.log('- 10,000+ concurrent user capacity');
  console.log('- Real-time WebSocket functionality');
  console.log('- Business operation performance');
  
  // Verify test environment is ready
  const healthCheck = http.get(`${BASE_URL}/health`);
  if (healthCheck.status !== 200) {
    throw new Error(`Test environment not ready. Health check failed: ${healthCheck.status}`);
  }
  
  console.log('✅ Test environment validated');
  return { timestamp: Date.now() };
}

// Teardown function (runs once at end)
export function teardown(data) {
  console.log('Load test completed');
  console.log(`Test duration: ${(Date.now() - data.timestamp) / 1000}s`);
  console.log('Review test results for:');
  console.log('- SLA compliance (99.9% availability)');
  console.log('- Response time targets (<2s)');
  console.log('- Error rates and patterns');
  console.log('- WebSocket connection stability');
  console.log('- Resource utilization during peak load');
}

// Export configuration for CI/CD integration
export const testConfig = {
  name: 'TenderFlow GCP Load Test Suite',
  version: '1.0.0',
  sla: {
    availability: '99.9%',
    responseTime: '2s (95th percentile)',
    maxConcurrentUsers: 10000,
    errorRate: '<0.1%',
  },
  compliance: {
    standard: 'Government SLA Requirements',
    auditRequired: true,
    reportingRequired: true,
  },
};

// Results analysis helper
export function analyzeResults(results) {
  const analysis = {
    availability: (1 - results.http_req_failed.rate) * 100,
    responseTimeP95: results.http_req_duration.p95,
    responseTimeP99: results.http_req_duration.p99,
    authSuccessRate: results.auth_success_rate.rate * 100,
    websocketSuccessRate: results.websocket_connection_rate.rate * 100,
    totalErrors: results.api_errors.count + results.auth_failures.count + results.websocket_errors.count,
  };

  // Government SLA compliance check
  analysis.slaCompliant = 
    analysis.availability >= 99.9 &&
    analysis.responseTimeP95 <= 2000 &&
    analysis.authSuccessRate >= 99.9 &&
    analysis.totalErrors < 100;

  return analysis;
}