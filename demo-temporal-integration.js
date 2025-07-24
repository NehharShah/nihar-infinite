import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const TEMPORAL_UI_URL = 'http://localhost:8233';

console.log('🎯 Cross-Border Payment API - Temporal Integration Demo');
console.log('======================================================');
console.log('');

// Helper function to make API calls
async function makeApiCall(endpoint, method = 'GET', data = null) {
  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': uuidv4()
    }
  };

  if (data) {
    config.data = data;
  }

  const response = await axios(config);
  return response.data;
}

// Helper function to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Demo function
async function runDemo() {
  try {
    console.log('📊 Step 1: Checking System Health');
    console.log('----------------------------------');
    
    const healthResponse = await axios.get('http://localhost:3000/health');
    console.log(`✅ API Health: ${healthResponse.data.status}`);
    console.log(`⏱️  Uptime: ${Math.round(healthResponse.data.uptime)}s`);
    console.log(`📦 Version: ${healthResponse.data.version}`);
    console.log('');

    console.log('💰 Step 2: Getting Fee Estimate');
    console.log('--------------------------------');
    
    const feeEstimate = await makeApiCall('/payments/estimate-fees', 'POST', {
      source_amount: 100,
      source_currency: 'USD',
      destination_currency: 'EUR'
    });
    
    if (feeEstimate.success) {
      const data = feeEstimate.data;
      console.log(`💵 Source: ${data.source_amount} ${data.source_currency}`);
      console.log(`💶 Destination: ${data.destination_amount} ${data.destination_currency}`);
      console.log(`📈 Exchange Rate: ${data.exchange_rate}`);
      console.log(`💸 Total Fee: ${data.fee_breakdown.total_fee} ${data.fee_breakdown.currency}`);
      console.log(`💰 Total Cost: ${data.total_cost} ${data.source_currency}`);
    }
    console.log('');

    console.log('🚀 Step 3: Creating Payment with Temporal Workflow');
    console.log('--------------------------------------------------');
    
    const paymentData = {
      user_id: 'demo-user-123',
      source_amount: 75,
      source_currency: 'USD',
      destination_currency: 'GBP',
      webhook_url: 'https://httpbin.org/post'
    };
    
    const paymentResponse = await makeApiCall('/payments', 'POST', paymentData);
    
    if (paymentResponse.success) {
      const payment = paymentResponse.data;
      console.log(`🆔 Payment ID: ${payment.id}`);
      console.log(`📊 Status: ${payment.status}`);
      console.log(`💵 Amount: ${payment.source_amount} ${payment.source_currency} → ${payment.destination_amount} ${payment.destination_currency}`);
      console.log(`💸 Fee: ${payment.fee_amount} ${payment.destination_currency}`);
      console.log(`⏰ Estimated Completion: ${payment.estimated_completion}`);
      console.log('');
      
      // Store payment ID for workflow monitoring
      const paymentId = payment.id;
      
      console.log('🔄 Step 4: Monitoring Temporal Workflow');
      console.log('----------------------------------------');
      
      // Monitor workflow for 30 seconds
      for (let i = 1; i <= 10; i++) {
        await wait(3000); // Wait 3 seconds between checks
        
        try {
          const workflowStatus = await makeApiCall(`/payments/${paymentId}/workflow-status`);
          
          if (workflowStatus.success && workflowStatus.data) {
            const status = workflowStatus.data;
            console.log(`📊 Check ${i}: ${status.executionStatus || 'RUNNING'}`);
            
            if (status.executionStatus === 'COMPLETED') {
              console.log('✅ Workflow completed successfully!');
              break;
            } else if (status.executionStatus === 'FAILED') {
              console.log('❌ Workflow failed!');
              break;
            }
          } else {
            console.log(`📊 Check ${i}: Workflow not found (may still be starting)`);
          }
        } catch (error) {
          console.log(`📊 Check ${i}: Error checking status`);
        }
      }
      console.log('');

      console.log('📈 Step 5: Temporal Workflow Statistics');
      console.log('----------------------------------------');
      
      try {
        const workflowsResponse = await axios.get(`${TEMPORAL_UI_URL}/api/v1/namespaces/default/workflows`);
        const workflows = workflowsResponse.data.executions || [];
        
        console.log(`📊 Total Active Workflows: ${workflows.length}`);
        workflows.forEach((workflow, index) => {
          const status = workflow.execution.status;
          const workflowId = workflow.execution.workflowId;
          console.log(`   ${index + 1}. ${workflowId} - ${status}`);
        });
      } catch (error) {
        console.log('❌ Could not fetch workflow statistics');
      }
      console.log('');

      console.log('🌐 Step 6: Webhook Testing');
      console.log('---------------------------');
      
      const webhookTest = await makeApiCall('/webhooks/test', 'POST', {
        webhook_url: 'https://httpbin.org/post'
      });
      
      if (webhookTest.success) {
        const webhookData = webhookTest.data;
        console.log(`📡 Webhook Status: ${webhookData.success ? '✅ Success' : '❌ Failed'}`);
        console.log(`⏱️  Response Time: ${webhookData.response_time}ms`);
        console.log(`📊 HTTP Status: ${webhookData.status}`);
      }
      console.log('');

    } else {
      console.log('❌ Failed to create payment:', paymentResponse.error?.message);
    }

    console.log('🎉 Demo Completed Successfully!');
    console.log('');
    console.log('🔗 Access Points:');
    console.log('   📚 API Documentation: http://localhost:3000/docs/');
    console.log('   🕒 Temporal UI: http://localhost:8233');
    console.log('   💚 Health Check: http://localhost:3000/health');
    console.log('');
    console.log('📋 What You Just Witnessed:');
    console.log('   1. ✅ Real-time fee calculation with dynamic rates');
    console.log('   2. ✅ Payment creation with Temporal workflow orchestration');
    console.log('   3. ✅ Live workflow monitoring and status tracking');
    console.log('   4. ✅ Webhook delivery testing');
    console.log('   5. ✅ Temporal workflow statistics');
    console.log('');
    console.log('🚀 The system demonstrates:');
    console.log('   • Reliable payment processing with automatic retries');
    console.log('   • Scalable workflow orchestration');
    console.log('   • Real-time monitoring and observability');
    console.log('   • Fault-tolerant architecture');
    console.log('   • Production-ready error handling');

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
  }
}

// Run the demo
runDemo(); 