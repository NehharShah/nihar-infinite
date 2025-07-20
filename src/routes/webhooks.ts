import { Router, Request, Response } from 'express';
import { WebhookService } from '../services/webhookService.js';
import { ApiResponse } from '../types/payment.js';
import { validateTestWebhook } from '../middleware/validation.js';

const router = Router();
const webhookService = new WebhookService();



/**
 * @swagger
 * /api/v1/webhooks/stats:
 *   get:
 *     summary: Get webhook statistics
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Webhook statistics
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
 *                         total:
 *                           type: number
 *                           example: 22
 *                         sent:
 *                           type: number
 *                           example: 22
 *                         failed:
 *                           type: number
 *                           example: 0
 *                         pending:
 *                           type: number
 *                           example: 0
 *                         by_event_type:
 *                           type: object
 *                           example:
 *                             "payment.created": 4
 *                             "payment.processing": 12
 *                             "payment.completed": 2
 *                             "onramp.completed": 4
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await webhookService.getWebhookStats();
    
    const response: ApiResponse<any> = {
      success: true,
      data: stats,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting webhook stats:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'WEBHOOK_STATS_FAILED',
        message: 'Failed to fetch webhook statistics'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/webhooks/{webhookId}:
 *   get:
 *     summary: Get webhook status
 *     tags: [Webhooks]
 *     parameters:
 *       - in: path
 *         name: webhookId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *           example: "a601f1f9-e660-422f-8907-550b57ea247f"
 *     responses:
 *       200:
 *         description: Webhook status
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
 *                         id:
 *                           type: string
 *                           format: uuid
 *                         payment_id:
 *                           type: string
 *                           format: uuid
 *                         event_type:
 *                           type: string
 *                         status:
 *                           type: string
 *                         attempts:
 *                           type: number
 *                         created_at:
 *                           type: string
 *                           format: date-time
 *       404:
 *         description: Webhook not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.get('/:webhookId', async (req: Request, res: Response) => {
  try {
    const { webhookId } = req.params;
    const webhook = await webhookService.getWebhookStatus(webhookId);
    
    if (!webhook) {
      const response: ApiResponse<never> = {
        success: false,
        error: {
          code: 'WEBHOOK_NOT_FOUND',
          message: 'Webhook not found'
        },
        timestamp: new Date().toISOString()
      };
      return res.status(404).json(response);
    }
    
    const response: ApiResponse<any> = {
      success: true,
      data: webhook,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error getting webhook:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'WEBHOOK_FETCH_FAILED',
        message: 'Failed to fetch webhook'
      },
      timestamp: new Date().toISOString()
    };

    res.status(500).json(response);
  }
});

/**
 * @swagger
 * /api/v1/webhooks/test:
 *   post:
 *     summary: Test webhook delivery
 *     tags: [Webhooks]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TestWebhookRequest'
 *     responses:
 *       200:
 *         description: Webhook test initiated
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
 *                         success:
 *                           type: boolean
 *                         response_time:
 *                           type: number
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ApiResponse'
 */
router.post('/test', validateTestWebhook, async (req: Request, res: Response) => {
  try {
    const { webhook_url } = req.body;
    const result = await webhookService.testWebhookEndpoint(webhook_url);
    
    const response: ApiResponse<any> = {
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    };

    res.json(response);
  } catch (error: any) {
    console.error('Error testing webhook:', error);
    
    const response: ApiResponse<never> = {
      success: false,
      error: {
        code: 'WEBHOOK_TEST_FAILED',
        message: 'Failed to test webhook delivery'
      },
      timestamp: new Date().toISOString()
    };

    res.status(400).json(response);
  }
});

export default router; 