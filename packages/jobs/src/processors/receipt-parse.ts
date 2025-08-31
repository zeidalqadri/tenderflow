import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { ReceiptParseJobData, ReceiptParseResult } from '../queues';
import { fileStorageService } from '../services/file-storage';
import { ocrService } from '../services/ocr';
import { extractorRegistry, ExtractorContext } from '../extractors';
import { fileTypeFromBuffer } from 'file-type';

const prisma = new PrismaClient();

/**
 * Receipt Parse Job Processor
 * 
 * This processor handles the complete receipt parsing pipeline:
 * 1. Downloads files from MinIO
 * 2. Runs OCR on images/PDFs  
 * 3. Applies portal-specific extractors
 * 4. Stores parsed JSON with structured metadata
 * 5. Updates submission record
 */
export async function processReceiptParse(
  job: Job<ReceiptParseJobData>
): Promise<ReceiptParseResult> {
  const { submissionId, receiptKey, tenantId, userId, metadata = {} } = job.data;
  const startTime = Date.now();

  try {
    job.log(`Starting receipt parsing for submission ${submissionId}`);
    
    // Update job progress
    await job.updateProgress(10);

    // 1. Validate submission exists
    const submission = await prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        tender: {
          select: { id: true, title: true, tenantId: true }
        }
      }
    });

    if (!submission) {
      throw new Error(`Submission ${submissionId} not found`);
    }

    if (submission.tender.tenantId !== tenantId) {
      throw new Error(`Submission ${submissionId} does not belong to tenant ${tenantId}`);
    }

    job.log(`Found submission: ${submission.id}`);
    await job.updateProgress(20);

    // 2. Download file from MinIO
    const bucket = process.env.MINIO_DEFAULT_BUCKET || 'tenderflow-files';
    
    if (!await fileStorageService.fileExists(bucket, receiptKey)) {
      throw new Error(`Receipt file not found: ${receiptKey}`);
    }

    job.log(`Downloading file: ${receiptKey}`);
    const fileBuffer = await fileStorageService.getFile(bucket, receiptKey);
    const fileMetadata = await fileStorageService.getFileMetadata(bucket, receiptKey);
    
    await job.updateProgress(30);

    // 3. Detect file type
    const detectedType = await fileTypeFromBuffer(fileBuffer);
    const mimeType = detectedType?.mime || fileMetadata.contentType || 'application/octet-stream';
    
    job.log(`File type detected: ${mimeType}`);

    // 4. Perform OCR if needed (images and PDFs)
    let ocrText = '';
    let ocrConfidence = 0;
    
    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
      job.log('Starting OCR processing');
      
      // Determine language based on tenant/user preferences
      const ocrLanguages = this.getOcrLanguages(tenantId, metadata);
      
      const ocrResult = await ocrService.processImage(fileBuffer, {
        language: ocrLanguages,
        preprocessing: {
          denoise: true,
          contrast: true,
          resize: true,
        },
        confidence: 0.3,
      });

      if (ocrResult.success && ocrResult.text) {
        ocrText = ocrResult.text;
        ocrConfidence = ocrResult.confidence || 0;
        job.log(`OCR completed with confidence: ${ocrConfidence.toFixed(2)}`);
      } else {
        job.log(`OCR failed: ${ocrResult.error || 'Unknown error'}`);
      }
    }
    
    await job.updateProgress(50);

    // 5. Create extraction context
    const context: ExtractorContext = {
      ocrText,
      ocrConfidence,
      fileMetadata: {
        mimeType,
        size: fileBuffer.length,
        originalName: metadata.originalName || receiptKey,
      },
      submissionMetadata: metadata,
    };

    // 6. Find and run extractors
    job.log('Finding compatible extractors');
    const compatibleExtractors = extractorRegistry.getCompatibleExtractors(context);
    
    if (compatibleExtractors.length === 0) {
      job.log('No compatible extractors found, using fallback');
      
      // Return basic OCR result
      const result: ReceiptParseResult = {
        success: true,
        ocrText,
        confidence: ocrConfidence,
        parsed: {
          metadata: {
            extractorUsed: 'none',
            ocrOnly: true,
            fileType: mimeType,
          },
        },
        processingTime: Date.now() - startTime,
      };

      await this.saveParsingResult(submissionId, result);
      await job.updateProgress(100);
      
      return result;
    }

    job.log(`Found ${compatibleExtractors.length} compatible extractors`);
    await job.updateProgress(60);

    // 7. Run extractors (try in priority order)
    let bestResult: any = null;
    let bestConfidence = 0;

    for (const extractor of compatibleExtractors) {
      try {
        job.log(`Running extractor: ${extractor.type} v${extractor.version}`);
        
        const extractionResult = await extractor.extract(context);
        
        if (extractionResult.success && extractionResult.confidence > bestConfidence) {
          bestResult = extractionResult;
          bestConfidence = extractionResult.confidence;
          
          job.log(`Extractor ${extractor.type} succeeded with confidence: ${extractionResult.confidence.toFixed(2)}`);
          
          // If we get high confidence, we can stop
          if (extractionResult.confidence > 0.8) {
            break;
          }
        }
      } catch (error) {
        job.log(`Extractor ${extractor.type} failed: ${error}`);
      }
    }

    await job.updateProgress(80);

    // 8. Prepare final result
    const result: ReceiptParseResult = {
      success: true,
      ocrText,
      confidence: bestResult ? bestResult.confidence : ocrConfidence,
      parsed: bestResult ? bestResult.data : undefined,
      processingTime: Date.now() - startTime,
    };

    // Add extraction metadata
    if (bestResult) {
      if (!result.parsed) result.parsed = {};
      if (!result.parsed.metadata) result.parsed.metadata = {};
      
      result.parsed.metadata = {
        ...result.parsed.metadata,
        extractorUsed: bestResult.extractorType,
        extractorVersion: bestResult.extractorVersion,
        extractorConfidence: bestResult.confidence,
        processingTime: bestResult.processingTime,
        errors: bestResult.errors,
        warnings: bestResult.warnings,
        fileType: mimeType,
        fileSize: fileBuffer.length,
        ocrConfidence,
      };
    }

    // 9. Save results to database
    await this.saveParsingResult(submissionId, result);
    
    job.log(`Receipt parsing completed successfully`);
    await job.updateProgress(100);

    return result;

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Receipt parsing failed: ${errorMessage}`);
    
    const result: ReceiptParseResult = {
      success: false,
      error: errorMessage,
      processingTime: Date.now() - startTime,
    };

    // Try to save error to database
    try {
      await this.saveParsingResult(submissionId, result);
    } catch (saveError) {
      job.log(`Failed to save error result: ${saveError}`);
    }

    throw error;
  }
}

/**
 * Get OCR languages based on tenant/user preferences
 */
function getOcrLanguages(tenantId: string, metadata: any): string[] {
  // Default languages
  const defaultLanguages = ['eng', 'rus', 'kaz'];
  
  // Check metadata for language hints
  if (metadata.language) {
    const langMap: { [key: string]: string } = {
      'en': 'eng',
      'ru': 'rus', 
      'kk': 'kaz',
      'de': 'deu',
      'fr': 'fra',
      'es': 'spa',
    };
    
    const ocrLang = langMap[metadata.language];
    if (ocrLang) {
      return [ocrLang, ...defaultLanguages.filter(l => l !== ocrLang)];
    }
  }
  
  return defaultLanguages;
}

/**
 * Save parsing results to database
 */
async function saveParsingResult(
  submissionId: string, 
  result: ReceiptParseResult
): Promise<void> {
  const updateData: any = {
    parsedAt: new Date(),
    parseVersion: '1.0.0',
  };

  if (result.success && result.parsed) {
    updateData.parsed = result.parsed;
    
    // Extract specific fields for database columns
    if (result.parsed.amount) {
      updateData.amount = result.parsed.amount;
    }
    
    if (result.parsed.currency) {
      updateData.currency = result.parsed.currency;
    }
    
    if (result.parsed.status) {
      updateData.status = result.parsed.status;
    }
    
    // Update portal data
    updateData.portalData = {
      ...(result.parsed.metadata || {}),
      ocrText: result.ocrText,
      ocrConfidence: result.confidence,
    };
  } else {
    // Save error info
    updateData.portalData = {
      error: result.error,
      processingTime: result.processingTime,
    };
  }

  await prisma.submission.update({
    where: { id: submissionId },
    data: updateData,
  });
}