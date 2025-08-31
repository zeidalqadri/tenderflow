import { BaseExtractor, ExtractorContext } from './base';
import { ZakupSkKzExtractor } from './zakup-sk-kz';
import { EuTedExtractor } from './eu-ted';
import { GenericEmailExtractor } from './generic-email';
import { PdfInvoiceExtractor } from './pdf-invoice';

/**
 * Extractor registry - manages all available extractors
 */
export class ExtractorRegistry {
  private extractors: BaseExtractor[] = [
    new ZakupSkKzExtractor(),
    new EuTedExtractor(),
    new GenericEmailExtractor(),
    new PdfInvoiceExtractor(),
  ];

  /**
   * Get all extractors that can handle the given context
   */
  getCompatibleExtractors(context: ExtractorContext): BaseExtractor[] {
    return this.extractors.filter(extractor => extractor.canHandle(context));
  }

  /**
   * Get the best extractor for the given context
   * Returns the first compatible extractor with highest priority
   */
  getBestExtractor(context: ExtractorContext): BaseExtractor | null {
    const compatible = this.getCompatibleExtractors(context);
    
    // Priority order: specific portals first, then generic
    const priority = ['zakup-sk-kz', 'eu-ted', 'generic-email', 'pdf-invoice'];
    
    for (const type of priority) {
      const extractor = compatible.find(e => e.type === type);
      if (extractor) return extractor;
    }
    
    return compatible.length > 0 ? compatible[0] : null;
  }

  /**
   * Get extractor by type
   */
  getExtractor(type: string): BaseExtractor | null {
    return this.extractors.find(e => e.type === type) || null;
  }

  /**
   * Register a new extractor
   */
  registerExtractor(extractor: BaseExtractor): void {
    const existing = this.extractors.findIndex(e => e.type === extractor.type);
    if (existing >= 0) {
      this.extractors[existing] = extractor;
    } else {
      this.extractors.push(extractor);
    }
  }

  /**
   * Get all registered extractors
   */
  getAllExtractors(): BaseExtractor[] {
    return [...this.extractors];
  }

  /**
   * Get extractor capabilities summary
   */
  getCapabilities(): Array<{
    type: string;
    version: string;
    supportedMimeTypes: string[];
  }> {
    return this.extractors.map(extractor => ({
      type: extractor.type,
      version: extractor.version,
      supportedMimeTypes: [...extractor.supportedMimeTypes],
    }));
  }
}

// Global registry instance
export const extractorRegistry = new ExtractorRegistry();

// Re-export types and classes for convenience
export * from './base';
export { ZakupSkKzExtractor } from './zakup-sk-kz';
export { EuTedExtractor } from './eu-ted';
export { GenericEmailExtractor } from './generic-email';
export { PdfInvoiceExtractor } from './pdf-invoice';