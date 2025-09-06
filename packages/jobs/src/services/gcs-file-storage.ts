import { Storage } from '@google-cloud/storage';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import { exifr } from 'exifr';
import { FileProcessResult } from '../queues';

export interface FileMetadata {
  fileType?: string;
  dimensions?: { width: number; height: number };
  exif?: Record<string, any>;
  thumbnailKey?: string;
  virusScanResult?: 'clean' | 'infected' | 'error';
  size: number;
  lastModified?: Date;
  gcsMetadata?: {
    bucket: string;
    name: string;
    generation: string;
    metageneration: string;
    contentType: string;
    timeCreated: string;
    updated: string;
    etag: string;
    md5Hash?: string;
    crc32c: string;
  };
}

export interface SignedUrlOptions {
  version: 'v2' | 'v4';
  action: 'read' | 'write' | 'delete';
  expires: Date | number | string;
  contentType?: string;
  extensionHeaders?: { [key: string]: string };
}

export class GCSFileStorageService {
  private storage: Storage;
  private readonly documentsBucket: string;
  private readonly thumbnailsBucket: string;
  private readonly tempBucket: string;
  private readonly backupBucket: string;
  private readonly cdnDomain?: string;

  constructor() {
    // Initialize Google Cloud Storage client
    this.storage = new Storage({
      projectId: process.env.GCP_PROJECT_ID || 'tensurv',
      keyFilename: process.env.GCP_SERVICE_ACCOUNT_KEY, // Optional: for local development
      // For production, use service account attached to Cloud Run
    });
    
    this.documentsBucket = process.env.GCS_DOCUMENTS_BUCKET || 'tensurv-documents-prod';
    this.thumbnailsBucket = process.env.GCS_THUMBNAILS_BUCKET || 'tensurv-thumbnails-prod';
    this.tempBucket = process.env.GCS_TEMP_BUCKET || 'tensurv-temp-processing-prod';
    this.backupBucket = process.env.GCS_BACKUP_BUCKET || 'tensurv-backups-prod';
    this.cdnDomain = process.env.CDN_DOMAIN; // e.g., 'https://cdn.tenderflow.gov'
    
    this.initializeBuckets();
  }

  private async initializeBuckets(): Promise<void> {
    try {
      const buckets = [
        this.documentsBucket,
        this.thumbnailsBucket,
        this.tempBucket,
        this.backupBucket
      ];
      
      for (const bucketName of buckets) {
        const bucket = this.storage.bucket(bucketName);
        const [exists] = await bucket.exists();
        
        if (!exists) {
          console.warn(`Bucket ${bucketName} does not exist. Please create it using Terraform.`);
          continue;
        }

        // Set CORS policy for web uploads (if needed)
        if (bucketName === this.documentsBucket || bucketName === this.thumbnailsBucket) {
          await this.setCorsPolicy(bucket);
        }
      }
    } catch (error) {
      console.error('Failed to initialize GCS buckets:', error);
    }
  }

  private async setCorsPolicy(bucket: any): Promise<void> {
    try {
      await bucket.setCorsConfiguration([
        {
          maxAgeSeconds: 3600,
          method: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
          origin: ['https://tenderflow.gov', 'https://*.tenderflow.gov'],
          responseHeader: ['Content-Type', 'x-goog-resumable', 'x-goog-meta-*'],
        },
      ]);
    } catch (error) {
      console.warn('Failed to set CORS policy:', error);
    }
  }

  /**
   * Download file from GCS
   */
  async getFile(bucketName: string, key: string): Promise<Buffer> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      
      const [buffer] = await file.download();
      return buffer;
    } catch (error) {
      throw new Error(`Failed to download file ${key} from bucket ${bucketName}: ${error}`);
    }
  }

  /**
   * Upload file to GCS
   */
  async putFile(
    bucketName: string,
    key: string,
    buffer: Buffer,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      
      const stream = file.createWriteStream({
        metadata: {
          contentType: metadata.mimeType || metadata.contentType || 'application/octet-stream',
          metadata: {
            uploadedBy: 'tenderflow-api',
            uploadedAt: new Date().toISOString(),
            originalName: metadata.originalName,
            processedBy: metadata.processedBy,
            ...metadata.customMetadata,
          },
        },
        resumable: buffer.length > 5 * 1024 * 1024, // Use resumable for files > 5MB
        validation: 'crc32c', // Enable integrity validation
      });

      return new Promise((resolve, reject) => {
        stream.on('error', reject);
        stream.on('finish', resolve);
        stream.end(buffer);
      });
    } catch (error) {
      throw new Error(`Failed to upload file ${key} to bucket ${bucketName}: ${error}`);
    }
  }

  /**
   * Get file metadata from GCS
   */
  async getFileMetadata(bucketName: string, key: string): Promise<FileMetadata> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      
      const [metadata] = await file.getMetadata();
      
      return {
        size: parseInt(metadata.size || '0'),
        lastModified: new Date(metadata.timeCreated),
        fileType: metadata.contentType,
        gcsMetadata: {
          bucket: metadata.bucket,
          name: metadata.name,
          generation: metadata.generation,
          metageneration: metadata.metageneration,
          contentType: metadata.contentType,
          timeCreated: metadata.timeCreated,
          updated: metadata.updated,
          etag: metadata.etag,
          md5Hash: metadata.md5Hash,
          crc32c: metadata.crc32c,
        },
      };
    } catch (error) {
      throw new Error(`Failed to get metadata for ${key} in bucket ${bucketName}: ${error}`);
    }
  }

  /**
   * Process file: extract metadata, generate thumbnails, detect file type
   */
  async processFile(
    bucketName: string,
    key: string,
    originalName: string,
    options: {
      generateThumbnail?: boolean;
      extractExif?: boolean;
      skipVirusScan?: boolean;
    } = {}
  ): Promise<FileProcessResult> {
    try {
      // Download file
      const buffer = await this.getFile(bucketName, key);
      
      // Detect file type
      const fileType = await fileTypeFromBuffer(buffer);
      
      const metadata: FileMetadata = {
        fileType: fileType?.mime,
        size: buffer.length,
      };

      // Process images
      if (fileType && fileType.mime.startsWith('image/')) {
        await this.processImageFile(buffer, key, metadata, options);
      }
      
      // Process PDFs
      if (fileType && fileType.mime === 'application/pdf') {
        await this.processPdfFile(buffer, key, metadata);
      }

      // Virus scan (placeholder - integrate with Cloud Security Scanner or third-party)
      if (!options.skipVirusScan) {
        metadata.virusScanResult = await this.scanForViruses(buffer);
      }

      // Update file metadata in GCS
      await this.updateFileMetadata(bucketName, key, metadata);

      return {
        success: true,
        metadata,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'File processing failed',
      };
    }
  }

  /**
   * Process image files: extract EXIF, generate thumbnails
   */
  private async processImageFile(
    buffer: Buffer,
    key: string,
    metadata: FileMetadata,
    options: {
      generateThumbnail?: boolean;
      extractExif?: boolean;
    }
  ): Promise<void> {
    try {
      // Get image dimensions
      const imageInfo = await sharp(buffer).metadata();
      metadata.dimensions = {
        width: imageInfo.width || 0,
        height: imageInfo.height || 0,
      };

      // Extract EXIF data
      if (options.extractExif) {
        try {
          const exifData = await exifr.parse(buffer);
          metadata.exif = exifData || {};
        } catch {
          // EXIF extraction failed - not critical
        }
      }

      // Generate thumbnail
      if (options.generateThumbnail) {
        const thumbnailBuffer = await sharp(buffer)
          .resize(300, 300, {
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: 80 })
          .toBuffer();

        const thumbnailKey = `thumbnails/${key.replace(/\.[^/.]+$/, '')}.jpg`;
        await this.putFile(this.thumbnailsBucket, thumbnailKey, thumbnailBuffer, {
          mimeType: 'image/jpeg',
          originalKey: key,
          generatedAt: new Date().toISOString(),
        });
        
        metadata.thumbnailKey = thumbnailKey;
      }
      
    } catch (error) {
      console.warn('Image processing failed:', error);
    }
  }

  /**
   * Process PDF files: extract page count, generate preview
   */
  private async processPdfFile(
    buffer: Buffer,
    key: string,
    metadata: FileMetadata
  ): Promise<void> {
    try {
      // Count PDF pages (simple approach)
      const pageCount = this.countPdfPages(buffer);
      metadata.exif = { pageCount };

      // For production, consider using Document AI for better PDF processing
      // const documentAiResult = await this.processWithDocumentAI(buffer);
      
    } catch (error) {
      console.warn('PDF processing failed:', error);
    }
  }

  /**
   * Simple PDF page counter
   */
  private countPdfPages(buffer: Buffer): number {
    try {
      const text = buffer.toString();
      const matches = text.match(/\/Type\s*\/Page[^s]/g);
      return matches ? matches.length : 1;
    } catch {
      return 1;
    }
  }

  /**
   * Virus scanning placeholder
   */
  private async scanForViruses(buffer: Buffer): Promise<'clean' | 'infected' | 'error'> {
    try {
      // In production, integrate with:
      // - Cloud Security Scanner
      // - Third-party antivirus API
      // - ClamAV running on Cloud Run
      
      if (buffer.length > 50 * 1024 * 1024) {
        return 'error'; // File too large
      }
      
      return 'clean';
    } catch {
      return 'error';
    }
  }

  /**
   * Update file metadata in GCS
   */
  private async updateFileMetadata(
    bucketName: string,
    key: string,
    metadata: FileMetadata
  ): Promise<void> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      
      await file.setMetadata({
        metadata: {
          fileType: metadata.fileType,
          dimensions: JSON.stringify(metadata.dimensions),
          exif: JSON.stringify(metadata.exif),
          thumbnailKey: metadata.thumbnailKey,
          virusScanResult: metadata.virusScanResult,
          processedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      console.warn('Failed to update file metadata:', error);
    }
  }

  /**
   * Clean up old thumbnails
   */
  async cleanupThumbnails(olderThanDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const bucket = this.storage.bucket(this.thumbnailsBucket);
      const [files] = await bucket.getFiles({
        prefix: 'thumbnails/',
      });

      const filesToDelete: string[] = [];

      for (const file of files) {
        const [metadata] = await file.getMetadata();
        const lastModified = new Date(metadata.updated);
        
        if (lastModified < cutoffDate) {
          filesToDelete.push(file.name);
        }
      }

      if (filesToDelete.length > 0) {
        await Promise.all(
          filesToDelete.map(fileName => 
            bucket.file(fileName).delete({ ignoreNotFound: true })
          )
        );
        console.log(`Cleaned up ${filesToDelete.length} old thumbnails`);
      }
      
    } catch (error) {
      console.error('Thumbnail cleanup failed:', error);
    }
  }

  /**
   * Get signed URL for file access
   */
  async getSignedUrl(
    bucketName: string,
    key: string,
    options: SignedUrlOptions
  ): Promise<string> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      
      const [signedUrl] = await file.getSignedUrl({
        version: options.version,
        action: options.action,
        expires: options.expires,
        contentType: options.contentType,
        extensionHeaders: options.extensionHeaders,
      });
      
      return signedUrl;
    } catch (error) {
      throw new Error(`Failed to generate signed URL for ${key}: ${error}`);
    }
  }

  /**
   * Get file download URL (signed or CDN)
   */
  async getFileUrl(
    bucketName: string,
    key: string,
    options: {
      expirySeconds?: number;
      useCdn?: boolean;
      signedUrl?: boolean;
    } = {}
  ): Promise<string> {
    const { expirySeconds = 3600, useCdn = false, signedUrl = true } = options;
    
    try {
      // Use CDN for thumbnails if available and requested
      if (useCdn && bucketName === this.thumbnailsBucket && this.cdnDomain) {
        return `${this.cdnDomain}/${key}`;
      }
      
      // Use signed URL for secure access
      if (signedUrl) {
        const expires = new Date();
        expires.setSeconds(expires.getSeconds() + expirySeconds);
        
        return await this.getSignedUrl(bucketName, key, {
          version: 'v4',
          action: 'read',
          expires,
        });
      }
      
      // Public URL (only for public buckets)
      return `https://storage.googleapis.com/${bucketName}/${key}`;
      
    } catch (error) {
      throw new Error(`Failed to generate download URL for ${key}: ${error}`);
    }
  }

  /**
   * Get file upload URL (signed)
   */
  async getUploadUrl(
    bucketName: string,
    key: string,
    options: {
      expirySeconds?: number;
      contentType?: string;
    } = {}
  ): Promise<string> {
    const { expirySeconds = 3600, contentType } = options;
    
    try {
      const expires = new Date();
      expires.setSeconds(expires.getSeconds() + expirySeconds);
      
      return await this.getSignedUrl(bucketName, key, {
        version: 'v4',
        action: 'write',
        expires,
        contentType,
      });
    } catch (error) {
      throw new Error(`Failed to generate upload URL for ${key}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(bucketName: string, key: string): Promise<boolean> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      const [exists] = await file.exists();
      return exists;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(bucketName: string, key: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const file = bucket.file(key);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      throw new Error(`Failed to delete file ${key} from bucket ${bucketName}: ${error}`);
    }
  }

  /**
   * Copy file between buckets
   */
  async copyFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void> {
    try {
      const sourceFile = this.storage.bucket(sourceBucket).file(sourceKey);
      const destFile = this.storage.bucket(destBucket).file(destKey);
      
      await sourceFile.copy(destFile);
    } catch (error) {
      throw new Error(`Failed to copy file from ${sourceBucket}/${sourceKey} to ${destBucket}/${destKey}: ${error}`);
    }
  }

  /**
   * Move file between buckets
   */
  async moveFile(
    sourceBucket: string,
    sourceKey: string,
    destBucket: string,
    destKey: string
  ): Promise<void> {
    await this.copyFile(sourceBucket, sourceKey, destBucket, destKey);
    await this.deleteFile(sourceBucket, sourceKey);
  }

  /**
   * List files in bucket
   */
  async listFiles(
    bucketName: string,
    options: {
      prefix?: string;
      delimiter?: string;
      maxResults?: number;
      pageToken?: string;
    } = {}
  ): Promise<{
    files: Array<{
      name: string;
      size: number;
      timeCreated: Date;
      updated: Date;
      contentType: string;
    }>;
    nextPageToken?: string;
  }> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const [files, , apiResponse] = await bucket.getFiles({
        prefix: options.prefix,
        delimiter: options.delimiter,
        maxResults: options.maxResults,
        pageToken: options.pageToken,
      });

      return {
        files: files.map(file => ({
          name: file.name,
          size: parseInt(file.metadata.size || '0'),
          timeCreated: new Date(file.metadata.timeCreated),
          updated: new Date(file.metadata.updated),
          contentType: file.metadata.contentType || 'application/octet-stream',
        })),
        nextPageToken: apiResponse?.nextPageToken,
      };
    } catch (error) {
      throw new Error(`Failed to list files in bucket ${bucketName}: ${error}`);
    }
  }

  /**
   * Get storage client health status
   */
  async getHealth(): Promise<{ status: string; buckets: string[] }> {
    try {
      const [buckets] = await this.storage.getBuckets();
      return {
        status: 'healthy',
        buckets: buckets.map(bucket => bucket.name),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        buckets: [],
      };
    }
  }

  /**
   * Get bucket information and statistics
   */
  async getBucketStats(bucketName: string): Promise<{
    name: string;
    location: string;
    storageClass: string;
    objectCount: number;
    totalSize: number;
  }> {
    try {
      const bucket = this.storage.bucket(bucketName);
      const [metadata] = await bucket.getMetadata();
      const [files] = await bucket.getFiles();
      
      const totalSize = files.reduce((sum, file) => {
        return sum + parseInt(file.metadata.size || '0');
      }, 0);

      return {
        name: metadata.name,
        location: metadata.location,
        storageClass: metadata.storageClass,
        objectCount: files.length,
        totalSize,
      };
    } catch (error) {
      throw new Error(`Failed to get bucket stats for ${bucketName}: ${error}`);
    }
  }

  // Getters for bucket names (for backward compatibility)
  get defaultBucket(): string {
    return this.documentsBucket;
  }

  get thumbnailBucket(): string {
    return this.thumbnailsBucket;
  }
}

// Singleton instance
export const gcsFileStorageService = new GCSFileStorageService();