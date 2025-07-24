import { Client, Connection } from '@temporalio/client';
import { paymentWorkflow, PaymentWorkflowInput } from './workflows/paymentWorkflow.js';
import { temporalConfig } from './config.js';

export class TemporalClient {
  private client: Client;

  constructor() {
    this.client = new Client({
      namespace: temporalConfig.server.namespace,
    });
  }

  /**
   * Start a payment workflow
   */
  async startPaymentWorkflow(input: PaymentWorkflowInput): Promise<string> {
    const workflowId = `payment-${input.paymentId}`;
    
    const handle = await this.client.workflow.start(paymentWorkflow, {
      taskQueue: temporalConfig.taskQueue.paymentProcessing,
      workflowId,
      args: [input],
    });

    console.log(`Started payment workflow with ID: ${workflowId}`);
    return workflowId;
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(workflowId: string): Promise<any> {
    const handle = this.client.workflow.getHandle(workflowId);
    const status = await handle.describe();
    return status;
  }

  /**
   * Cancel a workflow
   */
  async cancelWorkflow(workflowId: string): Promise<void> {
    const handle = this.client.workflow.getHandle(workflowId);
    await handle.cancel();
    console.log(`Cancelled workflow: ${workflowId}`);
  }

  /**
   * Get workflow result
   */
  async getWorkflowResult(workflowId: string): Promise<any> {
    const handle = this.client.workflow.getHandle(workflowId);
    return await handle.result();
  }

  /**
   * Query workflow
   */
  async queryWorkflow(workflowId: string, queryType: string): Promise<any> {
    const handle = this.client.workflow.getHandle(workflowId);
    return await handle.query(queryType);
  }
}

// Export singleton instance
export const temporalClient = new TemporalClient(); 