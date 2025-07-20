import swaggerJsdoc from 'swagger-jsdoc';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Cross-Border Payment API',
      version: '1.0.0',
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Development server'
      }
    ],
    components: {
      parameters: {
        IdempotencyKey: {
          name: 'Idempotency-Key',
          in: 'header',
          required: true,
          description: 'Unique key to prevent duplicate requests. Use UUID v4 format.',
          schema: {
            type: 'string',
            format: 'uuid',
            example: '550e8400-e29b-41d4-a716-446655440000'
          }
        },
        ApiKey: {
          name: 'X-API-Key',
          in: 'header',
          required: false,
          description: 'API key for authentication (alternative to Bearer token)',
          schema: {
            type: 'string',
            example: 'cbp_1234567890abcdef1234567890abcdef'
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'token',
          description: 'Bearer token for user authentication'
        },
        apiKeyAuth: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for authentication'
        }
      },
      schemas: {
        CreatePaymentRequest: {
          type: 'object',
          required: ['source_amount', 'source_currency', 'destination_currency', 'user_id'],
          properties: {
            source_amount: {
              type: 'number',
              minimum: 1,
              description: 'Amount in source currency',
              example: 100
            },
            source_currency: {
              type: 'string',
              description: 'Source currency code',
              example: 'USD'
            },
            destination_currency: {
              type: 'string',
              description: 'Destination currency code',
              example: 'EUR'
            },
            user_id: {
              type: 'string',
              description: 'User identifier',
              example: 'user_123'
            }
          }
        },
        EstimateFeesRequest: {
          type: 'object',
          required: ['source_amount', 'source_currency', 'destination_currency'],
          properties: {
            source_amount: {
              type: 'number',
              minimum: 1,
              description: 'Amount in source currency',
              example: 100
            },
            source_currency: {
              type: 'string',
              description: 'Source currency code',
              example: 'USD'
            },
            destination_currency: {
              type: 'string',
              description: 'Destination currency code',
              example: 'EUR'
            }
          }
        },
        PaymentResponse: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'Payment ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            status: {
              type: 'string',
              enum: ['processing', 'onramp_processing', 'onramp_complete', 'offramp_processing', 'completed', 'failed'],
              description: 'Payment status',
              example: 'processing'
            },
            source_amount: {
              type: 'number',
              description: 'Amount in source currency',
              example: 100
            },
            source_currency: {
              type: 'string',
              description: 'Source currency',
              example: 'USD'
            },
            destination_amount: {
              type: 'number',
              description: 'Amount in destination currency',
              example: 84.53
            },
            destination_currency: {
              type: 'string',
              description: 'Destination currency',
              example: 'EUR'
            },
            exchange_rate: {
              type: 'number',
              description: 'Exchange rate used',
              example: 0.84531
            },
            fee_amount: {
              type: 'number',
              description: 'Total fees charged',
              example: 2.50
            },
            total_amount: {
              type: 'number',
              description: 'Total amount including fees',
              example: 102.50
            },
            estimated_completion: {
              type: 'string',
              format: 'date-time',
              description: 'Estimated completion time',
              example: '2024-01-15T10:30:00Z'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Payment creation time',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        ApiResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              description: 'Request success status',
              example: true
            },
            data: {
              description: 'Response data (varies by endpoint)'
            },
            error: {
              type: 'object',
              properties: {
                code: {
                  type: 'string',
                  description: 'Error code',
                  example: 'VALIDATION_ERROR'
                },
                message: {
                  type: 'string',
                  description: 'Error message',
                  example: 'Invalid request parameters'
                }
              }
            },
            timestamp: {
              type: 'string',
              format: 'date-time',
              description: 'Response timestamp',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        OnrampProvider: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              description: 'Provider identifier',
              example: 'stripe'
            },
            name: {
              type: 'string',
              description: 'Provider display name',
              example: 'Stripe'
            },
            description: {
              type: 'string',
              description: 'Provider description',
              example: 'Credit card and digital wallet payments'
            },
            limits: {
              type: 'object',
              properties: {
                min: {
                  type: 'number',
                  description: 'Minimum amount',
                  example: 1
                },
                max: {
                  type: 'number',
                  description: 'Maximum amount',
                  example: 10000
                },
                currency: {
                  type: 'string',
                  description: 'Currency for limits',
                  example: 'USD'
                }
              }
            },
            processing_time: {
              type: 'string',
              description: 'Estimated processing time',
              example: '5 minutes'
            },
            payment_methods: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Supported payment methods',
              example: ['card', 'digital_wallet']
            },
            success_rate: {
              type: 'number',
              description: 'Success rate (0-1)',
              example: 0.98
            }
          }
        },
        OfframpProvider: {
          type: 'object',
          properties: {
            provider: {
              type: 'string',
              description: 'Provider identifier',
              example: 'local_bank_network'
            },
            name: {
              type: 'string',
              description: 'Provider display name',
              example: 'Local Bank Network'
            },
            description: {
              type: 'string',
              description: 'Provider description',
              example: 'Direct bank transfers within local networks'
            },
            supported_currencies: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Supported currencies',
              example: ['EUR', 'GBP', 'CAD', 'AUD', 'JPY']
            },
            processing_time: {
              type: 'string',
              description: 'Estimated processing time',
              example: '1-2 business days'
            },
            limits: {
              type: 'object',
              properties: {
                min: {
                  type: 'number',
                  description: 'Minimum amount',
                  example: 10
                },
                max: {
                  type: 'number',
                  description: 'Maximum amount',
                  example: 50000
                }
              }
            },
            success_rate: {
              type: 'number',
              description: 'Success rate (0-1)',
              example: 0.99
            }
          }
        },
        User: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'user@example.com'
            },
            role: {
              type: 'string',
              enum: ['admin', 'user', 'readonly'],
              description: 'User role',
              example: 'user'
            },
            is_active: {
              type: 'boolean',
              description: 'Whether user account is active',
              example: true
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Account creation time',
              example: '2024-01-15T10:00:00Z'
            },
            updated_at: {
              type: 'string',
              format: 'date-time',
              description: 'Last update time',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        ApiKey: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'API key ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            name: {
              type: 'string',
              description: 'API key name',
              example: 'Production API Key'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'API key permissions',
              example: ['payments:read', 'payments:write']
            },
            is_active: {
              type: 'boolean',
              description: 'Whether API key is active',
              example: true
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'API key expiration time',
              example: '2024-12-31T23:59:59Z'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Creation time',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        CreateUserRequest: {
          type: 'object',
          required: ['email', 'password', 'role'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address',
              example: 'newuser@example.com'
            },
            password: {
              type: 'string',
              minLength: 8,
              description: 'User password (minimum 8 characters)',
              example: 'securepassword123'
            },
            role: {
              type: 'string',
              enum: ['admin', 'user', 'readonly'],
              description: 'User role',
              example: 'user'
            }
          }
        },
        CreateApiKeyRequest: {
          type: 'object',
          required: ['name', 'permissions'],
          properties: {
            name: {
              type: 'string',
              description: 'API key name',
              example: 'Production API Key'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'API key permissions',
              example: ['payments:read', 'payments:write']
            },
            expires_at: {
              type: 'string',
              format: 'date-time',
              description: 'API key expiration time (optional)',
              example: '2024-12-31T23:59:59Z'
            }
          }
        },
        AuditLog: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Audit log ID',
              example: 1
            },
            user_id: {
              type: 'string',
              format: 'uuid',
              description: 'User ID (if applicable)',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            api_key_id: {
              type: 'string',
              format: 'uuid',
              description: 'API key ID (if applicable)',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            action: {
              type: 'string',
              description: 'Action performed',
              example: 'payment_created'
            },
            resource_type: {
              type: 'string',
              description: 'Resource type',
              example: 'payment'
            },
            resource_id: {
              type: 'string',
              description: 'Resource ID',
              example: '550e8400-e29b-41d4-a716-446655440000'
            },
            ip_address: {
              type: 'string',
              description: 'IP address',
              example: '192.168.1.1'
            },
            user_agent: {
              type: 'string',
              description: 'User agent string',
              example: 'Mozilla/5.0...'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Event timestamp',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        SecurityEvent: {
          type: 'object',
          properties: {
            id: {
              type: 'integer',
              description: 'Security event ID',
              example: 1
            },
            event_type: {
              type: 'string',
              enum: ['failed_login', 'invalid_api_key', 'rate_limit_exceeded', 'suspicious_activity', 'permission_denied', 'sql_injection_attempt', 'xss_attempt'],
              description: 'Security event type',
              example: 'failed_login'
            },
            severity: {
              type: 'string',
              enum: ['low', 'medium', 'high', 'critical'],
              description: 'Event severity',
              example: 'medium'
            },
            description: {
              type: 'string',
              description: 'Event description',
              example: 'Failed login attempt from IP 192.168.1.1'
            },
            ip_address: {
              type: 'string',
              description: 'IP address',
              example: '192.168.1.1'
            },
            created_at: {
              type: 'string',
              format: 'date-time',
              description: 'Event timestamp',
              example: '2024-01-15T10:00:00Z'
            }
          }
        },
        AuditStats: {
          type: 'object',
          properties: {
            total_events: {
              type: 'number',
              description: 'Total audit events',
              example: 1250
            },
            events_by_action: {
              type: 'object',
              description: 'Events grouped by action',
              example: {
                'payment_created': 450,
                'payment_updated': 300,
                'user_login': 500
              }
            },
            events_by_user: {
              type: 'object',
              description: 'Events grouped by user',
              example: {
                'admin@example.com': 200,
                'user@example.com': 150,
                'api_key_production': 900
              }
            },
            recent_activity: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/AuditLog'
              },
              description: 'Recent audit events'
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Payments',
        description: 'Payment creation and management'
      },
      {
        name: 'Onramp',
        description: 'USD collection providers and methods'
      },
      {
        name: 'Offramp',
        description: 'Local currency payout providers and methods'
      },
      {
        name: 'Webhooks',
        description: 'Webhook management and delivery'
      },
      {
        name: 'Admin',
        description: 'Administrative operations (Admin only)'
      },
      {
        name: 'Authentication',
        description: 'User and API key management'
      }
    ]
  },
  apis: ['./src/routes/*.ts']
};

export default options; 