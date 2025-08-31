// Validation plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import fp from 'fastify-plugin';
import { ValidationError } from './error-handler';

const validationPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Add custom schema validation
  fastify.addHook('preHandler', async (request, reply) => {
    // Schema validation is handled automatically by Fastify
    // This hook can be used for additional custom validation if needed
  });

  // Add validation result to request context
  fastify.addHook('preValidation', async (request, reply) => {
    // This runs before Fastify's built-in validation
    // Can be used for custom pre-validation logic
  });

  // Enhanced error handling for validation errors
  fastify.setErrorHandler(async (error, request, reply) => {
    if (error.validation) {
      const validationError = new ValidationError(
        'Validation failed',
        {
          errors: error.validation.map(err => ({
            field: err.instancePath || err.schemaPath,
            message: err.message,
            value: err.data,
          })),
        }
      );
      throw validationError;
    }
    
    // Re-throw other errors to be handled by the main error handler
    throw error;
  });
};

export default fp(validationPlugin, {
  name: 'validation',
  dependencies: ['error-handler'],
});