import { Worker } from '@temporalio/worker';
import * as activities from './activities/paymentActivities.js';
import { paymentWorkflow } from './workflows/paymentWorkflow.js';
import { temporalConfig } from './config.js';

async function run() {
  // Create a worker that connects to the Temporal server
  const worker = await Worker.create({
    workflowsPath: require.resolve('./workflows/paymentWorkflow'),
    activities,
    taskQueue: temporalConfig.taskQueue.paymentProcessing,
    // In production, you would configure these:
    // workflowsPath: require.resolve('./workflows'),
    // activitiesPath: require.resolve('./activities'),
  });

  console.log('Payment processing worker started. Listening for tasks...');

  // Start listening for tasks
  await worker.run();
}

run().catch((err) => {
  console.error('Worker error:', err);
  process.exit(1);
}); 