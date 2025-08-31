import { Client as MinioClient } from 'minio';
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
}

export class FileStorageService {
  private client: MinioClient;
  private readonly defaultBucket: string;
  private readonly thumbnailBucket: string;

  constructor() {
    this.client = new MinioClient({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000'),
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
      secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin',
    });
    
    this.defaultBucket = process.env.MINIO_DEFAULT_BUCKET || 'tenderflow-files';
    this.thumbnailBucket = process.env.MINIO_THUMBNAIL_BUCKET || 'tenderflow-thumbnails';
    
    this.initializeBuckets();
  }

  private async initializeBuckets(): Promise<void> {
    try {
      // Ensure buckets exist
      const buckets = [this.defaultBucket, this.thumbnailBucket];
      
      for (const bucket of buckets) {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
          await this.client.makeBucket(bucket);
          
          // Set bucket policy for thumbnails (public read)
          if (bucket === this.thumbnailBucket) {
            const policy = {
              Version: '2012-10-17',
              Statement: [{
                Effect: 'Allow',
                Principal: { AWS: ['*'] },
                Action: ['s3:GetObject'],
                Resource: [`arn:aws:s3:::${bucket}/*`],
              }],
            };
            
            await this.client.setBucketPolicy(bucket, JSON.stringify(policy));
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize MinIO buckets:', error);
    }
  }

  /**
   * Download file from MinIO
   */
  async getFile(bucket: string, key: string): Promise<Buffer> {
    try {
      const stream = await this.client.getObject(bucket, key);
      const chunks: Buffer[] = [];
      
      return new Promise((resolve, reject) => {
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
    } catch (error) {
      throw new Error(`Failed to download file ${key} from bucket ${bucket}: ${error}`);
    }
  }

  /**
   * Upload file to MinIO
   */
  async putFile(
    bucket: string,
    key: string,
    buffer: Buffer,
    metadata: Record<string, any> = {}
  ): Promise<void> {
    try {
      await this.client.putObject(bucket, key, buffer, buffer.length, {
        'Content-Type': metadata.mimeType || 'application/octet-stream',
        ...metadata,
      });
    } catch (error) {
      throw new Error(`Failed to upload file ${key} to bucket ${bucket}: ${error}`);
    }
  }

  /**
   * Get file metadata from MinIO
   */
  async getFileMetadata(bucket: string, key: string): Promise<any> {
    try {
      const stat = await this.client.statObject(bucket, key);
      return {
        size: stat.size,
        lastModified: stat.lastModified,
        etag: stat.etag,
        contentType: stat.metaData?.['content-type'],
        ...stat.metaData,
      };
    } catch (error) {
      throw new Error(`Failed to get metadata for ${key} in bucket ${bucket}: ${error}`);
    }
  }

  /**
   * Process file: extract metadata, generate thumbnails, detect file type
   */
  async processFile(
    bucket: string,
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
      const buffer = await this.getFile(bucket, key);
      
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

      // Virus scan (placeholder - would integrate with ClamAV or similar)
      if (!options.skipVirusScan) {
        metadata.virusScanResult = await this.scanForViruses(buffer);
      }

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
        await this.putFile(this.thumbnailBucket, thumbnailKey, thumbnailBuffer, {
          mimeType: 'image/jpeg',
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

      // Generate PDF thumbnail (first page as image)
      // This would require pdf2pic or similar library
      // For now, just set a placeholder
      
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
      // This would integrate with ClamAV or similar
      // For now, just return clean for files under 10MB
      if (buffer.length > 10 * 1024 * 1024) {
        return 'error'; // File too large
      }
      
      return 'clean';
    } catch {
      return 'error';
    }
  }

  /**
   * Clean up old thumbnails
   */
  async cleanupThumbnails(olderThanDays: number = 30): Promise<void> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

      const objectsStream = this.client.listObjects(this.thumbnailBucket, '', true);
      const objectsToDelete: string[] = [];

      objectsStream.on('data', (obj) => {
        if (obj.lastModified && obj.lastModified < cutoffDate) {
          objectsToDelete.push(obj.name!);
        }
      });

      objectsStream.on('end', async () => {
        if (objectsToDelete.length > 0) {
          await this.client.removeObjects(this.thumbnailBucket, objectsToDelete);
          console.log(`Cleaned up ${objectsToDelete.length} old thumbnails`);
        }
      });
      
    } catch (error) {
      console.error('Thumbnail cleanup failed:', error);
    }
  }

  /**
   * Get file download URL (presigned)
   */
  async getFileUrl(
    bucket: string,
    key: string,
    expirySeconds: number = 3600
  ): Promise<string> {
    try {
      return await this.client.presignedGetObject(bucket, key, expirySeconds);
    } catch (error) {
      throw new Error(`Failed to generate download URL for ${key}: ${error}`);
    }
  }

  /**
   * Get file upload URL (presigned)
   */
  async getUploadUrl(
    bucket: string,
    key: string,
    expirySeconds: number = 3600
  ): Promise<string> {
    try {
      return await this.client.presignedPutObject(bucket, key, expirySeconds);
    } catch (error) {
      throw new Error(`Failed to generate upload URL for ${key}: ${error}`);
    }
  }

  /**
   * Check if file exists
   */
  async fileExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.statObject(bucket, key);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Delete file
   */
  async deleteFile(bucket: string, key: string): Promise<void> {
    try {
      await this.client.removeObject(bucket, key);
    } catch (error) {
      throw new Error(`Failed to delete file ${key} from bucket ${bucket}: ${error}`);
    }
  }

  /**
   * Get client health status
   */
  async getHealth(): Promise<{ status: string; buckets: string[] }> {
    try {
      const buckets = await this.client.listBuckets();
      return {
        status: 'healthy',
        buckets: buckets.map(b => b.name),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        buckets: [],
      };
    }
  }
}

// Singleton instance
export const fileStorageService = new FileStorageService();