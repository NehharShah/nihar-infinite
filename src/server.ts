import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerOptions from './config/swagger.js';
import paymentRoutes from './routes/payments.js';
import webhookRoutes from './routes/webhooks.js';
import adminRoutes from './routes/admin.js';
import authRoutes from './routes/auth.js';
import ledgerRoutes from './routes/ledger.js';

import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import { comprehensiveSecurity } from './middleware/security.js';
import { initializeDatabase } from './database/init.js';
import { Database } from './database/database.js';
import path from 'path';
import { fileURLToPath } from 'url';

const app = express();
const PORT = process.env.PORT || 3000;

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Generate Swagger specs
const specs = swaggerJsdoc(swaggerOptions);

// Initialize database
initializeDatabase();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https:"],
      scriptSrc: ["'self'"],
    },
  },
}));
app.use(cors());

// Rate limiting
const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many payment requests from this IP, please try again later.',
});

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // limit each IP to 50 requests per windowMs
  message: 'Too many webhook requests from this IP, please try again later.',
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files (for Swagger UI assets)
app.use('/public', express.static(path.join(__dirname, '../public')));

// Security middleware
app.use(comprehensiveSecurity);

// Request logging
app.use(requestLogger);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '1.0.0'
  });
});

// Swagger UI configuration
const swaggerUiOptions = {
  customCss: `
    @import url('/public/swagger-custom.css');
  `,
  customSiteTitle: 'Cross-Border Payment API',
  customfavIcon: '/public/favicon.ico',
  swaggerOptions: {
    docExpansion: 'list',
    filter: true,
    showRequestHeaders: true,
    tryItOutEnabled: true,
    requestInterceptor: (req: any) => {
      // Add default headers for better UX
      if (!req.headers['Content-Type']) {
        req.headers['Content-Type'] = 'application/json';
      }
      return req;
    },
    responseInterceptor: (res: any) => {
      // Format responses for better readability
      if (res.body && typeof res.body === 'string') {
        try {
          res.body = JSON.stringify(JSON.parse(res.body), null, 2);
        } catch (e) {
          // Keep original if not JSON
        }
      }
      return res;
    }
  },
  explorer: true
};

// API Documentation
app.use('/docs', swaggerUi.serve, swaggerUi.setup(specs, swaggerUiOptions));

// API Landing Page
app.get('/', (req, res) => {
  res.json({
    name: 'Cross-Border Payment API',
    version: '1.0.0',
    description: 'A comprehensive API for cross-border payments, supporting both fiat-to-stablecoin and stablecoin-to-fiat conversions.',
    documentation: `${req.protocol}://${req.get('host')}/docs`,
    health: `${req.protocol}://${req.get('host')}/health`,
    endpoints: {
      auth: `${req.protocol}://${req.get('host')}/api/v1/auth`,
      payments: `${req.protocol}://${req.get('host')}/api/v1/payments`,
      webhooks: `${req.protocol}://${req.get('host')}/api/v1/webhooks`,
      admin: `${req.protocol}://${req.get('host')}/api/v1/admin`,
      ledger: `${req.protocol}://${req.get('host')}/api/v1/ledger`
    },
    features: [
      'User authentication with JWT tokens',
      'API key management for programmatic access',
      'Cross-border payment processing',
      'Onramp/Offramp provider integration',
      'Real-time webhook notifications',
      'Comprehensive audit logging',
      'Admin dashboard for user management',
      'Transaction ledger and analytics'
    ],
    timestamp: new Date().toISOString()
  });
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/payments', paymentLimiter, paymentRoutes);
app.use('/api/v1/webhooks', webhookLimiter, webhookRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/ledger', ledgerRoutes);


// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.originalUrl} not found`,
    },
    timestamp: new Date().toISOString(),
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 API Documentation available at http://localhost:${PORT}/docs`);
  console.log(`💚 Health check available at http://localhost:${PORT}/health`);
}); 