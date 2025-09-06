// Test script for TenderFlow backend setup
// This tests our core services without TypeScript compilation

const { spawn } = require('child_process');
const path = require('path');

console.log('🧪 Testing TenderFlow Backend Setup\n');

async function runTest(name, command, cwd = process.cwd()) {
  console.log(`🔍 Testing ${name}...`);
  
  return new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], { 
      cwd,
      stdio: 'pipe' 
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`✅ ${name}: PASSED`);
        if (stdout.trim()) {
          console.log(`   Output: ${stdout.trim().split('\n')[0]}...`);
        }
        resolve({ stdout, stderr, code });
      } else {
        console.log(`❌ ${name}: FAILED (code ${code})`);
        if (stderr.trim()) {
          console.log(`   Error: ${stderr.trim().split('\n')[0]}...`);
        }
        resolve({ stdout, stderr, code }); // Don't reject to continue testing
      }
    });
    
    // Set timeout
    setTimeout(() => {
      child.kill();
      console.log(`⏱️  ${name}: TIMEOUT (killed after 10s)`);
      resolve({ stdout, stderr, code: -1 });
    }, 10000);
  });
}

async function runAllTests() {
  const apiDir = path.join(__dirname, 'apps/api');
  
  console.log('📂 Working directory:', apiDir);
  console.log('');
  
  const tests = [
    {
      name: 'PostgreSQL Connection',
      command: 'psql -d tenderflow_dev -c "SELECT version();" -t',
    },
    {
      name: 'Redis Connection',
      command: 'redis-cli ping',
    },
    {
      name: 'Node.js & NPM',
      command: 'node --version && npm --version',
    },
    {
      name: 'Prisma Schema Validation',
      command: 'npx prisma validate',
      cwd: apiDir,
    },
    {
      name: 'Prisma Client Generation',
      command: 'npx prisma generate --schema=prisma/schema.prisma',
      cwd: apiDir,
    },
    {
      name: 'Database Connection Test',
      command: `node -r dotenv/config -e "
        const { prisma } = require('./src/generated/prisma');
        prisma.\\$queryRaw\\\`SELECT 1 as test\\\`.then(result => {
          console.log('✅ Database connected:', result);
          process.exit(0);
        }).catch(err => {
          console.error('❌ Database error:', err.message);
          process.exit(1);
        });
      "`,
      cwd: apiDir,
    },
    {
      name: 'Redis Test (ioredis)',
      command: `npx tsx -e "
        import Redis from 'ioredis';
        const redis = new Redis({ host: 'localhost', port: 6379, lazyConnect: true });
        try {
          await redis.connect();
          const pong = await redis.ping();
          console.log('✅ Redis connected:', pong);
          await redis.quit();
          process.exit(0);
        } catch (error) {
          console.error('❌ Redis error:', error.message);
          process.exit(1);
        }
      "`,
      cwd: apiDir,
    },
    {
      name: 'BullMQ Queue Test',
      command: `npx tsx -e "
        import { Queue } from 'bullmq';
        import Redis from 'ioredis';
        const redis = new Redis({ host: 'localhost', port: 6379, maxRetriesPerRequest: null });
        const queue = new Queue('test', { connection: redis });
        try {
          const job = await queue.add('test', { message: 'hello' });
          console.log('✅ BullMQ queue working, job ID:', job.id);
          await queue.close();
          await redis.quit();
          process.exit(0);
        } catch (error) {
          console.error('❌ BullMQ error:', error.message);
          process.exit(1);
        }
      "`,
      cwd: apiDir,
    },
    {
      name: 'Database Schema Tables',
      command: `node -r dotenv/config -e "
        const { prisma } = require('./src/generated/prisma');
        Promise.all([
          prisma.tenant.count(),
          prisma.user.count(),
          prisma.tender.count(),
          prisma.scrapingLog.count(),
          prisma.systemConfig.count(),
        ]).then(([tenants, users, tenders, logs, configs]) => {
          console.log('📊 Database contents:');
          console.log('  Tenants:', tenants);
          console.log('  Users:', users);
          console.log('  Tenders:', tenders);
          console.log('  Scraping Logs:', logs);
          console.log('  System Configs:', configs);
          process.exit(0);
        }).catch(err => {
          console.error('❌ Query error:', err.message);
          process.exit(1);
        });
      "`,
      cwd: apiDir,
    },
  ];
  
  const results = [];
  
  for (const test of tests) {
    const result = await runTest(test.name, test.command, test.cwd);
    results.push({ ...test, ...result });
    console.log(''); // Add spacing
  }
  
  // Summary
  console.log('📋 Test Summary:');
  console.log('================');
  
  const passed = results.filter(r => r.code === 0);
  const failed = results.filter(r => r.code !== 0);
  
  console.log(`✅ Passed: ${passed.length}/${results.length}`);
  console.log(`❌ Failed: ${failed.length}/${results.length}`);
  
  if (failed.length > 0) {
    console.log('\n❌ Failed Tests:');
    failed.forEach(test => {
      console.log(`  - ${test.name} (code ${test.code})`);
    });
  }
  
  console.log('\n🎯 Backend Setup Status:');
  const criticalTests = [
    'PostgreSQL Connection',
    'Redis Connection', 
    'Database Connection Test',
    'Prisma Client Generation'
  ];
  
  const criticalPassed = criticalTests.every(testName => 
    results.find(r => r.name === testName)?.code === 0
  );
  
  if (criticalPassed) {
    console.log('🟢 READY: Core backend services are working');
    console.log('   ✅ Database: Connected and schema deployed');
    console.log('   ✅ Redis: Connected and ready for caching/queues');  
    console.log('   ✅ Prisma: Client generated and operational');
    console.log('');
    console.log('🚀 Next steps:');
    console.log('   1. Resolve TypeScript compilation errors');
    console.log('   2. Start the server: npm run dev');
    console.log('   3. Test API endpoints');
    console.log('   4. Test scraper integration');
  } else {
    console.log('🔴 NOT READY: Critical services need attention');
    console.log('   Please fix the failed critical tests above');
  }
}

runAllTests().catch(console.error);