import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';
import crypto from 'crypto';
import { Database } from '../database/database.js';
import { Webhook, WebhookEventType, WebhookStatus } from '../types/payment.js';

export class WebhookService {
  private db: Database;
  private maxRetries: number = 3;
  private retryDelays: number[] = [5000, 15000, 60000]; // 5s, 15s, 1min

  constructor() {
    this.db = Database.getInstance();
  }

  /**
   * Schedule a webhook to be sent
   */
  async scheduleWebhook(
    paymentId: string,
    eventType: WebhookEventType,
    payload: Record<string, any>
  ): Promise<string> {
    const webhookId = uuidv4();
    
    const webhookPayload = {
      id: webhookId,
      payment_id: paymentId,
      event_type: eventType,
      timestamp: new Date().toISOString(),
      data: payload
    };

    await this.db.run(
      `INSERT INTO webhooks 
       (id, payment_id, event_type, status, payload, retry_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        webhookId,
        paymentId,
        eventType,
        WebhookStatus.PENDING,
        JSON.stringify(webhookPayload),
        0
      ]
    );

    // Get webhook URL from payload if provided, otherwise use default test URL
    const webhookUrl = payload.webhook_url || process.env.DEFAULT_WEBHOOK_URL || 'https://webhook.site/test';
    
    // Send webhook asynchronously
    this.sendWebhookAsync(webhookId, webhookUrl, webhookPayload);

    return webhookId;
  }

  /**
   * Send webhook asynchronously with retry logic
   */
  private async sendWebhookAsync(
    webhookId: string,
    url: string,
    payload: Record<string, any>
  ): Promise<void> {
    try {
      const response = await this.sendWebhookRequest(url, payload);
      
      await this.db.run(
        `UPDATE webhooks 
         SET status = ?, response = ?, sent_at = CURRENT_TIMESTAMP 
         WHERE id = ?`,
        [WebhookStatus.SENT, JSON.stringify(response), webhookId]
      );

      console.log(`Webhook ${webhookId} sent successfully to ${url}`);

    } catch (error) {
      console.error(`Webhook ${webhookId} failed:`, error);
      await this.handleWebhookFailure(webhookId, url, payload, error);
    }
  }

  /**
   * Send webhook HTTP request
   */
  private async sendWebhookRequest(url: string, payload: Record<string, any>): Promise<any> {
    const response = await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CrossBorderPaymentAPI/1.0',
        'X-Webhook-Signature': this.generateSignature(payload),
        'X-Webhook-Event': payload.event_type
      },
      timeout: 10000, // 10 second timeout
      validateStatus: (status) => status >= 200 && status < 300
    });

    return {
      status: response.status,
      headers: response.headers,
      data: response.data
    };
  }

  /**
   * Handle webhook failure with retry logic
   */
  private async handleWebhookFailure(
    webhookId: string,
    url: string,
    payload: Record<string, any>,
    error: any
  ): Promise<void> {
    // Get current webhook record
    const webhook = await this.db.get<Webhook>(
      'SELECT * FROM webhooks WHERE id = ?',
      [webhookId]
    );

    if (!webhook) {
      console.error(`Webhook ${webhookId} not found for retry`);
      return;
    }

    const retryCount = webhook.retry_count + 1;

    // Update webhook with failure details
    await this.db.run(
      `UPDATE webhooks 
       SET status = ?, response = ?, retry_count = ? 
       WHERE id = ?`,
      [
        retryCount <= this.maxRetries ? WebhookStatus.PENDING : WebhookStatus.FAILED,
        JSON.stringify({
          error: error.message,
          status: error.response?.status,
          data: error.response?.data
        }),
        retryCount,
        webhookId
      ]
    );

    // Schedule retry if within retry limit
    if (retryCount <= this.maxRetries) {
      const retryDelay = this.retryDelays[retryCount - 1] || 60000;
      
      setTimeout(() => {
        console.log(`Retrying webhook ${webhookId} (attempt ${retryCount}/${this.maxRetries})`);
        this.sendWebhookAsync(webhookId, url, payload);
      }, retryDelay);
    } else {
      console.error(`Webhook ${webhookId} failed permanently after ${this.maxRetries} retries`);
    }
  }

  /**
   * Generate webhook signature for security
   */
  private generateSignature(payload: Record<string, any>): string {
    // In a real implementation, this would use HMAC with a secret key
    // For demo purposes, we'll use a simple hash
    const secret = process.env.WEBHOOK_SECRET || 'demo-secret-key';
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Get webhook status
   */
  async getWebhookStatus(webhookId: string): Promise<Webhook | undefined> {
    const webhook = await this.db.get<Webhook>(
      'SELECT * FROM webhooks WHERE id = ?',
      [webhookId]
    );

    if (webhook) {
      try {
        webhook.payload = JSON.parse(webhook.payload as unknown as string);
        if (webhook.response) {
          webhook.response = JSON.parse(webhook.response as unknown as string);
        }
      } catch (error) {
        // Keep original if parsing fails
      }
    }

    return webhook;
  }

  /**
   * Get webhooks for a payment
   */
  async getPaymentWebhooks(paymentId: string): Promise<Webhook[]> {
    const webhooks = await this.db.all<Webhook>(
      'SELECT * FROM webhooks WHERE payment_id = ? ORDER BY created_at DESC',
      [paymentId]
    );

    return webhooks.map(webhook => {
      try {
        webhook.payload = JSON.parse(webhook.payload as unknown as string);
        if (webhook.response) {
          webhook.response = JSON.parse(webhook.response as unknown as string);
        }
      } catch (error) {
        // Keep original if parsing fails
      }
      return webhook;
    });
  }

  /**
   * Retry failed webhook
   */
  async retryWebhook(webhookId: string, newUrl?: string): Promise<boolean> {
    const webhook = await this.getWebhookStatus(webhookId);
    
    if (!webhook || webhook.status === WebhookStatus.SENT) {
      return false;
    }

    // Reset retry count and status
    await this.db.run(
      'UPDATE webhooks SET status = ?, retry_count = 0 WHERE id = ?',
      [WebhookStatus.PENDING, webhookId]
    );

    // Use new URL or extract from original payload
    const url = newUrl || (webhook.payload as any)?.webhook_url || 'https://webhook.site/test';
    
    // Send webhook
    this.sendWebhookAsync(webhookId, url, webhook.payload as Record<string, any>);
    
    return true;
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(): Promise<{
    total: number;
    sent: number;
    failed: number;
    pending: number;
    by_event_type: Record<string, number>;
  }> {
    const totalResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM webhooks'
    );

    const sentResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM webhooks WHERE status = ?',
      [WebhookStatus.SENT]
    );

    const failedResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM webhooks WHERE status = ?',
      [WebhookStatus.FAILED]
    );

    const pendingResult = await this.db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM webhooks WHERE status = ?',
      [WebhookStatus.PENDING]
    );

    const eventTypeResults = await this.db.all<{ event_type: string; count: number }>(
      'SELECT event_type, COUNT(*) as count FROM webhooks GROUP BY event_type'
    );

    const byEventType: Record<string, number> = {};
    eventTypeResults.forEach(result => {
      byEventType[result.event_type] = result.count;
    });

    return {
      total: totalResult?.count || 0,
      sent: sentResult?.count || 0,
      failed: failedResult?.count || 0,
      pending: pendingResult?.count || 0,
      by_event_type: byEventType
    };
  }

  /**
   * Clean up old webhooks (for maintenance)
   */
  async cleanupOldWebhooks(daysOld: number = 30): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    const result = await this.db.run(
      'DELETE FROM webhooks WHERE created_at < ? AND status IN (?, ?)',
      [cutoffDate.toISOString(), WebhookStatus.SENT, WebhookStatus.FAILED]
    );

    return result.changes || 0;
  }

  /**
   * Test webhook endpoint
   */
  async testWebhookEndpoint(url: string): Promise<{
    success: boolean;
    response_time: number;
    status?: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      const testPayload = {
        id: uuidv4(),
        event_type: 'webhook.test',
        timestamp: new Date().toISOString(),
        data: {
          message: 'This is a test webhook'
        }
      };

      const response = await this.sendWebhookRequest(url, testPayload);
      const responseTime = Date.now() - startTime;

      return {
        success: true,
        response_time: responseTime,
        status: response.status
      };

    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      
      return {
        success: false,
        response_time: responseTime,
        status: error.response?.status,
        error: error.message
      };
    }
  }
} 