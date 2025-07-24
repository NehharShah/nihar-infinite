export const temporalConfig = {
  // Temporal server connection
  server: {
    address: process.env.TEMPORAL_ADDRESS || 'localhost:7233',
    namespace: process.env.TEMPORAL_NAMESPACE || 'default',
  },

  // Task queue configuration
  taskQueue: {
    paymentProcessing: 'payment-processing',
    webhookDelivery: 'webhook-delivery',
    feeCalculation: 'fee-calculation',
  },

  // Workflow configuration
  workflow: {
    // Timeouts
    startToCloseTimeout: '1 hour',
    scheduleToCloseTimeout: '2 hours',
    scheduleToStartTimeout: '5 minutes',
    heartbeatTimeout: '30 seconds',

    // Retry policy
    retry: {
      initialInterval: '1 second',
      maximumInterval: '1 minute',
      maximumAttempts: 3,
      backoffCoefficient: 2,
    },

    // Activity timeouts
    activity: {
      startToCloseTimeout: '1 minute',
      scheduleToCloseTimeout: '5 minutes',
      scheduleToStartTimeout: '30 seconds',
      heartbeatTimeout: '10 seconds',
    },
  },

  // Monitoring and observability
  monitoring: {
    // Metrics
    metrics: {
      enabled: process.env.TEMPORAL_METRICS_ENABLED === 'true',
      port: parseInt(process.env.TEMPORAL_METRICS_PORT || '9090'),
    },

    // Tracing
    tracing: {
      enabled: process.env.TEMPORAL_TRACING_ENABLED === 'true',
      url: process.env.TEMPORAL_TRACING_URL || 'http://localhost:14268/api/traces',
    },

    // Logging
    logging: {
      level: process.env.TEMPORAL_LOG_LEVEL || 'info',
      format: process.env.TEMPORAL_LOG_FORMAT || 'json',
    },
  },

  // Development settings
  development: {
    // Enable local development features
    localDevelopment: process.env.NODE_ENV === 'development',
    
    // Auto-start Temporal server in development
    autoStartServer: process.env.TEMPORAL_AUTO_START === 'true',
    
    // Development server settings
    server: {
      port: parseInt(process.env.TEMPORAL_SERVER_PORT || '7233'),
      uiPort: parseInt(process.env.TEMPORAL_UI_PORT || '8233'),
    },
  },
};

export default temporalConfig; 