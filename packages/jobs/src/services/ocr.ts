import Tesseract, { createWorker } from 'tesseract.js';
import Jimp from 'jimp';
import { Buffer } from 'buffer';
import { OCRResult } from '../queues';

export interface OCROptions {
  language?: string[];
  preprocessing?: {
    denoise?: boolean;
    contrast?: boolean;
    deskew?: boolean;
    resize?: boolean;
  };
  confidence?: number; // Minimum confidence threshold (0-1)
}

export class OCRService {
  private workers: Map<string, Tesseract.Worker> = new Map();
  private readonly maxWorkers = 3;
  
  constructor() {
    // Initialize worker pool
    this.initializeWorkerPool();
  }

  private async initializeWorkerPool(): Promise<void> {
    // Create workers for different languages
    const languages = ['eng', 'rus', 'kaz']; // English, Russian, Kazakh
    
    for (const lang of languages.slice(0, this.maxWorkers)) {
      try {
        const worker = await createWorker(lang);
        this.workers.set(lang, worker);
      } catch (error) {
        console.warn(`Failed to initialize OCR worker for language ${lang}:`, error);
      }
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   */
  private async preprocessImage(
    buffer: Buffer,
    options: OCROptions['preprocessing'] = {}
  ): Promise<Buffer> {
    try {
      let image = await Jimp.read(buffer);

      // Resize if image is too large (improves performance)
      if (options.resize && (image.bitmap.width > 3000 || image.bitmap.height > 3000)) {
        image = image.scaleToFit(3000, 3000);
      }

      // Enhance contrast
      if (options.contrast) {
        image = image.contrast(0.3);
      }

      // Denoise (blur slightly to reduce noise)
      if (options.denoise) {
        image = image.blur(0.5);
      }

      // Convert to grayscale for better OCR
      image = image.greyscale();

      // Increase brightness and contrast for text
      image = image.brightness(0.1).contrast(0.2);

      return await image.getBufferAsync(Jimp.MIME_PNG);
    } catch (error) {
      console.warn('Image preprocessing failed, using original:', error);
      return buffer;
    }
  }

  /**
   * Perform OCR on image buffer
   */
  async processImage(
    buffer: Buffer,
    options: OCROptions = {}
  ): Promise<OCRResult> {
    const startTime = Date.now();
    
    try {
      // Preprocess image if options specified
      const processedBuffer = await this.preprocessImage(buffer, options.preprocessing);
      
      // Determine language to use
      const languages = options.language || ['eng'];
      const primaryLanguage = languages[0];
      
      // Get or create worker for the language
      let worker = this.workers.get(primaryLanguage);
      
      if (!worker) {
        // Create worker if not exists
        worker = await createWorker(primaryLanguage);
        this.workers.set(primaryLanguage, worker);
      }

      // Configure OCR parameters
      await worker.setParameters({
        tessedit_char_whitelist: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzАБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюя.,:-()[]{}№$/€£¥₽ ',
        tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK,
      });

      // Perform OCR
      const { data } = await worker.recognize(processedBuffer);
      
      const processingTime = Date.now() - startTime;
      
      // Parse blocks with confidence
      const blocks = data.blocks?.map(block => ({
        text: block.text,
        bbox: {
          x: block.bbox.x0,
          y: block.bbox.y0,
          width: block.bbox.x1 - block.bbox.x0,
          height: block.bbox.y1 - block.bbox.y0,
        },
        confidence: block.confidence / 100, // Convert to 0-1 scale
      })) || [];

      // Filter by confidence if threshold specified
      const confidenceThreshold = options.confidence || 0.3;
      const filteredBlocks = blocks.filter(block => block.confidence >= confidenceThreshold);
      
      // Calculate overall confidence
      const averageConfidence = filteredBlocks.length > 0
        ? filteredBlocks.reduce((sum, block) => sum + block.confidence, 0) / filteredBlocks.length
        : 0;

      return {
        success: true,
        text: data.text.trim(),
        confidence: averageConfidence,
        blocks: filteredBlocks,
        language: primaryLanguage,
        processingTime,
      };
      
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'OCR processing failed',
        processingTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Process multiple images in parallel
   */
  async processImages(
    buffers: Buffer[],
    options: OCROptions = {}
  ): Promise<OCRResult[]> {
    const promises = buffers.map(buffer => this.processImage(buffer, options));
    return Promise.all(promises);
  }

  /**
   * Extract structured data from OCR text using patterns
   */
  extractStructuredData(text: string): Record<string, any> {
    const data: Record<string, any> = {};

    // Common patterns for receipt/document parsing
    const patterns = {
      // Amounts and currencies
      amount: /(?:sum|total|amount|сумма|итого|всего)[:\s]*([0-9,.\s]+)\s*(USD|EUR|KZT|RUB|₽|\$|€|тенге)/i,
      
      // Dates
      date: /(?:date|дата)[:\s]*([0-9]{1,2}[./-][0-9]{1,2}[./-][0-9]{2,4})/i,
      
      // Reference numbers
      reference: /(?:ref|reference|номер|№)[:\s]*([A-Z0-9-]+)/i,
      
      // Organization names
      organization: /(?:company|organization|компания|организация)[:\s]*(.+?)(?:\n|$)/i,
      
      // Email addresses
      email: /([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
      
      // Phone numbers
      phone: /(?:\+7|8)[\s-]?(?:\([0-9]{3}\)|[0-9]{3})[\s-]?[0-9]{3}[\s-]?[0-9]{2}[\s-]?[0-9]{2}/g,
    };

    // Extract using patterns
    for (const [key, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        if (key === 'email' || key === 'phone') {
          // These can have multiple matches
          data[key] = Array.from(text.matchAll(new RegExp(pattern, 'g')))
            .map(m => m[1] || m[0]);
        } else {
          data[key] = match[1]?.trim();
        }
      }
    }

    return data;
  }

  /**
   * Clean up workers
   */
  async cleanup(): Promise<void> {
    const promises = Array.from(this.workers.values()).map(worker => worker.terminate());
    await Promise.all(promises);
    this.workers.clear();
  }

  /**
   * Get worker status
   */
  getWorkerStatus(): Record<string, string> {
    const status: Record<string, string> = {};
    for (const [lang, worker] of this.workers) {
      status[lang] = 'active'; // Tesseract workers don't have a direct status check
    }
    return status;
  }
}

// Singleton instance
export const ocrService = new OCRService();

// Graceful shutdown
process.on('SIGTERM', async () => {
  await ocrService.cleanup();
});

process.on('SIGINT', async () => {
  await ocrService.cleanup();
});