#!/usr/bin/env tsx
/**
 * Credential Rotation Script
 * 
 * This script generates new secure credentials and provides instructions
 * for rotating them across the system safely.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface CredentialSet {
  name: string;
  current: string;
  new: string;
  type: 'jwt' | 'minio' | 'database' | 'api';
  rotationSteps: string[];
}

/**
 * Generates a cryptographically secure random string
 */
function generateSecureKey(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Generates MinIO-compatible credentials
 */
function generateMinioCredentials() {
  return {
    accessKey: generateSecureKey(16), // 32 character hex
    secretKey: generateSecureKey(32)  // 64 character hex
  };
}

/**
 * Generates JWT secrets
 */
function generateJwtSecrets() {
  return {
    secret: generateSecureKey(32),      // 64 character hex
    refreshSecret: generateSecureKey(32) // 64 character hex
  };
}

/**
 * Main credential rotation function
 */
async function rotateCredentials() {
  console.log('🔐 TenderFlow Credential Rotation Tool');
  console.log('=====================================\n');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(process.cwd(), 'credential-backups');
  
  // Ensure backup directory exists
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }

  // Generate new credentials
  const jwtSecrets = generateJwtSecrets();
  const minioCredentials = generateMinioCredentials();

  const credentialSets: CredentialSet[] = [
    {
      name: 'JWT_SECRET',
      current: process.env.JWT_SECRET || 'NOT_SET',
      new: jwtSecrets.secret,
      type: 'jwt',
      rotationSteps: [
        '1. Update .env file with new JWT_SECRET',
        '2. Restart all API servers',
        '3. All existing tokens will be invalidated',
        '4. Users will need to re-login'
      ]
    },
    {
      name: 'JWT_REFRESH_SECRET',
      current: process.env.JWT_REFRESH_SECRET || 'NOT_SET',
      new: jwtSecrets.refreshSecret,
      type: 'jwt',
      rotationSteps: [
        '1. Update .env file with new JWT_REFRESH_SECRET',
        '2. Restart all API servers',
        '3. All refresh tokens will be invalidated',
        '4. Users will need to re-login'
      ]
    },
    {
      name: 'MINIO_ACCESS_KEY',
      current: process.env.MINIO_ACCESS_KEY || 'NOT_SET',
      new: minioCredentials.accessKey,
      type: 'minio',
      rotationSteps: [
        '1. Update MinIO server configuration',
        '2. Update .env file with new MINIO_ACCESS_KEY',
        '3. Update docker-compose.dev.yml',
        '4. Restart MinIO container',
        '5. Restart API servers'
      ]
    },
    {
      name: 'MINIO_SECRET_KEY',
      current: process.env.MINIO_SECRET_KEY || 'NOT_SET',
      new: minioCredentials.secretKey,
      type: 'minio',
      rotationSteps: [
        '1. Update MinIO server configuration',
        '2. Update .env file with new MINIO_SECRET_KEY',
        '3. Update docker-compose.dev.yml',
        '4. Restart MinIO container',
        '5. Restart API servers'
      ]
    }
  ];

  // Create backup of current credentials
  const backupFile = path.join(backupDir, `credentials-backup-${timestamp}.json`);
  const backupData = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown',
    credentials: credentialSets.map(cred => ({
      name: cred.name,
      current: cred.current === 'NOT_SET' ? 'NOT_SET' : '[REDACTED]',
      rotated: true
    }))
  };
  
  fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
  console.log(`📝 Credential backup saved: ${backupFile}\n`);

  // Generate rotation instructions
  console.log('🔄 NEW SECURE CREDENTIALS GENERATED');
  console.log('===================================\n');

  credentialSets.forEach((cred, index) => {
    console.log(`${index + 1}. ${cred.name}:`);
    console.log(`   Current: ${cred.current.slice(0, 8)}... (${cred.current.length} chars)`);
    console.log(`   New:     ${cred.new}`);
    console.log(`   Type:    ${cred.type.toUpperCase()}`);
    console.log('   Rotation Steps:');
    cred.rotationSteps.forEach((step, stepIndex) => {
      console.log(`     ${step}`);
    });
    console.log('');
  });

  // Generate .env update commands
  console.log('🔧 ENVIRONMENT FILE UPDATE COMMANDS');
  console.log('===================================\n');
  console.log('Copy and paste these commands to update your .env file:\n');

  credentialSets.forEach(cred => {
    console.log(`echo '${cred.name}="${cred.new}"' >> .env.new`);
  });

  console.log('\n# After running above commands:');
  console.log('# 1. Review .env.new file');
  console.log('# 2. mv .env .env.backup');
  console.log('# 3. mv .env.new .env');
  console.log('# 4. Restart services\n');

  // Generate Docker Compose update commands
  console.log('🐳 DOCKER COMPOSE UPDATE COMMANDS');
  console.log('=================================\n');
  console.log('Update docker-compose.dev.yml with new MinIO credentials:\n');
  
  console.log(`MINIO_ROOT_USER: ${minioCredentials.accessKey}`);
  console.log(`MINIO_ROOT_PASSWORD: ${minioCredentials.secretKey}\n`);

  // Generate Supabase rotation instructions
  console.log('🏗️  SUPABASE CREDENTIAL ROTATION (CRITICAL)');
  console.log('==========================================\n');
  console.log('IMMEDIATE ACTION REQUIRED - Supabase credentials are COMPROMISED:');
  console.log('1. Login to Supabase dashboard: https://supabase.com/dashboard');
  console.log('2. Navigate to project settings');
  console.log('3. Generate new API keys');
  console.log('4. Reset database password');
  console.log('5. Update all applications with new credentials');
  console.log('6. Revoke old credentials');
  console.log('7. Monitor for unauthorized access\n');

  // Security validation
  console.log('🛡️  SECURITY VALIDATION CHECKLIST');
  console.log('==================================\n');
  console.log('Before deploying new credentials:');
  console.log('☐ All new secrets are at least 32 characters');
  console.log('☐ No credentials match known compromised values');
  console.log('☐ All services have been updated');
  console.log('☐ Environment validation passes');
  console.log('☐ All team members notified of rotation');
  console.log('☐ Old credentials have been revoked');
  console.log('☐ Monitoring alerts configured for new credentials\n');

  // Generate rotation summary
  const rotationSummary = {
    timestamp: new Date().toISOString(),
    credentialsRotated: credentialSets.length,
    backupLocation: backupFile,
    nextRotationDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(), // 90 days
    securityLevel: 'HIGH',
    status: 'PENDING_DEPLOYMENT'
  };

  const summaryFile = path.join(backupDir, `rotation-summary-${timestamp}.json`);
  fs.writeFileSync(summaryFile, JSON.stringify(rotationSummary, null, 2));

  console.log(`📊 Rotation summary saved: ${summaryFile}`);
  console.log(`⏰ Next recommended rotation: ${rotationSummary.nextRotationDate.split('T')[0]}\n`);

  console.log('🚨 CRITICAL SECURITY REMINDER');
  console.log('=============================');
  console.log('- These credentials provide full system access');
  console.log('- Store securely and never commit to version control');
  console.log('- Rotate regularly (every 90 days minimum)');
  console.log('- Monitor for unauthorized usage');
  console.log('- Follow principle of least privilege');
  console.log('- Use environment-specific credentials\n');

  return {
    jwtSecrets,
    minioCredentials,
    backupFile,
    summaryFile
  };
}

// CLI execution
if (require.main === module) {
  rotateCredentials()
    .then(() => {
      console.log('✅ Credential rotation completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Credential rotation failed:', error);
      process.exit(1);
    });
}

export { rotateCredentials, generateSecureKey };