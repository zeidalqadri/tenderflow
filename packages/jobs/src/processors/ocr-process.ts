import { Job } from 'bullmq';
import { OCRProcessJobData, OCRResult } from '../queues';
import { fileStorageService } from '../services/file-storage';
import { ocrService } from '../services/ocr';

/**
 * OCR Processing Job Processor
 * 
 * Handles dedicated OCR processing tasks:
 * - Image preprocessing and optimization
 * - Multi-language OCR processing
 * - Text extraction with confidence scoring
 * - Block-level text analysis
 */
export async function processOcr(
  job: Job<OCRProcessJobData>
): Promise<OCRResult> {
  const { 
    fileKey, 
    bucket, 
    language = ['eng'], 
    outputFormat = 'text',
    preprocessing = {}
  } = job.data;

  try {
    job.log(`Starting OCR processing for ${fileKey}`);
    
    await job.updateProgress(10);

    // Download file from storage
    if (!await fileStorageService.fileExists(bucket, fileKey)) {
      throw new Error(`File not found: ${fileKey}`);
    }

    const fileBuffer = await fileStorageService.getFile(bucket, fileKey);
    job.log(`Downloaded file: ${fileBuffer.length} bytes`);
    
    await job.updateProgress(30);

    // Process with OCR service
    const result = await ocrService.processImage(fileBuffer, {
      language,
      preprocessing,
      confidence: 0.3,
    });

    await job.updateProgress(80);

    if (!result.success) {
      throw new Error(result.error || 'OCR processing failed');
    }

    // Save OCR results if needed
    if (outputFormat === 'json' || outputFormat === 'pdf') {
      const outputKey = `ocr/${fileKey}.${outputFormat}`;
      await saveOcrOutput(bucket, outputKey, result, outputFormat);
      job.log(`Saved OCR output to: ${outputKey}`);
    }

    await job.updateProgress(100);
    job.log(`OCR processing completed with confidence: ${result.confidence?.toFixed(2) || 'N/A'}`);
    
    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`OCR processing failed: ${errorMessage}`);
    
    return {
      success: false,
      error: errorMessage,
      processingTime: 0,
    };
  }
}

/**
 * Save OCR output in different formats
 */
async function saveOcrOutput(
  bucket: string,
  outputKey: string,
  result: OCRResult,
  format: 'json' | 'pdf' | 'text'
): Promise<void> {
  let content: Buffer;
  let mimeType: string;

  switch (format) {
    case 'json':
      content = Buffer.from(JSON.stringify(result, null, 2));
      mimeType = 'application/json';
      break;
      
    case 'text':
      content = Buffer.from(result.text || '');
      mimeType = 'text/plain';
      break;
      
    case 'pdf':
      // This would require a PDF generation library
      // For now, save as JSON
      content = Buffer.from(JSON.stringify(result, null, 2));
      mimeType = 'application/json';
      break;
      
    default:
      throw new Error(`Unsupported output format: ${format}`);
  }

  await fileStorageService.putFile(bucket, outputKey, content, { mimeType });
}

/**
 * Batch OCR processing for multiple files
 */
export async function processBatchOcr(
  job: Job<{ files: OCRProcessJobData[] }>
): Promise<OCRResult[]> {
  const { files } = job.data;
  const results: OCRResult[] = [];

  try {
    job.log(`Starting batch OCR processing for ${files.length} files`);
    
    for (let i = 0; i < files.length; i++) {
      const fileData = files[i];
      job.log(`Processing file ${i + 1}/${files.length}: ${fileData.fileKey}`);
      
      try {
        const result = await processOcr({ data: fileData } as Job<OCRProcessJobData>);
        results.push(result);
        
        const progress = ((i + 1) / files.length) * 100;
        await job.updateProgress(progress);
        
      } catch (error) {
        const errorResult: OCRResult = {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          processingTime: 0,
        };
        results.push(errorResult);
      }
    }

    job.log(`Batch OCR processing completed. ${results.filter(r => r.success).length}/${files.length} successful`);
    
    return results;

  } catch (error) {
    job.log(`Batch OCR processing failed: ${error}`);
    throw error;
  }
}