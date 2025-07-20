import { Router, Request, Response } from 'express';
import { PaymentOrchestrator } from '../services/paymentOrchestrator.js';
import { FeeEngine } from '../services/feeEngine.js';
import { ExchangeRateService } from '../services/exchangeRateService.js';
import { OnrampService } from '../services/onrampService.js';
import { OfframpService } from '../services/offrampService.js';
import {
  validateCreatePayment,
  validateEstimateFees,
  validateIdempotencyKey
} from '../middleware/validation.js';
import {
  CreatePaymentRequest,
  PaymentResponse,
  ApiResponse
} from '../types/payment.js';

const router = Router();
const paymentOrchestrator = new PaymentOrchestrator();
const feeEngine = new FeeEngine();
const exchangeRateService = new ExchangeRateService();
const onrampService = new OnrampService();
const offrampService = new OfframpService();

/**
 * @swagger
 * /api/v1/payments:
 *   post:
 *     summary: Create a new payment
 *     tags: [Payments]
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreatePaymentRequest'
 *     responses:
 *       201:
 *         description: Payment created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PaymentResponse'
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post(
  '/',
  validateIdempotencyKey,
  validateCreatePayment,
  async (req: Request, res: Response) => {
    try {
      const paymentRequest: CreatePaymentRequest = {
        ...req.body,
        idempotency_key: req.headers['idempotency-key'] as string
      };

      const payment = await paymentOrchestrator.createPayment(paymentRequest);
      
      const response: ApiResponse<PaymentResponse> = {
        success: true,
        data: payment,
        timestamp: new Date().toISOString()
      };

      res.status(201).json(response);
    } catch (error: any) {
      console.error('Error creating payment:', error);
      
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: error.code || 'PAYMENT_CREATION_FAILED',
          message: error.message || 'Failed to create payment'
        },
        timestamp: new Date().toISOString()
      };

      res.status(400).json(response);
    }
  }
);

/**
 * @swagger
 * /api/v1/payments/supported-currencies:
 *   get:
 *     summary: Get supported currencies
 *     tags: [Payments]
 *     responses:
 *       200:
 *         description: List of supported currencies
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         currencies:
 *                           type: array
 *                           items:
 *                             type: string
 *                           example: ["AUD", "BRL", "CAD", "CHF", "EUR", "GBP", "INR", "JPY", "MXN", "NOK", "SEK", "USD"]
 *                         fee_configs:
 *                           type: array
 *                           items:
 *                             type: object
 */
router.get('/supported-currencies', async (req: Request, res: Response) => {
  try {
    const feeConfigs = await feeEngine.getSupportedCurrencies();
    const currencies = [...new Set(feeConfigs.map(config => config.currency))];
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        currencies: currencies,
        fee_configs: feeConfigs
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting currencies:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'CURRENCIES_FETCH_FAILED',
        message: 'Failed to fetch supported currencies'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/providers:
 *   get:
 *     summary: Get available onramp providers
 *     tags: [Onramp]
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: "USD"
 *         description: Filter providers by supported currency
 *       - in: query
 *         name: amount
 *         schema:
 *           type: number
 *           example: 1000
 *         description: Filter providers by amount range
 *       - in: query
 *         name: payment_method
 *         schema:
 *           type: string
 *           example: "card"
 *         description: Filter by payment method
 *     responses:
 *       200:
 *         description: List of onramp providers
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         providers:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/OnrampProvider'
 *                         total:
 *                           type: number
 *                         filters:
 *                           type: object
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/onramp/providers', async (req: Request, res: Response) => {
  try {
    const { currency, amount, payment_method } = req.query;
    
    const allProviders = [
      {
        provider: 'stripe',
        name: 'Stripe',
        description: 'Credit card and digital wallet payments',
        limits: { min: 1, max: 10000, currency: 'USD' },
        processing_time: '5 minutes',
        payment_methods: ['card', 'digital_wallet'],
        success_rate: 0.98,
        fees: { percentage: 2.9, fixed: 0.30 },
        features: ['instant_verification', 'fraud_protection', 'global_coverage'],
        status: 'active'
      },
      {
        provider: 'circle',
        name: 'Circle',
        description: 'Stablecoin and bank transfer',
        limits: { min: 100, max: 100000, currency: 'USD' },
        processing_time: '30 minutes',
        payment_methods: ['bank_transfer', 'stablecoin'],
        success_rate: 0.99,
        fees: { percentage: 0.5, fixed: 0 },
        features: ['stablecoin_support', 'bank_integration', 'regulatory_compliance'],
        status: 'active'
      },
      {
        provider: 'wire_transfer',
        name: 'Wire Transfer',
        description: 'Large amount wire transfers',
        limits: { min: 50000, max: 1000000, currency: 'USD' },
        processing_time: '24 hours',
        payment_methods: ['wire'],
        success_rate: 0.95,
        fees: { percentage: 0.1, fixed: 25 },
        features: ['high_limits', 'bank_direct', 'regulatory_compliance'],
        status: 'active'
      },
      {
        provider: 'paypal',
        name: 'PayPal',
        description: 'Digital wallet and bank transfers',
        limits: { min: 1, max: 50000, currency: 'USD' },
        processing_time: '10 minutes',
        payment_methods: ['digital_wallet', 'bank_transfer'],
        success_rate: 0.97,
        fees: { percentage: 2.5, fixed: 0.30 },
        features: ['instant_transfer', 'buyer_protection', 'global_reach'],
        status: 'active'
      },
      {
        provider: 'square',
        name: 'Square',
        description: 'Business payment solutions',
        limits: { min: 10, max: 25000, currency: 'USD' },
        processing_time: '15 minutes',
        payment_methods: ['card', 'digital_wallet'],
        success_rate: 0.96,
        fees: { percentage: 2.6, fixed: 0.10 },
        features: ['business_tools', 'analytics', 'inventory_management'],
        status: 'active'
      }
    ];

    // Apply filters
    let filteredProviders = allProviders;
    
    if (currency) {
      filteredProviders = filteredProviders.filter(p => 
        p.limits.currency === currency.toString().toUpperCase()
      );
    }
    
    if (amount) {
      const amountNum = parseFloat(amount.toString());
      filteredProviders = filteredProviders.filter(p => 
        amountNum >= p.limits.min && amountNum <= p.limits.max
      );
    }
    
    if (payment_method) {
      filteredProviders = filteredProviders.filter(p => 
        p.payment_methods.includes(payment_method.toString())
      );
    }
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        providers: filteredProviders,
        total: filteredProviders.length,
        filters: {
          currency: currency || null,
          amount: amount || null,
          payment_method: payment_method || null
        }
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting onramp providers:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'PROVIDERS_FETCH_FAILED',
        message: 'Failed to fetch onramp providers'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/providers/{providerId}:
 *   get:
 *     summary: Get detailed information about a specific onramp provider
 *     tags: [Onramp]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *           example: "stripe"
 *     responses:
 *       200:
 *         description: Provider details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/OnrampProvider'
 *       404:
 *         description: Provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/onramp/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    
    const providers = {
      stripe: {
        provider: 'stripe',
        name: 'Stripe',
        description: 'Credit card and digital wallet payments',
        limits: { min: 1, max: 10000, currency: 'USD' },
        processing_time: '5 minutes',
        payment_methods: ['card', 'digital_wallet'],
        success_rate: 0.98,
        fees: { percentage: 2.9, fixed: 0.30 },
        features: ['instant_verification', 'fraud_protection', 'global_coverage'],
        status: 'active',
        documentation_url: 'https://stripe.com/docs',
        support_contact: 'support@stripe.com',
        compliance: ['PCI_DSS', 'SOC_2', 'GDPR'],
        integration_guide: 'https://stripe.com/docs/integration-guide'
      },
      circle: {
        provider: 'circle',
        name: 'Circle',
        description: 'Stablecoin and bank transfer',
        limits: { min: 100, max: 100000, currency: 'USD' },
        processing_time: '30 minutes',
        payment_methods: ['bank_transfer', 'stablecoin'],
        success_rate: 0.99,
        fees: { percentage: 0.5, fixed: 0 },
        features: ['stablecoin_support', 'bank_integration', 'regulatory_compliance'],
        status: 'active',
        documentation_url: 'https://developers.circle.com',
        support_contact: 'support@circle.com',
        compliance: ['SOC_2', 'GDPR', 'NYDFS'],
        integration_guide: 'https://developers.circle.com/docs'
      },
      wire_transfer: {
        provider: 'wire_transfer',
        name: 'Wire Transfer',
        description: 'Large amount wire transfers',
        limits: { min: 50000, max: 1000000, currency: 'USD' },
        processing_time: '24 hours',
        payment_methods: ['wire'],
        success_rate: 0.95,
        fees: { percentage: 0.1, fixed: 25 },
        features: ['high_limits', 'bank_direct', 'regulatory_compliance'],
        status: 'active',
        documentation_url: 'https://wire-transfer-docs.com',
        support_contact: 'support@wiretransfer.com',
        compliance: ['AML', 'KYC', 'OFAC'],
        integration_guide: 'https://wire-transfer-docs.com/integration'
      }
    };
    
    const provider = providers[providerId as keyof typeof providers];
    
    if (!provider) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'Onramp provider not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse<any> = {
      success: true,
      data: provider,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting onramp provider details:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'PROVIDER_FETCH_FAILED',
        message: 'Failed to fetch onramp provider details'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/offramp/providers:
 *   get:
 *     summary: Get available offramp providers
 *     tags: [Offramp]
 *     parameters:
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *           example: "EUR"
 *         description: Filter providers by supported currency
 *       - in: query
 *         name: amount
 *         schema:
 *           type: number
 *           example: 1000
 *         description: Filter providers by amount range
 *       - in: query
 *         name: processing_time
 *         schema:
 *           type: string
 *           example: "instant"
 *         description: Filter by processing time preference
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *           example: "DE"
 *         description: Filter by target country
 *     responses:
 *       200:
 *         description: List of offramp providers
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         providers:
 *                           type: array
 *                           items:
 *                             $ref: '#/components/schemas/OfframpProvider'
 *                         total:
 *                           type: number
 *                         filters:
 *                           type: object
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/offramp/providers', async (req: Request, res: Response) => {
  try {
    const { currency, amount, processing_time, country } = req.query;
    
    const allProviders = [
      {
        provider: 'local_bank_network',
        name: 'Local Bank Network',
        description: 'Direct bank transfers within local networks',
        supported_currencies: ['EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
        processing_time: '1-2 business days',
        limits: { min: 10, max: 50000 },
        success_rate: 0.99,
        fees: { percentage: 0.5, fixed: 2 },
        features: ['local_network', 'low_fees', 'fast_settlement'],
        status: 'active',
        supported_countries: ['DE', 'FR', 'GB', 'CA', 'AU', 'JP']
      },
      {
        provider: 'swift_wire',
        name: 'SWIFT Wire Transfer',
        description: 'International wire transfers',
        supported_currencies: ['EUR', 'GBP', 'USD', 'CHF'],
        processing_time: '2-3 business days',
        limits: { min: 1000, max: 1000000 },
        success_rate: 0.98,
        fees: { percentage: 0.1, fixed: 25 },
        features: ['global_reach', 'high_limits', 'secure_transfer'],
        status: 'active',
        supported_countries: ['DE', 'FR', 'GB', 'US', 'CH', 'CA', 'AU']
      },
      {
        provider: 'digital_wallet',
        name: 'Digital Wallet',
        description: 'Mobile and digital wallet payouts',
        supported_currencies: ['INR', 'MXN', 'BRL'],
        processing_time: 'Instant to 24 hours',
        limits: { min: 1, max: 10000 },
        success_rate: 0.97,
        fees: { percentage: 1.5, fixed: 0.50 },
        features: ['instant_payout', 'mobile_friendly', 'low_limits'],
        status: 'active',
        supported_countries: ['IN', 'MX', 'BR', 'NG', 'KE']
      },
      {
        provider: 'neobank_partner',
        name: 'Neobank Partner',
        description: 'Modern banking solutions',
        supported_currencies: ['EUR', 'GBP', 'BRL'],
        processing_time: 'Same day',
        limits: { min: 10, max: 100000 },
        success_rate: 0.99,
        fees: { percentage: 0.3, fixed: 1 },
        features: ['modern_ui', 'instant_settlement', 'api_integration'],
        status: 'active',
        supported_countries: ['DE', 'GB', 'BR', 'NL', 'ES']
      },
      {
        provider: 'instant_payout',
        name: 'Instant Payout',
        description: 'Real-time payment processing',
        supported_currencies: ['EUR', 'GBP', 'USD'],
        processing_time: 'Instant',
        limits: { min: 1, max: 25000 },
        success_rate: 0.96,
        fees: { percentage: 1.0, fixed: 0.25 },
        features: ['instant_settlement', '24_7_availability', 'real_time_tracking'],
        status: 'active',
        supported_countries: ['DE', 'GB', 'US', 'NL', 'BE']
      },
      {
        provider: 'crypto_payout',
        name: 'Crypto Payout',
        description: 'Cryptocurrency payouts',
        supported_currencies: ['BTC', 'ETH', 'USDC', 'USDT'],
        processing_time: '5-30 minutes',
        limits: { min: 10, max: 100000 },
        success_rate: 0.94,
        fees: { percentage: 0.5, fixed: 0 },
        features: ['crypto_support', 'global_access', 'low_fees'],
        status: 'active',
        supported_countries: ['GLOBAL']
      }
    ];

    // Apply filters
    let filteredProviders = allProviders;
    
    if (currency) {
      filteredProviders = filteredProviders.filter(p => 
        p.supported_currencies.includes(currency.toString().toUpperCase())
      );
    }
    
    if (amount) {
      const amountNum = parseFloat(amount.toString());
      filteredProviders = filteredProviders.filter(p => 
        amountNum >= p.limits.min && amountNum <= p.limits.max
      );
    }
    
    if (processing_time) {
      const timePref = processing_time.toString().toLowerCase();
      filteredProviders = filteredProviders.filter(p => {
        const providerTime = p.processing_time.toLowerCase();
        if (timePref === 'instant') return providerTime.includes('instant');
        if (timePref === 'same_day') return providerTime.includes('same day');
        if (timePref === 'fast') return providerTime.includes('1-2') || providerTime.includes('same day');
        return true;
      });
    }
    
    if (country) {
      filteredProviders = filteredProviders.filter(p => 
        p.supported_countries.includes(country.toString().toUpperCase()) || 
        p.supported_countries.includes('GLOBAL')
      );
    }
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        providers: filteredProviders,
        total: filteredProviders.length,
        filters: {
          currency: currency || null,
          amount: amount || null,
          processing_time: processing_time || null,
          country: country || null
        }
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting offramp providers:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'PROVIDERS_FETCH_FAILED',
        message: 'Failed to fetch offramp providers'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/offramp/providers/{providerId}:
 *   get:
 *     summary: Get detailed information about a specific offramp provider
 *     tags: [Offramp]
 *     parameters:
 *       - in: path
 *         name: providerId
 *         required: true
 *         schema:
 *           type: string
 *           example: "local_bank_network"
 *     responses:
 *       200:
 *         description: Provider details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/OfframpProvider'
 *       404:
 *         description: Provider not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/offramp/providers/:providerId', async (req: Request, res: Response) => {
  try {
    const { providerId } = req.params;
    
    const providers = {
      local_bank_network: {
        provider: 'local_bank_network',
        name: 'Local Bank Network',
        description: 'Direct bank transfers within local networks',
        supported_currencies: ['EUR', 'GBP', 'CAD', 'AUD', 'JPY'],
        processing_time: '1-2 business days',
        limits: { min: 10, max: 50000 },
        success_rate: 0.99,
        fees: { percentage: 0.5, fixed: 2 },
        features: ['local_network', 'low_fees', 'fast_settlement'],
        status: 'active',
        supported_countries: ['DE', 'FR', 'GB', 'CA', 'AU', 'JP'],
        documentation_url: 'https://local-bank-network.com/docs',
        support_contact: 'support@localbanknetwork.com',
        compliance: ['AML', 'KYC', 'GDPR'],
        integration_guide: 'https://local-bank-network.com/integration',
        bank_codes: ['BIC', 'IBAN', 'Routing Number']
      },
      swift_wire: {
        provider: 'swift_wire',
        name: 'SWIFT Wire Transfer',
        description: 'International wire transfers',
        supported_currencies: ['EUR', 'GBP', 'USD', 'CHF'],
        processing_time: '2-3 business days',
        limits: { min: 1000, max: 1000000 },
        success_rate: 0.98,
        fees: { percentage: 0.1, fixed: 25 },
        features: ['global_reach', 'high_limits', 'secure_transfer'],
        status: 'active',
        supported_countries: ['DE', 'FR', 'GB', 'US', 'CH', 'CA', 'AU'],
        documentation_url: 'https://swift-wire.com/docs',
        support_contact: 'support@swiftwire.com',
        compliance: ['AML', 'KYC', 'OFAC', 'SWIFT_Compliance'],
        integration_guide: 'https://swift-wire.com/integration',
        bank_codes: ['SWIFT_BIC', 'IBAN', 'Account Number']
      },
      digital_wallet: {
        provider: 'digital_wallet',
        name: 'Digital Wallet',
        description: 'Mobile and digital wallet payouts',
        supported_currencies: ['INR', 'MXN', 'BRL'],
        processing_time: 'Instant to 24 hours',
        limits: { min: 1, max: 10000 },
        success_rate: 0.97,
        fees: { percentage: 1.5, fixed: 0.50 },
        features: ['instant_payout', 'mobile_friendly', 'low_limits'],
        status: 'active',
        supported_countries: ['IN', 'MX', 'BR', 'NG', 'KE'],
        documentation_url: 'https://digital-wallet.com/docs',
        support_contact: 'support@digitalwallet.com',
        compliance: ['PCI_DSS', 'GDPR', 'Local_Regulations'],
        integration_guide: 'https://digital-wallet.com/integration',
        wallet_types: ['Mobile Wallet', 'Digital Wallet', 'E-Wallet']
      }
    };
    
    const provider = providers[providerId as keyof typeof providers];
    
    if (!provider) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'Offramp provider not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse<any> = {
      success: true,
      data: provider,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting offramp provider details:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'PROVIDER_FETCH_FAILED',
        message: 'Failed to fetch offramp provider details'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/{paymentId}:
 *   get:
 *     summary: Get payment status
 *     tags: [Payments]
 *     parameters:
 *       - in: path
 *         name: paymentId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "02a02eda-9f72-4074-ac5f-37c19108b86e"
 *     responses:
 *       200:
 *         description: Payment details
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       $ref: '#/components/schemas/PaymentResponse'
 *       404:
 *         description: Payment not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/:paymentId', async (req: Request, res: Response) => {
  try {
    const { paymentId } = req.params;
    const payment = await paymentOrchestrator.getPaymentById(paymentId);
    
    if (!payment) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'PAYMENT_NOT_FOUND',
          message: 'Payment not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse<PaymentResponse> = {
      success: true,
      data: paymentOrchestrator['paymentToResponse'](payment),
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting payment:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'PAYMENT_NOT_FOUND',
        message: error.message || 'Payment not found'
      },
      timestamp: new Date().toISOString()
    };

    res.status(404).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/estimate-fees:
 *   post:
 *     summary: Estimate fees for a payment
 *     tags: [Payments]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/EstimateFeesRequest'
 *     responses:
 *       200:
 *         description: Fee estimate
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         source_amount:
 *                           type: number
 *                           example: 100
 *                         source_currency:
 *                           type: string
 *                           example: "USD"
 *                         destination_amount:
 *                           type: number
 *                           example: 84.53
 *                         destination_currency:
 *                           type: string
 *                           example: "EUR"
 *                         exchange_rate:
 *                           type: number
 *                           example: 0.84531
 *                         fee_breakdown:
 *                           type: object
 *                         total_cost:
 *                           type: number
 *                           example: 102.50
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/estimate-fees', validateEstimateFees, async (req: Request, res: Response) => {
  try {
    const { source_amount, source_currency, destination_currency } = req.body;
    const exchangeRate = await exchangeRateService.getExchangeRate(source_currency, destination_currency);
    const estimate = await feeEngine.getFeeEstimate(source_amount, source_currency, destination_currency, exchangeRate);
    
    const response: ApiResponse<any> = {
      success: true,
      data: estimate,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error estimating fees:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'FEE_ESTIMATION_FAILED',
        message: error.message || 'Failed to estimate fees'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/status:
 *   get:
 *     summary: Get onramp processing status and statistics
 *     tags: [Onramp]
 *     responses:
 *       200:
 *         description: Onramp status and statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         total_transactions:
 *                           type: number
 *                         success_rate:
 *                           type: number
 *                         average_processing_time:
 *                           type: string
 *                         active_providers:
 *                           type: number
 *                         recent_activity:
 *                           type: array
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/onramp/status', async (req: Request, res: Response) => {
  try {
    const status = {
      total_transactions: 15420,
      success_rate: 0.985,
      average_processing_time: '8.5 minutes',
      active_providers: 5,
      recent_activity: [
        { provider: 'stripe', transactions: 1250, success_rate: 0.99 },
        { provider: 'circle', transactions: 890, success_rate: 0.98 },
        { provider: 'paypal', transactions: 670, success_rate: 0.97 }
      ],
      system_status: 'operational',
      last_updated: new Date().toISOString()
    };
    
    const response: ApiResponse<any> = {
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting onramp status:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: 'Failed to fetch onramp status'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/offramp/status:
 *   get:
 *     summary: Get offramp processing status and statistics
 *     tags: [Offramp]
 *     responses:
 *       200:
 *         description: Offramp status and statistics
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         total_transactions:
 *                           type: number
 *                         success_rate:
 *                           type: number
 *                         average_processing_time:
 *                           type: string
 *                         active_providers:
 *                           type: number
 *                         recent_activity:
 *                           type: array
 *       500:
 *         description: Server error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/offramp/status', async (req: Request, res: Response) => {
  try {
    const status = {
      total_transactions: 12850,
      success_rate: 0.978,
      average_processing_time: '1.2 business days',
      active_providers: 6,
      recent_activity: [
        { provider: 'local_bank_network', transactions: 890, success_rate: 0.99 },
        { provider: 'swift_wire', transactions: 450, success_rate: 0.98 },
        { provider: 'digital_wallet', transactions: 320, success_rate: 0.97 }
      ],
      system_status: 'operational',
      last_updated: new Date().toISOString()
    };
    
    const response: ApiResponse<any> = {
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting offramp status:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'STATUS_FETCH_FAILED',
        message: 'Failed to fetch offramp status'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/compare:
 *   post:
 *     summary: Compare onramp providers for a specific payment
 *     tags: [Onramp]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, currency]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 1000
 *               currency:
 *                 type: string
 *                 example: "USD"
 *               payment_method:
 *                 type: string
 *                 example: "card"
 *     responses:
 *       200:
 *         description: Provider comparison
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         comparison:
 *                           type: array
 *                         recommendation:
 *                           type: object
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/onramp/compare', async (req: Request, res: Response) => {
  try {
    const { amount, currency, payment_method } = req.body;
    
    if (!amount || !currency) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Amount and currency are required'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(response);
    }
    
    const providers = [
      {
        provider: 'stripe',
        name: 'Stripe',
        total_cost: amount + (amount * 0.029) + 0.30,
        processing_time: '5 minutes',
        success_rate: 0.98,
        features: ['instant_verification', 'fraud_protection'],
        recommendation_score: 0.95
      },
      {
        provider: 'circle',
        name: 'Circle',
        total_cost: amount + (amount * 0.005),
        processing_time: '30 minutes',
        success_rate: 0.99,
        features: ['stablecoin_support', 'bank_integration'],
        recommendation_score: 0.92
      },
      {
        provider: 'paypal',
        name: 'PayPal',
        total_cost: amount + (amount * 0.025) + 0.30,
        processing_time: '10 minutes',
        success_rate: 0.97,
        features: ['instant_transfer', 'buyer_protection'],
        recommendation_score: 0.88
      }
    ];
    
    // Filter by payment method if specified
    let filteredProviders = providers;
    if (payment_method) {
      // This would be more sophisticated in a real implementation
      filteredProviders = providers.filter(p => p.provider !== 'circle'); // Example filter
    }
    
    // Sort by recommendation score
    filteredProviders.sort((a, b) => b.recommendation_score - a.recommendation_score);
    
    const comparison = {
      comparison: filteredProviders,
      recommendation: filteredProviders[0],
      criteria: {
        amount,
        currency,
        payment_method: payment_method || 'any'
      }
    };
    
    const response: ApiResponse<any> = {
      success: true,
      data: comparison,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error comparing onramp providers:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'COMPARISON_FAILED',
        message: 'Failed to compare onramp providers'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/transactions:
 *   post:
 *     summary: Create a new onramp transaction (fiat to stablecoin)
 *     tags: [Onramp]
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, source_currency, destination_currency, provider, user_id]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 100
 *               source_currency:
 *                 type: string
 *                 example: "USD"
 *               destination_currency:
 *                 type: string
 *                 example: "USDC"
 *               provider:
 *                 type: string
 *                 example: "stripe"
 *               user_id:
 *                 type: string
 *                 example: "user_123"
 *     responses:
 *       201:
 *         description: Onramp transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transaction_id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         provider_name:
 *                           type: string
 *                         estimated_completion:
 *                           type: string
 *                         external_reference:
 *                           type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/onramp/transactions', validateIdempotencyKey, async (req: Request, res: Response) => {
  try {
    const { amount, source_currency, destination_currency, provider, user_id } = req.body;
    
    if (!amount || !source_currency || !destination_currency || !provider || !user_id) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Amount, source_currency, destination_currency, provider, and user_id are required'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(response);
    }
    
    // Create onramp transaction using the service
    const transaction = await onrampService.createTransaction({
      amount,
      source_currency,
      destination_currency,
      provider,
      user_id,
      idempotency_key: req.headers['idempotency-key'] as string
    });
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        transaction_id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.destination_currency,
        provider: transaction.provider,
        provider_name: transaction.provider_name,
        estimated_completion: transaction.estimated_completion,
        external_reference: transaction.external_reference
      },
      timestamp: new Date().toISOString()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating onramp transaction:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'ONRAMP_TRANSACTION_FAILED',
        message: error.message || 'Failed to create onramp transaction'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/onramp/transactions/{transactionId}:
 *   get:
 *     summary: Get onramp transaction status
 *     tags: [Onramp]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transaction_id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         provider_name:
 *                           type: string
 *                         estimated_completion:
 *                           type: string
 *                         external_reference:
 *                           type: string
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/onramp/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await onrampService.getTransactionStatus(transactionId);
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        transaction_id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.destination_currency,
        provider: transaction.provider,
        provider_name: transaction.provider_name,
        estimated_completion: transaction.estimated_completion,
        external_reference: transaction.external_reference
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting onramp transaction status:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'TRANSACTION_NOT_FOUND',
        message: error.message || 'Transaction not found'
      },
      timestamp: new Date().toISOString()
    };

    res.status(404).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/offramp/transactions:
 *   post:
 *     summary: Create a new offramp transaction (stablecoin to fiat)
 *     tags: [Offramp]
 *     parameters:
 *       - $ref: '#/components/parameters/IdempotencyKey'
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [amount, source_currency, destination_currency, provider, user_id]
 *             properties:
 *               amount:
 *                 type: number
 *                 example: 100
 *               source_currency:
 *                 type: string
 *                 example: "USDC"
 *               destination_currency:
 *                 type: string
 *                 example: "USD"
 *               provider:
 *                 type: string
 *                 example: "local_bank_network"
 *               user_id:
 *                 type: string
 *                 example: "user_123"
 *     responses:
 *       201:
 *         description: Offramp transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transaction_id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         provider_name:
 *                           type: string
 *                         estimated_completion:
 *                           type: string
 *                         external_reference:
 *                           type: string
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/offramp/transactions', validateIdempotencyKey, async (req: Request, res: Response) => {
  try {
    const { amount, source_currency, destination_currency, provider, user_id } = req.body;
    
    if (!amount || !source_currency || !destination_currency || !provider || !user_id) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'MISSING_PARAMETERS',
          message: 'Amount, source_currency, destination_currency, provider, and user_id are required'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(400).json(response);
    }
    
    // Create offramp transaction using the service
    const transaction = await offrampService.createTransaction({
      amount,
      source_currency,
      destination_currency,
      provider,
      user_id,
      idempotency_key: req.headers['idempotency-key'] as string
    });
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        transaction_id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.destination_currency,
        provider: transaction.provider,
        provider_name: transaction.provider_name,
        estimated_completion: transaction.estimated_completion,
        external_reference: transaction.external_reference
      },
      timestamp: new Date().toISOString()
    };

    res.status(201).json(response);
  } catch (error: any) {
    console.error('Error creating offramp transaction:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'OFFRAMP_TRANSACTION_FAILED',
        message: error.message || 'Failed to create offramp transaction'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

/**
 * @swagger
 * /api/v1/payments/offramp/transactions/{transactionId}:
 *   get:
 *     summary: Get offramp transaction status
 *     tags: [Offramp]
 *     parameters:
 *       - in: path
 *         name: transactionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/ApiResponse'
 *                 - type: object
 *                   properties:
 *                     data:
 *                       type: object
 *                       properties:
 *                         transaction_id:
 *                           type: string
 *                         status:
 *                           type: string
 *                         amount:
 *                           type: number
 *                         currency:
 *                           type: string
 *                         provider:
 *                           type: string
 *                         provider_name:
 *                           type: string
 *                         estimated_completion:
 *                           type: string
 *                         external_reference:
 *                           type: string
 *       404:
 *         description: Transaction not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/offramp/transactions/:transactionId', async (req: Request, res: Response) => {
  try {
    const { transactionId } = req.params;
    
    const transaction = await offrampService.getTransactionStatus(transactionId);
    
    const response: ApiResponse<any> = {
      success: true,
      data: {
        transaction_id: transaction.id,
        status: transaction.status,
        amount: transaction.amount,
        currency: transaction.destination_currency,
        provider: transaction.provider,
        provider_name: transaction.provider_name,
        estimated_completion: transaction.estimated_completion,
        external_reference: transaction.external_reference
      },
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting offramp transaction status:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: error.code || 'TRANSACTION_NOT_FOUND',
        message: error.message || 'Transaction not found'
      },
      timestamp: new Date().toISOString()
    };

    res.status(404).json(response);
  }
});

export default router; 