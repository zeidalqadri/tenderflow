// Error handling plugin for TenderFlow API
import { FastifyInstance, FastifyPluginAsync, FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import { ZodError } from 'zod';

export interface TenderFlowError extends Error {
  statusCode: number;
  code?: string;
  details?: Record<string, unknown>;
}

export class ValidationError extends Error implements TenderFlowError {
  statusCode = 400;
  code = 'VALIDATION_ERROR';
  details: Record<string, unknown>;

  constructor(message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

export class AuthenticationError extends Error implements TenderFlowError {
  statusCode = 401;
  code = 'AUTHENTICATION_ERROR';

  constructor(message: string = 'Authentication required') {
    super(message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends Error implements TenderFlowError {
  statusCode = 403;
  code = 'AUTHORIZATION_ERROR';

  constructor(message: string = 'Insufficient permissions') {
    super(message);
    this.name = 'AuthorizationError';
  }
}

export class NotFoundError extends Error implements TenderFlowError {
  statusCode = 404;
  code = 'NOT_FOUND';

  constructor(message: string = 'Resource not found') {
    super(message);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends Error implements TenderFlowError {
  statusCode = 409;
  code = 'CONFLICT';

  constructor(message: string = 'Resource conflict') {
    super(message);
    this.name = 'ConflictError';
  }
}

export class BusinessLogicError extends Error implements TenderFlowError {
  statusCode = 422;
  code = 'BUSINESS_LOGIC_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'BusinessLogicError';
  }
}

export class RateLimitError extends Error implements TenderFlowError {
  statusCode = 429;
  code = 'RATE_LIMIT_EXCEEDED';

  constructor(message: string = 'Too many requests') {
    super(message);
    this.name = 'RateLimitError';
  }
}

export class InternalError extends Error implements TenderFlowError {
  statusCode = 500;
  code = 'INTERNAL_ERROR';

  constructor(message: string = 'Internal server error') {
    super(message);
    this.name = 'InternalError';
  }
}

const errorHandler: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // Set error handler
  fastify.setErrorHandler(async (error: FastifyError | TenderFlowError, request, reply) => {
    const requestId = request.id;

    // Handle Zod validation errors
    if (error instanceof ZodError) {
      const validationErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));

      fastify.log.warn(
        {
          requestId,
          error: error.message,
          details: validationErrors,
        },
        'Validation error'
      );

      return reply.status(400).send({
        error: 'Validation Error',
        message: 'One or more fields are invalid',
        details: validationErrors,
        statusCode: 400,
        requestId,
      });
    }

    // Handle custom TenderFlow errors
    if ('statusCode' in error && typeof error.statusCode === 'number') {
      const tenderFlowError = error as TenderFlowError;

      const errorResponse = {
        error: tenderFlowError.name || 'Error',
        message: tenderFlowError.message,
        code: tenderFlowError.code,
        statusCode: tenderFlowError.statusCode,
        requestId,
        ...(tenderFlowError.details && { details: tenderFlowError.details }),
      };

      // Log based on severity
      if (tenderFlowError.statusCode >= 500) {
        fastify.log.error(
          {
            requestId,
            error: tenderFlowError.message,
            stack: tenderFlowError.stack,
            code: tenderFlowError.code,
          },
          'Server error'
        );
      } else if (tenderFlowError.statusCode >= 400) {
        fastify.log.warn(
          {
            requestId,
            error: tenderFlowError.message,
            code: tenderFlowError.code,
          },
          'Client error'
        );
      }

      return reply.status(tenderFlowError.statusCode).send(errorResponse);
    }

    // Handle Fastify built-in errors
    if (error.statusCode) {
      fastify.log.warn(
        {
          requestId,
          error: error.message,
          statusCode: error.statusCode,
        },
        'Fastify error'
      );

      return reply.status(error.statusCode).send({
        error: 'Request Error',
        message: error.message,
        statusCode: error.statusCode,
        requestId,
      });
    }

    // Handle unexpected errors
    fastify.log.error(
      {
        requestId,
        error: error.message,
        stack: error.stack,
      },
      'Unexpected error'
    );

    return reply.status(500).send({
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
      statusCode: 500,
      requestId,
    });
  });

  // Add error constructors to fastify instance
  fastify.decorate('errors', {
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    BusinessLogicError,
    RateLimitError,
    InternalError,
  });
};

export const errorHandlerPlugin = fp(errorHandler, {
  name: 'error-handler',
});

export default errorHandlerPlugin;