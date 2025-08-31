import { BaseExtractor, ExtractorContext, ExtractionResult, ExtractedData } from './base';

/**
 * Generic email receipt extractor
 * Handles parsing of email-based tender submissions and receipts
 */
export class GenericEmailExtractor extends BaseExtractor {
  readonly type = 'generic-email';
  readonly version = '1.0.0';
  readonly supportedMimeTypes = ['text/plain', 'text/html', 'message/rfc822', 'application/pdf'];

  canHandle(context: ExtractorContext): boolean {
    const text = (context.ocrText || '').toLowerCase();
    const fileName = (context.fileMetadata?.originalName || '').toLowerCase();
    const mimeType = context.fileMetadata?.mimeType || '';
    
    // Check for email-specific indicators
    const emailIndicators = [
      'from:',
      'to:',
      'subject:',
      'sent:',
      'received:',
      '@',
      'mailto:',
      'reply-to:',
      'message-id:',
    ];
    
    const hasEmailIndicator = emailIndicators.some(indicator => 
      text.includes(indicator) || fileName.includes(indicator)
    );
    
    // Check MIME type
    const isEmailMimeType = [
      'message/rfc822',
      'text/plain',
      'text/html',
    ].includes(mimeType);
    
    // Check for email file extensions
    const emailExtensions = ['.eml', '.msg', '.mbox'];
    const hasEmailExtension = emailExtensions.some(ext => fileName.endsWith(ext));
    
    // Check for submission/receipt patterns in email context
    const submissionPatterns = [
      /tender\s+submission/i,
      /bid\s+submission/i,
      /proposal\s+submission/i,
      /application\s+submitted/i,
      /receipt\s+confirmation/i,
      /submission\s+confirmation/i,
      /automatic\s+reply/i,
      /no-reply@/i,
    ];
    
    const hasSubmissionPattern = submissionPatterns.some(pattern => 
      pattern.test(text)
    );
    
    return (hasEmailIndicator && hasSubmissionPattern) || 
           isEmailMimeType || 
           hasEmailExtension;
  }

  async extract(context: ExtractorContext): Promise<ExtractionResult> {
    const startTime = Date.now();
    const text = context.ocrText || '';
    const errors: string[] = [];
    const warnings: string[] = [];
    
    try {
      const data: ExtractedData = {
        metadata: {
          extractorType: 'email',
          language: this.detectLanguage(text),
        },
      };

      // Extract email-specific data
      this.extractEmailHeaders(text, data);
      this.extractSubmissionInfo(text, data);
      this.extractTenderInfo(text, data);
      this.extractContactInfo(text, data);
      this.extractAmountInfo(text, data);
      this.extractDates(text, data);
      this.extractAttachmentInfo(text, data);
      
      // Calculate confidence based on extracted fields
      const confidence = this.calculateConfidence(data, text);
      
      // Validate extracted data
      const validation = this.validateData(data);
      if (!validation.isValid) {
        errors.push(...validation.errors);
      }
      
      return {
        success: true,
        confidence,
        data,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined,
        extractorType: this.type,
        extractorVersion: this.version,
        processingTime: Date.now() - startTime,
      };
      
    } catch (error) {
      return {
        success: false,
        confidence: 0,
        errors: [error instanceof Error ? error.message : 'Extraction failed'],
        extractorType: this.type,
        extractorVersion: this.version,
        processingTime: Date.now() - startTime,
      };
    }
  }

  private detectLanguage(text: string): string {
    const languagePatterns = [
      { lang: 'en', words: ['subject', 'from', 'to', 'sent', 'received', 'submission', 'tender'] },
      { lang: 'de', words: ['betreff', 'von', 'an', 'gesendet', 'eingereicht', 'ausschreibung'] },
      { lang: 'fr', words: ['objet', 'de', 'à', 'envoyé', 'soumission', 'appel'] },
      { lang: 'es', words: ['asunto', 'de', 'para', 'enviado', 'presentación', 'licitación'] },
      { lang: 'ru', words: ['тема', 'от', 'кому', 'отправлено', 'подача', 'тендер'] },
    ];
    
    const lowerText = text.toLowerCase();
    let maxScore = 0;
    let detectedLang = 'en';
    
    for (const { lang, words } of languagePatterns) {
      const score = words.filter(word => lowerText.includes(word)).length;
      if (score > maxScore) {
        maxScore = score;
        detectedLang = lang;
      }
    }
    
    return detectedLang;
  }

  private extractEmailHeaders(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Extract From field
    const fromPatterns = [
      /from:\s*([^\n\r]+)/i,
      /von:\s*([^\n\r]+)/i,
      /de:\s*([^\n\r]+)/i,
    ];
    
    for (const pattern of fromPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.from = match[1].trim();
        
        // Extract sender email
        const emailMatch = match[1].match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        if (emailMatch) {
          data.metadata.fromEmail = emailMatch[1];
        }
        break;
      }
    }
    
    // Extract To field
    const toPatterns = [
      /to:\s*([^\n\r]+)/i,
      /an:\s*([^\n\r]+)/i,
      /à:\s*([^\n\r]+)/i,
    ];
    
    for (const pattern of toPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.to = match[1].trim();
        break;
      }
    }
    
    // Extract Subject
    const subjectPatterns = [
      /subject:\s*([^\n\r]+)/i,
      /betreff:\s*([^\n\r]+)/i,
      /objet:\s*([^\n\r]+)/i,
      /asunto:\s*([^\n\r]+)/i,
      /тема:\s*([^\n\r]+)/i,
    ];
    
    for (const pattern of subjectPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.subject = match[1].trim();
        
        // Extract tender/submission reference from subject
        const refMatch = match[1].match(/(?:ref|reference|№|#)[\s:]*([a-z0-9-]+)/i);
        if (refMatch) {
          data.submissionRef = refMatch[1];
        }
        break;
      }
    }
    
    // Extract Message-ID
    const messageIdPattern = /message-id:\s*<([^>]+)>/i;
    const messageIdMatch = text.match(messageIdPattern);
    if (messageIdMatch) {
      data.metadata.messageId = messageIdMatch[1];
    }
  }

  private extractSubmissionInfo(text: string, data: ExtractedData): void {
    // Extract submission confirmation patterns
    const confirmationPatterns = [
      /submission\s+(?:id|number|reference)[\s:]*([a-z0-9-]+)/i,
      /confirmation\s+(?:id|number|reference)[\s:]*([a-z0-9-]+)/i,
      /receipt\s+(?:id|number|reference)[\s:]*([a-z0-9-]+)/i,
      /tracking\s+(?:id|number|reference)[\s:]*([a-z0-9-]+)/i,
    ];
    
    for (const pattern of confirmationPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.submissionRef = match[1];
        data.portalId = `email-${match[1]}`;
        break;
      }
    }
    
    // Extract status information
    const statusPatterns = [
      /status[\s:]*([^\n]{3,30})/i,
      /your\s+(?:submission|bid|proposal)\s+(?:has\s+been|is)\s+([^\n]{3,30})/i,
      /(?:successfully|successfully)\s+(submitted|received|processed)/i,
    ];
    
    for (const pattern of statusPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.status = match[1].trim().toLowerCase();
        break;
      }
    }
  }

  private extractTenderInfo(text: string, data: ExtractedData): void {
    if (!data.tender) data.tender = {};
    
    // Extract tender title from various contexts
    const titlePatterns = [
      /tender[\s:]*([^\n]{10,200})/i,
      /project[\s:]*([^\n]{10,200})/i,
      /opportunity[\s:]*([^\n]{10,200})/i,
      /contract[\s:]*([^\n]{10,200})/i,
      /regarding[\s:]*([^\n]{10,200})/i,
      /re[\s:]*([^\n]{10,200})/i,
    ];
    
    for (const pattern of titlePatterns) {
      const match = text.match(pattern);
      if (match) {
        const title = match[1].trim().replace(/[;,.]$/, '');
        if (title.length >= 10) {
          data.tender.title = title;
          break;
        }
      }
    }
    
    // Extract tender reference from body
    const refPatterns = [
      /tender\s+(?:reference|ref|number|no)[\s:]*([a-z0-9-]+)/i,
      /project\s+(?:reference|ref|number|no)[\s:]*([a-z0-9-]+)/i,
      /rfp[\s:]*([a-z0-9-]+)/i,
      /rfq[\s:]*([a-z0-9-]+)/i,
    ];
    
    for (const pattern of refPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.tender.reference = match[1];
        break;
      }
    }
  }

  private extractContactInfo(text: string, data: ExtractedData): void {
    if (!data.bidder) data.bidder = {};
    
    // Extract organization from signature or body
    const orgPatterns = [
      /(?:from|regards|best\s+regards)[\s\S]*?([A-Z][^\n]*(?:ltd|llc|inc|corp|gmbh|sa|bv|limited|company|corporation))/i,
      /this\s+email\s+is\s+from\s+([^\n]{5,100})/i,
      /sent\s+on\s+behalf\s+of\s+([^\n]{5,100})/i,
    ];
    
    for (const pattern of orgPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.bidder.name = match[1].trim().replace(/[;,.]$/, '');
        break;
      }
    }
    
    // Extract all emails and phones
    const emails = this.extractEmails(text);
    const phones = this.extractPhones(text);
    
    if (emails.length > 0 || phones.length > 0) {
      data.bidder.contact = JSON.stringify({
        emails,
        phones,
      });
    }
  }

  private extractAmountInfo(text: string, data: ExtractedData): void {
    // Look for amount information in email body
    const amountPatterns = [
      /(?:total|amount|sum|value|price|cost)[\s:]*([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£)/i,
      /([0-9,.\s]+)\s*(USD|EUR|GBP|\$|€|£)/i,
    ];
    
    for (const pattern of amountPatterns) {
      const match = text.match(pattern);
      if (match) {
        const parsed = this.parseAmount(`${match[1]} ${match[2]}`);
        if (parsed.amount) {
          data.amount = parsed.amount;
          data.currency = parsed.currency;
          break;
        }
      }
    }
  }

  private extractDates(text: string, data: ExtractedData): void {
    // Extract email date/time
    const datePatterns = [
      /(?:sent|date|received)[\s:]*([^\n]{8,50})/i,
      /on\s+([a-z]+,\s+[a-z]+\s+\d{1,2},\s+\d{4})/i,
    ];
    
    for (const pattern of datePatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.timestamp = date;
          break;
        }
      }
    }
    
    // Extract deadline mentioned in email
    const deadlinePatterns = [
      /deadline[\s:]*([^\n]{8,50})/i,
      /due\s+(?:date|by)[\s:]*([^\n]{8,50})/i,
      /submit\s+by[\s:]*([^\n]{8,50})/i,
      /closing\s+date[\s:]*([^\n]{8,50})/i,
    ];
    
    for (const pattern of deadlinePatterns) {
      const match = text.match(pattern);
      if (match) {
        const date = this.parseDate(match[1]);
        if (date) {
          data.deadline = date;
          if (!data.tender) data.tender = {};
          data.tender.deadline = date;
          break;
        }
      }
    }
  }

  private extractAttachmentInfo(text: string, data: ExtractedData): void {
    if (!data.metadata) data.metadata = {};
    
    // Look for attachment mentions
    const attachmentPatterns = [
      /attachment(?:s)?[\s:]*([^\n]+)/i,
      /attached[\s:]*([^\n]+)/i,
      /please\s+find\s+attached[\s:]*([^\n]+)/i,
      /file(?:s)?\s+attached[\s:]*([^\n]+)/i,
    ];
    
    for (const pattern of attachmentPatterns) {
      const match = text.match(pattern);
      if (match) {
        data.metadata.attachmentMention = match[1].trim();
        break;
      }
    }
    
    // Look for file names/extensions mentioned
    const filePatterns = [
      /([a-z0-9_-]+\.(?:pdf|doc|docx|xls|xlsx|zip|rar))/gi,
    ];
    
    const fileMatches = Array.from(text.matchAll(filePatterns[0]));
    if (fileMatches.length > 0) {
      data.metadata.mentionedFiles = fileMatches.map(match => match[1]);
    }
  }

  private calculateConfidence(data: ExtractedData, text: string): number {
    let score = 0;
    const maxScore = 10;
    
    // Email headers present (2 points)
    if (data.metadata?.from && data.metadata?.subject) {
      score += 2;
    }
    
    // Submission reference (2 points)
    if (data.submissionRef) score += 2;
    
    // Tender information (2 points)
    if (data.tender?.title) score += 1;
    if (data.tender?.reference) score += 1;
    
    // Contact information (2 points)
    if (data.bidder?.name) score += 1;
    if (data.bidder?.contact) score += 1;
    
    // Status information (1 point)
    if (data.status) score += 1;
    
    // Date information (1 point)
    if (data.timestamp) score += 1;
    
    return score / maxScore;
  }
}