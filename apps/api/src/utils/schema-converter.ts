// Schema converter utility for TenderFlow API
// Converts Zod schemas to JSON schemas for Fastify validation
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

/**
 * Convert a Zod schema to JSON schema for Fastify
 * Handles the conversion and removes unnecessary properties
 */
export function toJsonSchema(zodSchema: z.ZodType<any, any>) {
  const jsonSchema = zodToJsonSchema(zodSchema);
  
  // Remove $schema property which can cause issues with Fastify
  if (typeof jsonSchema === 'object' && jsonSchema !== null) {
    const schema = { ...jsonSchema } as any;
    delete schema.$schema;
    return schema;
  }
  
  return jsonSchema;
}

/**
 * Batch convert multiple Zod schemas
 */
export function convertSchemas<T extends Record<string, z.ZodType<any, any>>>(
  schemas: T
): Record<keyof T, any> {
  const result: any = {};
  
  for (const [key, schema] of Object.entries(schemas)) {
    result[key] = toJsonSchema(schema);
  }
  
  return result;
}