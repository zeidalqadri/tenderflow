import { Job } from 'bullmq';
import { FileProcessJobData, FileProcessResult } from '../queues';
import { fileStorageService } from '../services/file-storage';

/**
 * File Processing Job Processor
 * 
 * Handles file processing tasks:
 * - File type detection and validation
 * - Metadata extraction (EXIF, document properties)
 * - Thumbnail generation for images
 * - Virus scanning integration
 */
export async function processFile(
  job: Job<FileProcessJobData>
): Promise<FileProcessResult> {
  const { 
    fileKey, 
    bucket, 
    originalName, 
    mimeType, 
    size, 
    uploadedBy, 
    tenantId,
    metadata = {}
  } = job.data;

  try {
    job.log(`Starting file processing for ${fileKey}`);
    
    // Update progress
    await job.updateProgress(10);

    // Check if file exists
    if (!await fileStorageService.fileExists(bucket, fileKey)) {
      throw new Error(`File not found: ${fileKey}`);
    }

    // Process the file with all available processors
    const result = await fileStorageService.processFile(
      bucket,
      fileKey,
      originalName,
      {
        generateThumbnail: mimeType.startsWith('image/'),
        extractExif: mimeType.startsWith('image/'),
        skipVirusScan: false,
      }
    );

    await job.updateProgress(80);

    if (!result.success) {
      throw new Error(result.error || 'File processing failed');
    }

    job.log(`File processing completed for ${fileKey}`);
    await job.updateProgress(100);

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`File processing failed: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * Clean up old temporary files
 */
export async function cleanupTempFiles(job: Job): Promise<void> {
  try {
    job.log('Starting temporary file cleanup');
    
    const daysOld = 7; // Clean files older than 7 days
    await fileStorageService.cleanupThumbnails(daysOld);
    
    job.log('Temporary file cleanup completed');
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Cleanup failed: ${errorMessage}`);
    throw error;
  }
}