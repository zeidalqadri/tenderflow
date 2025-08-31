import { describe, it, expect, beforeEach } from '@jest/globals';
import { ZakupSkKzExtractor } from '../extractors/zakup-sk-kz';
import { EuTedExtractor } from '../extractors/eu-ted';
import { GenericEmailExtractor } from '../extractors/generic-email';
import { PdfInvoiceExtractor } from '../extractors/pdf-invoice';
import { extractorRegistry } from '../extractors';
import type { ExtractorContext } from '../extractors/base';

describe('Extractors', () => {
  describe('ZakupSkKzExtractor', () => {
    let extractor: ZakupSkKzExtractor;

    beforeEach(() => {
      extractor = new ZakupSkKzExtractor();
    });

    it('should identify zakup.sk.kz documents', () => {
      const context: ExtractorContext = {
        ocrText: 'zakup.sk.kz государственные закупки заявка №123456',
        fileMetadata: {
          mimeType: 'application/pdf',
          originalName: 'zakup_receipt.pdf',
        },
      };

      expect(extractor.canHandle(context)).toBe(true);
    });

    it('should extract submission reference', async () => {
      const context: ExtractorContext = {
        ocrText: `
          РЕСПУБЛИКА КАЗАХСТАН
          Портал государственных закупок zakup.sk.kz
          
          Заявка № KZ-2024-001234
          Лот № 5
          Сумма: 1,500,000 тенге
          Организация: ТОО "Тест Компания"
          БИН: 123456789012
          
          Дата подачи: 15.01.2024
          Статус: принято
        `,
        fileMetadata: {
          mimeType: 'application/pdf',
        },
      };

      const result = await extractor.extract(context);
      
      expect(result.success).toBe(true);
      expect(result.data?.submissionRef).toContain('KZ-2024-001234');
      expect(result.data?.amount).toBe(1500000);
      expect(result.data?.currency).toBe('KZT');
      expect(result.data?.bidder?.name).toContain('ТОО "Тест Компания"');
      expect(result.data?.bidder?.identifier).toBe('123456789012');
      expect(result.confidence).toBeGreaterThan(0.7);
    });

    it('should handle Kazakh language', async () => {
      const context: ExtractorContext = {
        ocrText: `
          ҚАЗАҚСТАН РЕСПУБЛИКАСЫ
          Мемлекеттік сатып алулар порталы
          
          Өтініш № KZ-2024-005678
          Сома: 2,000,000 теңге
          Ұйым: "Тест ЖШС"
        `,
      };

      const result = await extractor.extract(context);
      
      expect(result.success).toBe(true);
      expect(result.data?.submissionRef).toContain('KZ-2024-005678');
      expect(result.data?.metadata?.language).toBe('kk');
    });
  });

  describe('EuTedExtractor', () => {
    let extractor: EuTedExtractor;

    beforeEach(() => {
      extractor = new EuTedExtractor();
    });

    it('should identify TED documents', () => {
      const context: ExtractorContext = {
        ocrText: 'ted.europa.eu Notice number: 2024/S 123-456789 Contract Notice',
        fileMetadata: {
          mimeType: 'application/pdf',
          originalName: 'ted_notice.pdf',
        },
      };

      expect(extractor.canHandle(context)).toBe(true);
    });

    it('should extract TED notice information', async () => {
      const context: ExtractorContext = {
        ocrText: `
          SUPPLEMENT TO THE OFFICIAL JOURNAL OF THE EUROPEAN UNION
          Tenders Electronic Daily
          
          Notice number: 2024/S 123-456789
          Contract Notice
          
          Title: IT Services for Public Administration
          Contracting Authority: City of Brussels
          Estimated value: 500,000 EUR
          CPV: 72000000-5
          NUTS: BE100
          
          Deadline for receipt of tenders: 15/02/2024
          Type of procedure: Open procedure
        `,
        fileMetadata: {
          mimeType: 'application/pdf',
        },
      };

      const result = await extractor.extract(context);
      
      expect(result.success).toBe(true);
      expect(result.data?.submissionRef).toBe('2024/S123-456789');
      expect(result.data?.tender?.title).toContain('IT Services');
      expect(result.data?.bidder?.name).toContain('City of Brussels');
      expect(result.data?.amount).toBe(500000);
      expect(result.data?.currency).toBe('EUR');
      expect(result.data?.metadata?.cpvCodes).toContain('72000000-5');
      expect(result.data?.tender?.category).toBe('IT services');
    });

    it('should detect multiple languages', async () => {
      const context: ExtractorContext = {
        ocrText: 'Ausschreibung Vertrag Behörde Deutschland EUR',
      };

      const result = await extractor.extract(context);
      expect(result.data?.metadata?.language).toBe('de');
    });
  });

  describe('GenericEmailExtractor', () => {
    let extractor: GenericEmailExtractor;

    beforeEach(() => {
      extractor = new GenericEmailExtractor();
    });

    it('should identify email documents', () => {
      const context: ExtractorContext = {
        ocrText: `
          From: noreply@procurement.gov
          To: bidder@company.com
          Subject: Tender Submission Confirmation - Ref: TND-2024-001
          
          Your submission has been received successfully.
        `,
        fileMetadata: {
          mimeType: 'message/rfc822',
          originalName: 'submission_confirmation.eml',
        },
      };

      expect(extractor.canHandle(context)).toBe(true);
    });

    it('should extract email headers and submission info', async () => {
      const context: ExtractorContext = {
        ocrText: `
          From: procurement@city.gov
          To: contractor@example.com
          Subject: Submission Receipt - Project ABC-2024
          Date: Mon, 15 Jan 2024 10:30:00 +0100
          
          Dear Contractor,
          
          We confirm receipt of your tender submission.
          
          Submission ID: SUB-2024-001234
          Project: Road Construction Services
          Amount: 250,000 USD
          Status: Successfully submitted
          Deadline: 31/01/2024
          
          Thank you for your submission.
          
          Best regards,
          Procurement Department
          City Administration
        `,
        fileMetadata: {
          mimeType: 'text/plain',
        },
      };

      const result = await extractor.extract(context);
      
      expect(result.success).toBe(true);
      expect(result.data?.metadata?.from).toContain('procurement@city.gov');
      expect(result.data?.metadata?.subject).toContain('Project ABC-2024');
      expect(result.data?.submissionRef).toBe('SUB-2024-001234');
      expect(result.data?.tender?.title).toContain('Road Construction');
      expect(result.data?.amount).toBe(250000);
      expect(result.data?.currency).toBe('USD');
      expect(result.data?.status).toBe('successfully submitted');
    });
  });

  describe('PdfInvoiceExtractor', () => {
    let extractor: PdfInvoiceExtractor;

    beforeEach(() => {
      extractor = new PdfInvoiceExtractor();
    });

    it('should identify PDF invoice documents', () => {
      const context: ExtractorContext = {
        ocrText: 'INVOICE Invoice Number: INV-2024-001 Total Amount: 1,500.00 EUR',
        fileMetadata: {
          mimeType: 'application/pdf',
          originalName: 'invoice.pdf',
        },
      };

      expect(extractor.canHandle(context)).toBe(true);
    });

    it('should extract invoice information', async () => {
      const context: ExtractorContext = {
        ocrText: `
          INVOICE
          
          TechServices Ltd
          123 Business Street
          London, UK
          VAT: GB123456789
          
          Bill To:
          City Council
          789 Government Ave
          
          Invoice Number: INV-2024-001234
          Date: 15/01/2024
          Due Date: 15/02/2024
          
          Description: Software Development Services
          Amount: 15,750.00 GBP
          VAT: 3,150.00 GBP
          Total: 18,900.00 GBP
          
          Payment Method: Bank Transfer
          Status: Paid
        `,
        fileMetadata: {
          mimeType: 'application/pdf',
        },
      };

      const result = await extractor.extract(context);
      
      expect(result.success).toBe(true);
      expect(result.data?.submissionRef).toBe('INV-2024-001234');
      expect(result.data?.bidder?.name).toContain('TechServices Ltd');
      expect(result.data?.bidder?.identifier).toBe('GB123456789');
      expect(result.data?.amount).toBe(18900);
      expect(result.data?.currency).toBe('GBP');
      expect(result.data?.tender?.title).toContain('Software Development');
      expect(result.data?.metadata?.customer).toContain('City Council');
      expect(result.data?.status).toBe('paid');
    });
  });

  describe('ExtractorRegistry', () => {
    it('should return compatible extractors', () => {
      const context: ExtractorContext = {
        ocrText: 'zakup.sk.kz заявка №123',
        fileMetadata: {
          mimeType: 'application/pdf',
        },
      };

      const compatible = extractorRegistry.getCompatibleExtractors(context);
      expect(compatible).toHaveLength(2); // ZakupSkKz and PdfInvoice
      expect(compatible[0]).toBeInstanceOf(ZakupSkKzExtractor);
    });

    it('should return best extractor by priority', () => {
      const context: ExtractorContext = {
        ocrText: 'ted.europa.eu Notice number: 2024/S 123-456789',
        fileMetadata: {
          mimeType: 'application/pdf',
        },
      };

      const best = extractorRegistry.getBestExtractor(context);
      expect(best).toBeInstanceOf(EuTedExtractor);
    });

    it('should return capabilities summary', () => {
      const capabilities = extractorRegistry.getCapabilities();
      
      expect(capabilities).toHaveLength(4);
      expect(capabilities[0].type).toBe('zakup-sk-kz');
      expect(capabilities[0].supportedMimeTypes).toContain('application/pdf');
      expect(capabilities[1].type).toBe('eu-ted');
      expect(capabilities[2].type).toBe('generic-email');
      expect(capabilities[3].type).toBe('pdf-invoice');
    });
  });
});