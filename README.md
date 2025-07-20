# Cross-Border Payment API

This provides a comprehensive payment processing system with full security, authentication, audit logging, and monitoring capabilities. 
**API-First Design** - No frontend, pure REST API with comprehensive documentation.

## 📚 **API Documentation**

- **Interactive API Docs**: [http://localhost:3000/docs](http://localhost:3000/docs)

- **Health Check**: [http://localhost:3000/health](http://localhost:3000/health)

## 🚀 ** Features**

### 🔐 **Security & Authentication**
- **API Key Management**: Secure API key generation and validation
- **User Authentication**: Bearer token-based user authentication
- **Role-Based Access Control**: Admin, User, and Readonly roles
- **Permission System**: Granular permissions for all operations
- **Security Middleware**: Protection against SQL injection, XSS, and other attacks
- **Rate Limiting**: IP-based rate limiting with configurable limits
- **Audit Logging**: Comprehensive audit trail for compliance



## 🏗️ **Architecture**

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Client Apps   │    │   Admin Panel   │    │   Monitoring    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │   Cross-Border Payment API│
                    │  ┌───────────────────────┐│
                    │  │   Authentication      ││
                    │  │   Security Middleware ││
                    │  │   Rate Limiting       ││
                    │  │   Audit Logging       ││
                    │  └───────────────────────┘│
                    │  ┌───────────────────────┐│
                    │  │   Payment Services    ││
                    │  │   Exchange Rates      ││
                    │  │   Fee Engine          ││
                    │  │   Webhook Service     ││
                    │  └───────────────────────┘│
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      Database Layer       │
                    │  ┌───────────────────────┐│
                    │  │   PostgreSQL (Prod)   ││
                    │  │   SQLite (Dev)        ││
                    │  │   Redis (Cache)       ││
                    │  └───────────────────────┘│
                    └─────────────────────────────┘
```

## 🚀 **Quick Start**

### 1. **Development Setup**
```bash
# Clone the repository
git clone https://github.com/your-org/cross-border-payment-api.git
cd cross-border-payment-api

# Install dependencies
npm install

# Build the project
npm run build

# Start development server
npm run dev
```

### 2. **Production Setup**
```bash
# Build and start production server
npm run build
npm start
```

### 3. **Access the API**
- **API Documentation**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health
- **API Documentation**: http://localhost:3000/docs
- **Health Check**: http://localhost:3000/health

## 🔐 **Authentication**

### API Key Authentication
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "X-API-Key: cbp_your_api_key_here" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "source_amount": 100,
    "source_currency": "USD",
    "destination_currency": "EUR",
    "user_id": "user_123"
  }'
```

### User Authentication
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer user_your_auth_token_here" \
  -H "Idempotency-Key: $(uuidgen)" \
  -d '{
    "source_amount": 100,
    "source_currency": "USD",
    "destination_currency": "EUR",
    "user_id": "user_123"
  }'
```

## 📊 **API Endpoints**

### Core Payment Operations
- `POST /api/v1/payments` - Create a new payment
- `GET /api/v1/payments/{id}` - Get payment status
- `POST /api/v1/payments/estimate-fees` - Estimate fees
- `GET /api/v1/payments/supported-currencies` - Get supported currencies

### Provider Discovery
- `GET /api/v1/payments/onramp/providers` - List onramp providers
- `GET /api/v1/payments/offramp/providers` - List offramp providers
- `GET /api/v1/payments/onramp/compare` - Compare onramp providers
- `GET /api/v1/payments/offramp/compare` - Compare offramp providers

### Admin Operations (Admin Only)
- `GET /api/v1/admin/users` - List all users
- `POST /api/v1/admin/users` - Create new user
- `GET /api/v1/admin/api-keys` - List API keys
- `POST /api/v1/admin/api-keys` - Create new API key
- `GET /api/v1/admin/audit-logs` - View audit logs
- `GET /api/v1/admin/security-events` - View security events
- `GET /api/v1/admin/audit-stats` - View audit statistics

### Webhook Management
- `POST /api/v1/webhooks/test` - Test webhook delivery
- `GET /api/v1/webhooks/{webhookId}` - Get webhook status



## 🔧 **Development**

### Available Scripts
```bash
npm run build          # Build TypeScript to JavaScript
npm start              # Start production server
npm run dev            # Start development server with hot reload
npm run lint           # Run ESLint
npm run lint:fix       # Fix ESLint issues
npm run format         # Format code with Prettier
npm run type-check     # Run TypeScript type checking
npm run security-check # Run security audit
npm run clean          # Clean build artifacts
```

## 🚀 **API Usage Examples**

### Authentication
```bash
# User Login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@crossborderpayments.com",
    "password": "admin123"
  }'

# API Key Authentication
curl -X POST http://localhost:3000/api/v1/auth/validate-api-key \
  -H "Content-Type: application/json" \
  -d '{
    "api_key": "cbp_live_your_api_key_here"
  }'
```

### Create Payment
```bash
curl -X POST http://localhost:3000/api/v1/payments \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Idempotency-Key: 550e8400-e29b-41d4-a716-446655440000" \
  -d '{
    "source_amount": 100,
    "source_currency": "USD",
    "destination_currency": "EUR",
    "user_id": "5b00bcdb-9839-4c99-86f3-e8058f969063"
  }'
```

### Check Payment Status
```bash
curl -X GET http://localhost:3000/api/v1/payments/PAYMENT_ID \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Transaction Ledger
```bash
curl -X GET "http://localhost:3000/api/v1/ledger/transactions?limit=10&status=completed" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Admin Operations
```bash
# List Users
curl -X GET http://localhost:3000/api/v1/admin/users \
  -H "Authorization: Bearer ADMIN_TOKEN"

# Create API Key
curl -X POST http://localhost:3000/api/v1/admin/api-keys \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ADMIN_TOKEN" \
  -d '{
    "name": "Production API Key",
    "permissions": ["payments:read", "payments:write"]
  }'
```

## 📈 **Monitoring & Observability**

### Health Checks
```bash
# API Health
curl http://localhost:3000/health
```

### Metrics & Monitoring
- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3001 (admin/admin123)
- **Audit Logs**: Available via admin API
- **Security Events**: Real-time security monitoring

### Logging
```bash
# View application logs
npm run dev

# View audit logs
curl -H "Authorization: Bearer admin_token" \
  http://localhost:3000/api/v1/admin/audit-logs
```

## 🔒 **Security Features**

### Protection Against
- ✅ SQL Injection Attacks
- ✅ Cross-Site Scripting (XSS)
- ✅ Rate Limiting Abuse
- ✅ Large Payload Attacks
- ✅ Invalid Content Types
- ✅ Suspicious User Agents

### Security Headers
- ✅ Helmet.js Security Headers
- ✅ CORS Configuration
- ✅ Content Security Policy
- ✅ Rate Limit Headers
- ✅ Security Event Logging

### Compliance Features
- ✅ Complete Audit Trail
- ✅ User Action Logging
- ✅ Security Event Monitoring
- ✅ Data Access Logging
- ✅ API Usage Tracking

## 🏗️ **Project Structure**
```
src/
├── config/          # Configuration files
│   └── swagger.ts   # API documentation config
├── database/        # Database setup and models
│   ├── database.ts  # Database connection
│   └── init.ts      # Database initialization
├── middleware/      # Express middleware
│   ├── auth.ts      # Authentication & authorization
│   ├── audit.ts     # Audit logging
│   ├── security.ts  # Security middleware
│   ├── validation.ts # Request validation
│   ├── errorHandler.ts # Error handling
│   └── requestLogger.ts # Request logging
├── routes/          # API route handlers
│   ├── payments.ts  # Payment endpoints
│   ├── webhooks.ts  # Webhook endpoints
│   └── admin.ts     # Admin endpoints
├── services/        # Business logic services
│   ├── paymentOrchestrator.ts # Payment orchestration
│   ├── feeEngine.ts # Fee calculation
│   ├── exchangeRateService.ts # Exchange rates
│   ├── onrampService.ts # Onramp providers
│   ├── offrampService.ts # Offramp providers
│   └── webhookService.ts # Webhook delivery
├── types/           # TypeScript type definitions
│   └── payment.ts   # Payment types
└── server.ts        # Main server file

public/              # Static files
├── swagger-custom.css # Custom Swagger UI styles
└── favicon.ico     # Favicon

eslint.config.js    # Linting configuration
```

## 🎯 **Quick Status Check**

```bash
# Check if server is running
curl http://localhost:3000/health

# Check build
npm run build

# Start development
npm run dev
```

### 📈 **Production Scaling Approach**

#### **Horizontal Scaling Strategy**
- **Load Balancing**: Nginx reverse proxy with multiple API instances
- **Database Scaling**: PostgreSQL with read replicas and connection pooling
- **Caching Layer**: Redis for session storage, rate limiting, and exchange rate caching
- **Message Queues**: RabbitMQ/Kafka for async payment processing and webhook delivery
- **Microservices**: Separate services for payments, webhooks, and admin operations

#### **Performance Optimizations**
- **Database Indexing**: Optimized indexes on payment_id, user_id, and status fields
- **Connection Pooling**: PgBouncer for PostgreSQL connection management
- **CDN Integration**: CloudFlare for static assets and API caching
- **Rate Limiting**: Distributed rate limiting with Redis
- **Circuit Breakers**: Hystrix-style circuit breakers for external provider calls

#### **High Availability**
- **Multi-Region Deployment**: Active-active deployment across regions
- **Database Replication**: Master-slave setup with automatic failover
- **Health Checks**: Comprehensive health checks for all services
- **Auto-scaling**: Kubernetes HPA based on CPU/memory metrics
- **Disaster Recovery**: Automated backups and point-in-time recovery

#### **Monitoring & Observability**
- **Application Metrics**: Prometheus + Grafana for real-time monitoring
- **Distributed Tracing**: Jaeger for request tracing across services
- **Log Aggregation**: ELK stack (Elasticsearch, Logstash, Kibana)
- **Alerting**: PagerDuty integration for critical alerts
- **Business Metrics**: Custom dashboards for payment success rates and revenue

#### **Security at Scale**
- **WAF Integration**: CloudFlare WAF for DDoS protection
- **API Gateway**: Kong for advanced API management and security
- **Secrets Management**: HashiCorp Vault for secure credential storage
- **Network Security**: VPC with private subnets and security groups
- **Compliance**: SOC 2, PCI DSS, and GDPR compliance frameworks

### 📊 **Monitoring & Observability**
- **Structured Logging**: JSON-formatted logs for easy parsing
- **Audit Trails**: Complete audit logs for all user actions
- **Security Events**: Real-time security event monitoring
- **Health Checks**: Built-in health check endpoints
- **Metrics Collection**: Performance and usage metrics
- **Prometheus Integration**: Ready for monitoring stack

### 🧪 **Code Quality**
- **Type Safety**: Full TypeScript implementation
- **Linting & Formatting**: ESLint and Prettier configuration
- **CI/CD Ready**: Automated deployment scripts

### 🚀 **Deployment & Infrastructure**
- **Database Support**: SQLite (dev) and PostgreSQL (prod)
- **Redis Integration**: Caching and rate limiting
- **Nginx Reverse Proxy**: Production-ready load balancing
- **Monitoring Stack**: Prometheus + Grafana