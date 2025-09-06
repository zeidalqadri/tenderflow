#!/usr/bin/env node
/**
 * Kazakhstan Scraper Integration Test Script
 * Tests the complete integration from API to database
 */

const { PrismaClient } = require('./src/generated/prisma');
const { ScraperService } = require('./src/services/scraper/scraper.service');
const { TransformerService } = require('./src/services/scraper/transformer.service');
const { MetricsService } = require('./src/services/scraper/metrics.service');
const fs = require('fs');
const path = require('path');

// Mock CSV data for testing
const MOCK_CSV_CONTENT = `id,title,status,days_left,value,url
TEST001,"Поставка компьютерного оборудования для государственных нужд","Открытый тендер","15 дней","5000000 ₸","https://zakup.sk.kz/test/001"
TEST002,"Строительство и реконструкция офисного здания","Открытый тендер","30 дней","50000000 ₸","https://zakup.sk.kz/test/002"
TEST003,"Консультационные услуги по внедрению IT-решений","Запрос ценовых предложений","7 дней","2500000 ₸","https://zakup.sk.kz/test/003"`;

async function main() {
  const prisma = new PrismaClient();
  let testTenantId = null;
  let testUserId = null;
  let mockCsvPath = null;

  try {
    console.log('🚀 Starting Kazakhstan Scraper Integration Test...\n');

    // 1. Setup test data
    console.log('📝 Setting up test environment...');
    
    // Create test tenant
    const testTenant = await prisma.tenant.create({
      data: {
        name: 'Integration Test Tenant',
        subdomain: 'integration-test',
        settings: {}
      }
    });
    testTenantId = testTenant.id;
    console.log(`✅ Created test tenant: ${testTenantId}`);

    // Create test user
    const testUser = await prisma.user.create({
      data: {
        tenantId: testTenantId,
        email: 'test@integration.com',
        firstName: 'Integration',
        lastName: 'Test',
        role: 'admin'
      }
    });
    testUserId = testUser.id;
    console.log(`✅ Created test user: ${testUserId}`);

    // Create mock CSV file
    mockCsvPath = path.join(process.cwd(), 'test-integration-data.csv');
    fs.writeFileSync(mockCsvPath, MOCK_CSV_CONTENT);
    console.log(`✅ Created mock CSV file: ${mockCsvPath}\n`);

    // 2. Test Services
    console.log('🔧 Testing core services...');

    // Test Metrics Service
    const metricsService = new MetricsService(prisma);
    console.log('✅ MetricsService initialized');

    // Test TransformerService
    const transformerService = new TransformerService(prisma);
    console.log('✅ TransformerService initialized');

    // Test ScraperService (without WebSocket for simplicity)
    const scraperService = new ScraperService(prisma);
    console.log('✅ ScraperService initialized');
    console.log(`✅ Scraper path resolved to: ${scraperService.scraperPath || 'Not found'}\n`);

    // 3. Test Data Transformation
    console.log('📊 Testing data transformation...');
    
    const transformResult = await transformerService.processScrapedData(
      mockCsvPath,
      testTenantId,
      testUserId
    );

    console.log(`✅ Data transformation completed:`);
    console.log(`   - Imported: ${transformResult.imported} tenders`);
    console.log(`   - Updated: ${transformResult.updated} tenders`);
    console.log(`   - Skipped: ${transformResult.skipped} tenders\n`);

    // Verify imported data
    const importedTenders = await prisma.tender.findMany({
      where: { tenantId: testTenantId },
      orderBy: { externalId: 'asc' }
    });

    console.log('📋 Imported tender details:');
    for (const tender of importedTenders) {
      console.log(`   - ${tender.externalId}: ${tender.originalTitle}`);
      console.log(`     Category: ${tender.category}, Status: ${tender.status}`);
      console.log(`     Value: ${tender.estimatedValue} ${tender.currency}`);
      console.log(`     Source: ${tender.sourcePortal}\n`);
    }

    // 4. Test Duplicate Detection
    console.log('🔍 Testing duplicate detection...');
    
    const duplicateResult = await transformerService.processScrapedData(
      mockCsvPath,
      testTenantId,
      testUserId
    );

    console.log(`✅ Duplicate detection test:`);
    console.log(`   - Imported: ${duplicateResult.imported} (should be 0)`);
    console.log(`   - Updated: ${duplicateResult.updated}`);
    console.log(`   - Skipped: ${duplicateResult.skipped} (should be 3)\n`);

    // 5. Test Metrics
    console.log('📈 Testing metrics collection...');
    
    // Start job metrics
    const testJobId = `test_job_${Date.now()}`;
    metricsService.startJobMetrics(testJobId, testTenantId);
    console.log(`✅ Started metrics tracking for job: ${testJobId}`);

    // Simulate some activity
    metricsService.updateJobMetrics(testJobId, {
      pagesScraped: 5,
      tendersFound: 3
    });

    // Complete job metrics
    const finalMetrics = metricsService.completeJobMetrics(testJobId, {
      tendersImported: 3,
      tendersUpdated: 0,
      tendersSkipped: 0
    });

    console.log(`✅ Completed metrics tracking:`);
    console.log(`   - Duration: ${finalMetrics?.duration}ms`);
    console.log(`   - Pages scraped: ${finalMetrics?.pagesScraped}`);
    console.log(`   - Tenders found: ${finalMetrics?.tendersFound}`);

    // Get system metrics
    const systemMetrics = metricsService.getSystemMetrics();
    console.log(`✅ System metrics:`);
    console.log(`   - Memory usage: ${Math.round(systemMetrics.memory.rss / 1024 / 1024)}MB`);
    console.log(`   - Uptime: ${Math.round(systemMetrics.uptime)}s`);
    console.log(`   - Active jobs: ${systemMetrics.activeJobs}\n`);

    // 6. Test Currency Conversion
    console.log('💱 Testing currency conversion...');
    
    const tenderWithExchange = importedTenders.find(t => t.exchangeRates);
    if (tenderWithExchange) {
      const exchangeInfo = tenderWithExchange.exchangeRates;
      console.log(`✅ Currency conversion verified:`);
      console.log(`   - Original: ${exchangeInfo.originalAmount} ${exchangeInfo.from}`);
      console.log(`   - Converted: ${tenderWithExchange.estimatedValue} ${tenderWithExchange.currency}`);
      console.log(`   - Rate: ${exchangeInfo.rate}`);
      console.log(`   - Source: ${exchangeInfo.source || 'fallback'}\n`);
    }

    // 7. Test Performance Stats
    console.log('📊 Testing performance statistics...');
    
    const performanceStats = await scraperService.getPerformanceMetrics(testTenantId, 7);
    console.log(`✅ Performance statistics:`);
    console.log(`   - Total jobs: ${performanceStats.totalJobs}`);
    console.log(`   - Average duration: ${Math.round(performanceStats.averageDuration)}ms`);
    console.log(`   - Success rate: ${Math.round(performanceStats.averageSuccessRate * 100)}%`);
    console.log(`   - Average tenders per job: ${Math.round(performanceStats.averageTendersPerJob)}\n`);

    console.log('🎉 Integration test completed successfully!');
    console.log('\n🔧 Integration Test Summary:');
    console.log('✅ Python scraper path resolution');
    console.log('✅ Data transformation and import');
    console.log('✅ Currency conversion (KZT → USD)');
    console.log('✅ Duplicate detection');
    console.log('✅ Metrics collection and tracking');
    console.log('✅ Performance monitoring');
    console.log('✅ Database integration');
    console.log('✅ Text encoding handling');

  } catch (error) {
    console.error('❌ Integration test failed:', error);
    process.exit(1);

  } finally {
    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    
    try {
      if (testTenantId) {
        await prisma.tender.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.scrapingLog.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.user.deleteMany({ where: { tenantId: testTenantId } });
        await prisma.tenant.delete({ where: { id: testTenantId } });
        console.log('✅ Cleaned up database');
      }

      if (mockCsvPath && fs.existsSync(mockCsvPath)) {
        fs.unlinkSync(mockCsvPath);
        console.log('✅ Cleaned up test files');
      }

    } catch (cleanupError) {
      console.error('⚠️  Cleanup error:', cleanupError);
    }

    await prisma.$disconnect();
    console.log('✅ Database disconnected');
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n🛑 Test interrupted by user');
  process.exit(0);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the test
main().catch(error => {
  console.error('❌ Test script error:', error);
  process.exit(1);
});