import { Job } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { RulesApplicationJobData } from '../queues';

const prisma = new PrismaClient();

/**
 * Rules Application Job Processor
 * 
 * Handles applying business rules for:
 * - Tender categorization
 * - Submission validation
 * - Automatic status updates
 * - Compliance checking
 */
export async function processRulesApplication(
  job: Job<RulesApplicationJobData>
): Promise<{ success: boolean; appliedRules: string[]; error?: string }> {
  const { tenderId, submissionId, documentId, rulesetId, context } = job.data;

  try {
    job.log(`Applying rules for tender: ${tenderId}`);
    
    await job.updateProgress(10);

    const appliedRules: string[] = [];

    // Load tender data
    const tender = await prisma.tender.findUnique({
      where: { id: tenderId },
      include: {
        submissions: true,
        documents: true,
        validations: true,
      },
    });

    if (!tender) {
      throw new Error(`Tender ${tenderId} not found`);
    }

    await job.updateProgress(20);

    // Apply categorization rules
    const categoryRules = await applyCategorization(job, tender, context);
    appliedRules.push(...categoryRules);
    
    await job.updateProgress(40);

    // Apply validation rules
    const validationRules = await applyValidation(job, tender, context);
    appliedRules.push(...validationRules);
    
    await job.updateProgress(60);

    // Apply status rules
    const statusRules = await applyStatusRules(job, tender, context);
    appliedRules.push(...statusRules);
    
    await job.updateProgress(80);

    // Apply compliance rules
    const complianceRules = await applyComplianceRules(job, tender, context);
    appliedRules.push(...complianceRules);

    await job.updateProgress(100);
    job.log(`Rules application completed. Applied ${appliedRules.length} rules`);
    
    return {
      success: true,
      appliedRules,
    };

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    job.log(`Rules application failed: ${errorMessage}`);
    
    return {
      success: false,
      appliedRules: [],
      error: errorMessage,
    };
  }
}

/**
 * Apply categorization rules
 */
async function applyCategorization(
  job: Job,
  tender: any,
  context: Record<string, any>
): Promise<string[]> {
  const appliedRules: string[] = [];

  try {
    // Rule: Categorize based on title keywords
    const titleKeywords = [
      { keywords: ['software', 'system', 'application', 'development'], category: 'IT_SERVICES' },
      { keywords: ['construction', 'building', 'infrastructure'], category: 'CONSTRUCTION' },
      { keywords: ['consulting', 'advisory', 'strategy'], category: 'CONSULTING' },
      { keywords: ['supply', 'equipment', 'materials'], category: 'SUPPLIES' },
      { keywords: ['maintenance', 'repair', 'service'], category: 'MAINTENANCE' },
      { keywords: ['research', 'study', 'analysis'], category: 'RESEARCH' },
      { keywords: ['training', 'education', 'workshop'], category: 'TRAINING' },
    ];

    const title = tender.title?.toLowerCase() || '';
    const description = tender.description?.toLowerCase() || '';
    
    for (const rule of titleKeywords) {
      const hasKeyword = rule.keywords.some(keyword => 
        title.includes(keyword) || description.includes(keyword)
      );
      
      if (hasKeyword && tender.category !== rule.category) {
        await prisma.tender.update({
          where: { id: tender.id },
          data: { category: rule.category },
        });
        
        appliedRules.push(`categorization:keyword:${rule.category}`);
        job.log(`Applied categorization rule: ${rule.category} based on keywords`);
        break;
      }
    }

    // Rule: Categorize based on estimated value
    if (tender.estimatedValue) {
      const value = Number(tender.estimatedValue);
      let newCategory = tender.category;
      
      if (value > 1000000 && !['CONSTRUCTION', 'IT_SERVICES'].includes(tender.category)) {
        // Large value tenders are likely construction or major IT projects
        newCategory = 'CONSTRUCTION';
      } else if (value < 10000 && tender.category === 'OTHER') {
        // Small value tenders are likely supplies
        newCategory = 'SUPPLIES';
      }
      
      if (newCategory !== tender.category) {
        await prisma.tender.update({
          where: { id: tender.id },
          data: { category: newCategory },
        });
        
        appliedRules.push(`categorization:value:${newCategory}`);
        job.log(`Applied value-based categorization: ${newCategory}`);
      }
    }

  } catch (error) {
    job.log(`Categorization rules error: ${error}`);
  }

  return appliedRules;
}

/**
 * Apply validation rules
 */
async function applyValidation(
  job: Job,
  tender: any,
  context: Record<string, any>
): Promise<string[]> {
  const appliedRules: string[] = [];

  try {
    const criteria: any = {};
    let score = 100;

    // Rule: Check required fields
    if (!tender.title || tender.title.length < 10) {
      criteria.title = { valid: false, reason: 'Title too short or missing' };
      score -= 20;
    } else {
      criteria.title = { valid: true };
    }

    if (!tender.description || tender.description.length < 50) {
      criteria.description = { valid: false, reason: 'Description too short or missing' };
      score -= 15;
    } else {
      criteria.description = { valid: true };
    }

    if (!tender.deadline) {
      criteria.deadline = { valid: false, reason: 'Deadline missing' };
      score -= 25;
    } else if (new Date(tender.deadline) < new Date()) {
      criteria.deadline = { valid: false, reason: 'Deadline in the past' };
      score -= 10;
    } else {
      criteria.deadline = { valid: true };
    }

    // Rule: Check document requirements
    const requiredDocs = ['RFP', 'TECHNICAL_SPEC'];
    const availableDocs = tender.documents.map((d: any) => d.type);
    
    for (const docType of requiredDocs) {
      if (!availableDocs.includes(docType)) {
        criteria[`doc_${docType}`] = { valid: false, reason: `Missing ${docType} document` };
        score -= 10;
      } else {
        criteria[`doc_${docType}`] = { valid: true };
      }
    }

    // Create or update validation record
    const isValid = score >= 70;
    
    await prisma.tenderValidation.upsert({
      where: { tenderId: tender.id },
      create: {
        tenderId: tender.id,
        criteria,
        score,
        isValid,
        validatedAt: new Date(),
      },
      update: {
        criteria,
        score,
        isValid,
        validatedAt: new Date(),
      },
    });

    appliedRules.push(`validation:score:${score}`);
    job.log(`Applied validation rules. Score: ${score}, Valid: ${isValid}`);

  } catch (error) {
    job.log(`Validation rules error: ${error}`);
  }

  return appliedRules;
}

/**
 * Apply status transition rules
 */
async function applyStatusRules(
  job: Job,
  tender: any,
  context: Record<string, any>
): Promise<string[]> {
  const appliedRules: string[] = [];

  try {
    let newStatus = tender.status;

    // Rule: Auto-transition from SCRAPED to VALIDATED
    if (tender.status === 'SCRAPED') {
      const validation = tender.validations?.[0];
      if (validation?.isValid) {
        newStatus = 'VALIDATED';
        appliedRules.push('status:scraped_to_validated');
      }
    }

    // Rule: Auto-transition to QUALIFIED if meets criteria
    if (tender.status === 'VALIDATED') {
      const hasSubmissions = tender.submissions.length > 0;
      const hasValidDeadline = tender.deadline && new Date(tender.deadline) > new Date();
      
      if (hasSubmissions || hasValidDeadline) {
        newStatus = 'QUALIFIED';
        appliedRules.push('status:validated_to_qualified');
      }
    }

    // Rule: Auto-archive old tenders
    if (tender.deadline && new Date(tender.deadline) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)) {
      // 30 days past deadline
      if (!['ARCHIVED', 'COMPLETED'].includes(tender.status)) {
        newStatus = 'ARCHIVED';
        appliedRules.push('status:auto_archive');
      }
    }

    // Apply status change if needed
    if (newStatus !== tender.status) {
      await prisma.tender.update({
        where: { id: tender.id },
        data: { status: newStatus },
      });

      // Create state transition record
      await prisma.stateTransition.create({
        data: {
          tenderId: tender.id,
          fromStatus: tender.status,
          toStatus: newStatus,
          triggeredBy: 'system', // Should be actual user ID for manual transitions
          reason: 'Automatic rule application',
          metadata: { rules: appliedRules },
        },
      });

      job.log(`Applied status transition: ${tender.status} → ${newStatus}`);
    }

  } catch (error) {
    job.log(`Status rules error: ${error}`);
  }

  return appliedRules;
}

/**
 * Apply compliance rules
 */
async function applyComplianceRules(
  job: Job,
  tender: any,
  context: Record<string, any>
): Promise<string[]> {
  const appliedRules: string[] = [];

  try {
    // Rule: Check deadline compliance
    if (tender.deadline) {
      const daysUntilDeadline = Math.ceil(
        (new Date(tender.deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      
      if (daysUntilDeadline <= 7 && daysUntilDeadline > 0) {
        // Create notification for upcoming deadline
        appliedRules.push('compliance:deadline_warning');
        job.log('Applied deadline warning rule');
      }
    }

    // Rule: Check submission requirements
    const requiredSubmissionMethods = ['PORTAL']; // From context or tender settings
    const availableMethods = tender.submissions.map((s: any) => s.method);
    
    for (const method of requiredSubmissionMethods) {
      if (!availableMethods.includes(method)) {
        appliedRules.push(`compliance:missing_submission_method:${method}`);
        job.log(`Applied compliance rule: Missing submission method ${method}`);
      }
    }

    // Rule: Check document compliance
    const docTypes = tender.documents.map((d: any) => d.type);
    if (!docTypes.includes('LEGAL') && tender.estimatedValue && Number(tender.estimatedValue) > 100000) {
      appliedRules.push('compliance:missing_legal_docs');
      job.log('Applied compliance rule: Missing legal documents for high-value tender');
    }

  } catch (error) {
    job.log(`Compliance rules error: ${error}`);
  }

  return appliedRules;
}