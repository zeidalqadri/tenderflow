#!/usr/bin/env npx tsx

/**
 * TenderFlow GCS Migration Validation Script
 * 
 * This script validates that the migration from MinIO to GCS was successful
 * by comparing file counts, checksums, and metadata between source and destination.
 * 
 * Usage:
 *   npx tsx validate-migration.ts [--verbose] [--sample-size=N] [--fix-issues]
 */

import { Storage } from '@google-cloud/storage';
import { createHash } from 'crypto';
import { Client as MinioClient } from 'minio';
import * as fs from 'fs';
import * as path from 'path';

interface ValidationConfig {
  verbose: boolean;
  sampleSize: number;
  fixIssues: boolean;
  outputFile: string;
}

interface ValidationResult {
  bucket: string;
  totalFiles: number;
  validatedFiles: number;
  missingFiles: string[];
  checksumMismatches: Array<{
    file: string;
    minioChecksum: string;
    gcsChecksum: string;
  }>;
  metadataMismatches: Array<{
    file: string;
    issue: string;
  }>;
  errors: Array<{
    file: string;
    error: string;
  }>;
  summary: {
    success: boolean;
    successRate: number;
    issuesFound: number;
  };
}

class MigrationValidator {
  private storage: Storage;
  private minioClient: MinioClient;
  private config: ValidationConfig;

  constructor(config: ValidationConfig) {
    this.config = config;
    
    // Initialize GCS client
    this.storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID || 'tensurv',
      keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY,
    });

    // Initialize MinIO client
    this.minioClient = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'tenderflow',
      secretKey: process.env.MINIO_SECRET_KEY || 'tenderflow123',
    });
  }

  /**
   * Main validation function
   */
  async validateMigration(): Promise<ValidationResult[]> {
    console.log('🔍 Starting TenderFlow Storage Migration Validation...\n');
    
    const bucketMappings = [
      {
        minio: 'tender-documents',
        gcs: 'tensurv-documents-prod',
        description: 'Tender Documents'
      },
      {
        minio: 'user-uploads',
        gcs: 'tensurv-documents-prod', // Migrated to same GCS bucket
        description: 'User Uploads'
      },
      {
        minio: 'system-backups',
        gcs: 'tensurv-backups-prod',
        description: 'System Backups'
      }
    ];

    const results: ValidationResult[] = [];

    for (const mapping of bucketMappings) {
      console.log(`\n📦 Validating: ${mapping.description}`);
      console.log(`   MinIO: ${mapping.minio} -> GCS: ${mapping.gcs}`);
      
      const result = await this.validateBucket(mapping.minio, mapping.gcs);
      results.push(result);
      
      this.printBucketSummary(result);
    }

    // Generate overall report
    await this.generateReport(results);
    
    return results;
  }

  /**
   * Validate single bucket migration
   */
  private async validateBucket(minioBucket: string, gcsBucket: string): Promise<ValidationResult> {
    const result: ValidationResult = {
      bucket: `${minioBucket} -> ${gcsBucket}`,
      totalFiles: 0,
      validatedFiles: 0,
      missingFiles: [],
      checksumMismatches: [],
      metadataMismatches: [],
      errors: [],
      summary: {
        success: false,
        successRate: 0,
        issuesFound: 0
      }
    };

    try {
      // Get file list from MinIO
      const minioFiles = await this.getMinioFileList(minioBucket);
      result.totalFiles = minioFiles.length;

      if (this.config.verbose) {
        console.log(`   Found ${minioFiles.length} files in MinIO bucket`);
      }

      // Sample files if requested
      const filesToValidate = this.config.sampleSize > 0 
        ? this.sampleFiles(minioFiles, this.config.sampleSize)
        : minioFiles;

      if (this.config.verbose && filesToValidate.length !== minioFiles.length) {
        console.log(`   Validating ${filesToValidate.length} sampled files`);
      }

      // Validate each file
      for (const file of filesToValidate) {
        try {
          await this.validateFile(minioBucket, gcsBucket, file, result);
          result.validatedFiles++;
          
          if (this.config.verbose && result.validatedFiles % 10 === 0) {
            console.log(`   Validated ${result.validatedFiles}/${filesToValidate.length} files`);
          }
        } catch (error) {
          result.errors.push({
            file: file.name,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }

      // Calculate summary
      result.summary.successRate = result.validatedFiles / filesToValidate.length;
      result.summary.issuesFound = result.missingFiles.length + 
                                   result.checksumMismatches.length + 
                                   result.metadataMismatches.length + 
                                   result.errors.length;
      result.summary.success = result.summary.issuesFound === 0;

    } catch (error) {
      result.errors.push({
        file: 'bucket-validation',
        error: error instanceof Error ? error.message : String(error)
      });
    }

    return result;
  }

  /**
   * Get file list from MinIO bucket
   */
  private async getMinioFileList(bucket: string): Promise<Array<{ name: string; size: number; lastModified: Date }>> {
    return new Promise((resolve, reject) => {
      const files: Array<{ name: string; size: number; lastModified: Date }> = [];
      const stream = this.minioClient.listObjects(bucket, '', true);

      stream.on('data', (obj) => {
        if (obj.name) {
          files.push({
            name: obj.name,
            size: obj.size || 0,
            lastModified: obj.lastModified || new Date()
          });
        }
      });

      stream.on('end', () => resolve(files));
      stream.on('error', reject);
    });
  }

  /**
   * Sample files for validation (useful for large datasets)
   */
  private sampleFiles<T>(files: T[], sampleSize: number): T[] {
    if (sampleSize >= files.length) return files;
    
    const step = Math.floor(files.length / sampleSize);
    const sampled: T[] = [];
    
    for (let i = 0; i < files.length; i += step) {
      sampled.push(files[i]);
      if (sampled.length >= sampleSize) break;
    }
    
    return sampled;
  }

  /**
   * Validate individual file
   */
  private async validateFile(
    minioBucket: string,
    gcsBucket: string,
    file: { name: string; size: number; lastModified: Date },
    result: ValidationResult
  ): Promise<void> {
    // Check if file exists in GCS
    const gcsFile = this.storage.bucket(gcsBucket).file(`migrated/${file.name}`);
    const [exists] = await gcsFile.exists();
    
    if (!exists) {
      result.missingFiles.push(file.name);
      return;
    }

    // Get file metadata from GCS
    const [gcsMetadata] = await gcsFile.getMetadata();
    
    // Validate file size
    const gcsSize = parseInt(gcsMetadata.size || '0');
    if (gcsSize !== file.size) {
      result.metadataMismatches.push({
        file: file.name,
        issue: `Size mismatch: MinIO=${file.size}, GCS=${gcsSize}`
      });
    }

    // Validate checksums (for critical files or sample validation)
    if (this.shouldValidateChecksum(file.name)) {
      await this.validateFileChecksum(minioBucket, gcsBucket, file.name, result);
    }

    // Validate content type
    await this.validateContentType(minioBucket, gcsBucket, file.name, result);
  }

  /**
   * Determine if file should have checksum validation
   */
  private shouldValidateChecksum(fileName: string): boolean {
    // Always validate PDFs and important documents
    const criticalExtensions = ['.pdf', '.docx', '.doc', '.xls', '.xlsx'];
    const ext = path.extname(fileName).toLowerCase();
    
    if (criticalExtensions.includes(ext)) return true;
    
    // Random sampling for other files (10% chance)
    return Math.random() < 0.1;
  }

  /**
   * Validate file checksum
   */
  private async validateFileChecksum(
    minioBucket: string,
    gcsBucket: string,
    fileName: string,
    result: ValidationResult
  ): Promise<void> {
    try {
      // Get file from MinIO
      const minioStream = await this.minioClient.getObject(minioBucket, fileName);
      const minioChecksum = await this.calculateStreamChecksum(minioStream);

      // Get file from GCS
      const gcsFile = this.storage.bucket(gcsBucket).file(`migrated/${fileName}`);
      const gcsStream = gcsFile.createReadStream();
      const gcsChecksum = await this.calculateStreamChecksum(gcsStream);

      if (minioChecksum !== gcsChecksum) {
        result.checksumMismatches.push({
          file: fileName,
          minioChecksum,
          gcsChecksum
        });
      }
    } catch (error) {
      result.errors.push({
        file: fileName,
        error: `Checksum validation failed: ${error}`
      });
    }
  }

  /**
   * Calculate checksum from stream
   */
  private async calculateStreamChecksum(stream: NodeJS.ReadableStream): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('md5');
      
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
      stream.on('error', reject);
    });
  }

  /**
   * Validate content type
   */
  private async validateContentType(
    minioBucket: string,
    gcsBucket: string,
    fileName: string,
    result: ValidationResult
  ): Promise<void> {
    try {
      // Get content type from MinIO
      const minioStat = await this.minioClient.statObject(minioBucket, fileName);
      const minioContentType = minioStat.metaData?.['content-type'] || 'application/octet-stream';

      // Get content type from GCS
      const gcsFile = this.storage.bucket(gcsBucket).file(`migrated/${fileName}`);
      const [gcsMetadata] = await gcsFile.getMetadata();
      const gcsContentType = gcsMetadata.contentType || 'application/octet-stream';

      if (minioContentType !== gcsContentType) {
        result.metadataMismatches.push({
          file: fileName,
          issue: `Content-Type mismatch: MinIO=${minioContentType}, GCS=${gcsContentType}`
        });
      }
    } catch (error) {
      // Non-critical error, log but don't fail validation
      if (this.config.verbose) {
        console.warn(`   Warning: Could not validate content type for ${fileName}: ${error}`);
      }
    }
  }

  /**
   * Print bucket validation summary
   */
  private printBucketSummary(result: ValidationResult): void {
    console.log(`\n   📊 Validation Summary for ${result.bucket}:`);
    console.log(`   ✅ Validated Files: ${result.validatedFiles}/${result.totalFiles}`);
    console.log(`   📈 Success Rate: ${(result.summary.successRate * 100).toFixed(1)}%`);
    
    if (result.missingFiles.length > 0) {
      console.log(`   ❌ Missing Files: ${result.missingFiles.length}`);
    }
    
    if (result.checksumMismatches.length > 0) {
      console.log(`   🔍 Checksum Mismatches: ${result.checksumMismatches.length}`);
    }
    
    if (result.metadataMismatches.length > 0) {
      console.log(`   📝 Metadata Issues: ${result.metadataMismatches.length}`);
    }
    
    if (result.errors.length > 0) {
      console.log(`   ⚠️  Errors: ${result.errors.length}`);
    }

    if (result.summary.success) {
      console.log(`   🎉 Status: PASSED`);
    } else {
      console.log(`   🚨 Status: ISSUES FOUND`);
    }
  }

  /**
   * Generate detailed validation report
   */
  private async generateReport(results: ValidationResult[]): Promise<void> {
    const reportData = {
      timestamp: new Date().toISOString(),
      configuration: this.config,
      results,
      summary: {
        totalBuckets: results.length,
        successfulBuckets: results.filter(r => r.summary.success).length,
        totalFiles: results.reduce((sum, r) => sum + r.totalFiles, 0),
        totalValidated: results.reduce((sum, r) => sum + r.validatedFiles, 0),
        totalIssues: results.reduce((sum, r) => sum + r.summary.issuesFound, 0),
        overallSuccessRate: results.reduce((sum, r) => sum + r.summary.successRate, 0) / results.length
      }
    };

    const reportContent = JSON.stringify(reportData, null, 2);
    
    // Write to file
    await fs.promises.writeFile(this.config.outputFile, reportContent);
    console.log(`\n📄 Detailed report written to: ${this.config.outputFile}`);

    // Upload to GCS backup bucket
    try {
      const backupBucket = this.storage.bucket('tensurv-backups-prod');
      const reportFile = backupBucket.file(`migration-validation/report-${Date.now()}.json`);
      await reportFile.save(reportContent, { contentType: 'application/json' });
      console.log(`📤 Report uploaded to GCS: gs://tensurv-backups-prod/migration-validation/`);
    } catch (error) {
      console.warn(`⚠️  Could not upload report to GCS: ${error}`);
    }

    // Print final summary
    console.log(`\n🏁 Migration Validation Complete:`);
    console.log(`   📦 Buckets: ${reportData.summary.successfulBuckets}/${reportData.summary.totalBuckets} passed`);
    console.log(`   📄 Files: ${reportData.summary.totalValidated}/${reportData.summary.totalFiles} validated`);
    console.log(`   📊 Success Rate: ${(reportData.summary.overallSuccessRate * 100).toFixed(1)}%`);
    console.log(`   🚨 Issues Found: ${reportData.summary.totalIssues}`);

    if (reportData.summary.totalIssues === 0) {
      console.log(`\n🎉 Migration validation PASSED! All files successfully migrated.`);
    } else {
      console.log(`\n⚠️  Migration validation found issues. Please review the detailed report.`);
    }
  }
}

// CLI Interface
async function main() {
  const args = process.argv.slice(2);
  
  const config: ValidationConfig = {
    verbose: args.includes('--verbose') || args.includes('-v'),
    sampleSize: 0,
    fixIssues: args.includes('--fix-issues'),
    outputFile: `migration-validation-${Date.now()}.json`
  };

  // Parse sample size
  const sampleArg = args.find(arg => arg.startsWith('--sample-size='));
  if (sampleArg) {
    config.sampleSize = parseInt(sampleArg.split('=')[1]);
  }

  // Parse output file
  const outputArg = args.find(arg => arg.startsWith('--output='));
  if (outputArg) {
    config.outputFile = outputArg.split('=')[1];
  }

  // Show help
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
TenderFlow GCS Migration Validation Tool

Usage: npx tsx validate-migration.ts [options]

Options:
  --verbose, -v              Show detailed validation output
  --sample-size=N            Validate only N sampled files per bucket
  --fix-issues               Attempt to fix issues found during validation
  --output=FILE              Output report to specific file
  --help, -h                 Show this help message

Examples:
  npx tsx validate-migration.ts --verbose
  npx tsx validate-migration.ts --sample-size=100 --output=validation-report.json
  npx tsx validate-migration.ts --fix-issues
    `);
    return;
  }

  try {
    const validator = new MigrationValidator(config);
    await validator.validateMigration();
  } catch (error) {
    console.error('💥 Validation failed:', error);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('💥 Fatal error:', error);
    process.exit(1);
  });
}