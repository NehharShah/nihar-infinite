/**
 * Temporal Workflow Example
 * 
 * This example demonstrates how to use the Cross-Border Payment API
 * with Temporal workflow orchestration.
 */

import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const API_KEY = 'cbp_test_api_key_123'; // Replace with your actual API key

// Helper function to generate idempotency keys
function generateIdempotencyKey() {
  return uuidv4();
}

// Helper function to make API calls
async function makeApiCall(endpoint, method = 'GET', data = null) {
  try {
    const config = {
      method,
      url: `${API_BASE_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': API_KEY,
        'Idempotency-Key': generateIdempotencyKey()
      }
    };

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return response.data;
  } catch (error) {
    console.error(`API Error (${endpoint}):`, error.response?.data || error.message);
    throw error;
  }
}

// Example 1: Create a payment and monitor workflow
async function exampleCreatePayment() {
  console.log('\n🔄 Example 1: Creating a payment with Temporal workflow');
  console.log('========================================================');

  try {
    // Create a payment
    const paymentData = {
      user_id: 'user_123',
      source_amount: 100,
      source_currency: 'USD',
      destination_currency: 'EUR',
      webhook_url: 'https://webhook.site/your-webhook-url' // Optional
    };

    console.log('📤 Creating payment...');
    const createResponse = await makeApiCall('/payments', 'POST', paymentData);
    
    if (createResponse.success) {
      const payment = createResponse.data;
      console.log('✅ Payment created successfully!');
      console.log(`   Payment ID: ${payment.id}`);
      console.log(`   Status: ${payment.status}`);
      console.log(`   Amount: ${payment.source_amount} ${payment.source_currency} → ${payment.destination_amount} ${payment.destination_currency}`);
      console.log(`   Fee: ${payment.fee_amount} ${payment.destination_currency}`);
      console.log(`   Total: ${payment.total_amount} ${payment.source_currency}`);

      // Monitor workflow status
      console.log('\n📊 Monitoring workflow status...');
      await monitorWorkflowStatus(payment.id);
    }
  } catch (error) {
    console.error('❌ Failed to create payment:', error.message);
  }
}

// Example 2: Get workflow status
async function monitorWorkflowStatus(paymentId) {
  console.log(`\n🔍 Monitoring workflow for payment: ${paymentId}`);
  
  const maxAttempts = 10;
  let attempts = 0;

  while (attempts < maxAttempts) {
    try {
      const statusResponse = await makeApiCall(`/payments/${paymentId}/workflow-status`);
      
      if (statusResponse.success) {
        const workflowStatus = statusResponse.data;
        console.log(`   Attempt ${attempts + 1}: ${workflowStatus.executionStatus || 'Unknown'}`);
        
        if (workflowStatus.executionStatus === 'COMPLETED') {
          console.log('✅ Workflow completed successfully!');
          return;
        } else if (workflowStatus.executionStatus === 'FAILED') {
          console.log('❌ Workflow failed!');
          return;
        }
      }
    } catch (error) {
      console.log(`   Attempt ${attempts + 1}: Error getting status`);
    }

    attempts++;
    await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
  }

  console.log('⏰ Workflow monitoring timed out');
}

// Example 3: Get fee estimate
async function exampleFeeEstimate() {
  console.log('\n💰 Example 2: Getting fee estimate');
  console.log('==================================');

  try {
    const estimateData = {
      source_amount: 500,
      source_currency: 'USD',
      destination_currency: 'GBP'
    };

    console.log('📊 Getting fee estimate...');
    const estimateResponse = await makeApiCall('/payments/estimate-fees', 'POST', estimateData);
    
    if (estimateResponse.success) {
      const estimate = estimateResponse.data;
      console.log('✅ Fee estimate received!');
      console.log(`   Source: ${estimate.source_amount} ${estimate.source_currency}`);
      console.log(`   Destination: ${estimate.destination_amount} ${estimate.destination_currency}`);
      console.log(`   Exchange Rate: ${estimate.exchange_rate}`);
      console.log(`   Base Fee: ${estimate.fee_breakdown.base_fee} ${estimate.destination_currency}`);
      console.log(`   Percentage Fee: ${estimate.fee_breakdown.percentage_fee} ${estimate.destination_currency}`);
      console.log(`   Total Fee: ${estimate.fee_breakdown.total_fee} ${estimate.destination_currency}`);
      console.log(`   Total Cost: ${estimate.total_cost} ${estimate.source_currency}`);
    }
  } catch (error) {
    console.error('❌ Failed to get fee estimate:', error.message);
  }
}

// Example 4: Get supported currencies
async function exampleSupportedCurrencies() {
  console.log('\n🌍 Example 3: Getting supported currencies');
  console.log('==========================================');

  try {
    console.log('📋 Getting supported currencies...');
    const currenciesResponse = await makeApiCall('/payments/supported-currencies');
    
    if (currenciesResponse.success) {
      const currencies = currenciesResponse.data;
      console.log('✅ Supported currencies:');
      
      // Group by currency to avoid duplicates
      const uniqueCurrencies = {};
      currencies.forEach(currency => {
        if (!uniqueCurrencies[currency.currency]) {
          uniqueCurrencies[currency.currency] = currency;
        }
      });
      
      Object.values(uniqueCurrencies).forEach(currency => {
        console.log(`   ${currency.currency}: Base Fee ${currency.base_fee}, Percentage ${(currency.percentage_fee * 100).toFixed(2)}%`);
      });
    }
  } catch (error) {
    console.error('❌ Failed to get supported currencies:', error.message);
  }
}

// Example 5: Cancel a payment
async function exampleCancelPayment(paymentId) {
  console.log('\n❌ Example 4: Cancelling a payment');
  console.log('==================================');

  try {
    console.log(`🚫 Cancelling payment: ${paymentId}`);
    const cancelResponse = await makeApiCall(`/payments/${paymentId}/cancel`, 'POST');
    
    if (cancelResponse.success) {
      console.log('✅ Payment cancelled successfully!');
    } else {
      console.log('⚠️  Payment could not be cancelled (may already be completed)');
    }
  } catch (error) {
    console.error('❌ Failed to cancel payment:', error.message);
  }
}

// Main execution
async function main() {
  console.log('🚀 Cross-Border Payment API - Temporal Workflow Examples');
  console.log('========================================================');
  console.log('Make sure you have:');
  console.log('1. API server running: npm run dev');
  console.log('2. Temporal server running: temporal server start-dev');
  console.log('3. Payment workers running: npm run worker');
  console.log('4. Updated API_KEY in this script');
  console.log('');

  try {
    // Run examples
    await exampleSupportedCurrencies();
    await exampleFeeEstimate();
    
    // Create a payment and monitor it
    await exampleCreatePayment();
    
    // Note: In a real scenario, you would wait for the payment to be created
    // and then potentially cancel it. For this example, we'll just show the structure.
    // await exampleCancelPayment('payment-id-here');
    
  } catch (error) {
    console.error('❌ Example execution failed:', error.message);
  }

  console.log('\n🎉 Examples completed!');
  console.log('\n📚 Next steps:');
  console.log('1. Check Temporal UI: http://localhost:8233');
  console.log('2. View workflow history and task queues');
  console.log('3. Monitor payment processing in real-time');
  console.log('4. Explore the API documentation: http://localhost:3000/docs');
}

// Run the examples
main().catch(console.error);

export {
  exampleCreatePayment,
  exampleFeeEstimate,
  exampleSupportedCurrencies,
  exampleCancelPayment,
  monitorWorkflowStatus
}; 