// Zod validation schemas for TenderFlow
import { z } from 'zod';
import { UserRole, TenderStatus, OCRStatus, SubmissionStatus } from '../types';

// User schemas
export const UserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.nativeEnum(UserRole),
  isActive: z.boolean(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(255),
  role: z.nativeEnum(UserRole).default(UserRole.PARTICIPANT),
  password: z.string().min(8).max(100),
});

export const UpdateUserSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
});

export const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// Tender schemas
export const TenderSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(255),
  description: z.string(),
  budget: z.number().positive().optional(),
  deadline: z.date(),
  status: z.nativeEnum(TenderStatus),
  createdBy: z.string().uuid(),
  assignedTo: z.array(z.string().uuid()).optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

export const CreateTenderSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string(),
  budget: z.number().positive().optional(),
  deadline: z.date(),
  assignedTo: z.array(z.string().uuid()).optional(),
});

export const UpdateTenderSchema = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  budget: z.number().positive().optional().nullable(),
  deadline: z.date().optional(),
  status: z.nativeEnum(TenderStatus).optional(),
  assignedTo: z.array(z.string().uuid()).optional(),
});

// Document schemas
export const TenderDocumentSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().positive(),
  url: z.string().url(),
  extractedText: z.string().optional(),
  ocrStatus: z.nativeEnum(OCRStatus),
  uploadedBy: z.string().uuid(),
  uploadedAt: z.date(),
});

// Participant schemas
export const TenderParticipantSchema = z.object({
  id: z.string().uuid(),
  tenderId: z.string().uuid(),
  userId: z.string().uuid(),
  submissionStatus: z.nativeEnum(SubmissionStatus),
  submittedAt: z.date().optional(),
  notes: z.string().optional(),
});

export const InviteParticipantsSchema = z.object({
  userIds: z.array(z.string().uuid()).min(1),
  message: z.string().optional(),
});

// API schemas
export const PaginationSchema = z.object({
  page: z.number().positive().default(1),
  limit: z.number().positive().max(100).default(20),
});

export const ApiResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

// File upload schemas
export const FileUploadSchema = z.object({
  filename: z.string(),
  originalName: z.string(),
  mimeType: z.string(),
  size: z.number().positive(),
  url: z.string().url(),
});

// Query schemas
export const TenderQuerySchema = z.object({
  status: z.nativeEnum(TenderStatus).optional(),
  createdBy: z.string().uuid().optional(),
  assignedTo: z.string().uuid().optional(),
  search: z.string().optional(),
}).merge(PaginationSchema);

export const UserQuerySchema = z.object({
  role: z.nativeEnum(UserRole).optional(),
  isActive: z.boolean().optional(),
  search: z.string().optional(),
}).merge(PaginationSchema);