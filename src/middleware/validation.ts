import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Validation schemas
const createPaymentSchema = z.object({
  user_id: z.string().min(1, 'User ID is required'),
  source_amount: z.number().positive('Source amount must be positive'),
  source_currency: z.string().length(3, 'Currency must be 3 characters'),
  destination_currency: z.string().length(3, 'Currency must be 3 characters'),
  webhook_url: z.string().url('Webhook URL must be valid').optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const estimateFeesSchema = z.object({
  source_amount: z.number().positive('Source amount must be positive'),
  source_currency: z.string().length(3, 'Currency must be 3 characters'),
  destination_currency: z.string().length(3, 'Currency must be 3 characters'),
});

const testWebhookSchema = z.object({
  webhook_url: z.string().url('Webhook URL must be valid'),
});

// Validation middleware
export const validateCreatePayment = (req: Request, res: Response, next: NextFunction) => {
  try {
    createPaymentSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      next(error);
    }
  }
};

export const validateEstimateFees = (req: Request, res: Response, next: NextFunction) => {
  try {
    estimateFeesSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      next(error);
    }
  }
};

export const validateTestWebhook = (req: Request, res: Response, next: NextFunction) => {
  try {
    testWebhookSchema.parse(req.body);
    next();
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: error.issues,
        },
        timestamp: new Date().toISOString(),
      });
    } else {
      next(error);
    }
  }
};

// Idempotency key validation
export const validateIdempotencyKey = (req: Request, res: Response, next: NextFunction) => {
  const idempotencyKey = req.headers['idempotency-key'] as string;
  
  if (!idempotencyKey) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'MISSING_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key header is required',
      },
      timestamp: new Date().toISOString(),
    });
  }

  // Simple UUID validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(idempotencyKey)) {
    return res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_IDEMPOTENCY_KEY',
        message: 'Idempotency-Key must be a valid UUID v4',
      },
      timestamp: new Date().toISOString(),
    });
  }

  next();
}; 