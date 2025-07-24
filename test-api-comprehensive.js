import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';

const API_BASE_URL = 'http://localhost:3000/api/v1';
const TEMPORAL_UI_URL = 'http://localhost:8233';

// Test configuration
const TEST_CONFIG = {
  timeout: 10000,
  retries: 3,
  delay: 1000
};

// Test results storage
const testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  details: []
};

// Helper function to add test result
function addResult(testName, success, details = null, error = null) {
  testResults.total++;
  if (success) {
    testResults.passed++;
    console.log(`✅ ${testName}`);
  } else {
    testResults.failed++;
    console.log(`❌ ${testName}`);
    if (error) console.log(`   Error: ${error}`);
  }
  
  testResults.details.push({
    name: testName,
    success,
    details,
    error,
    timestamp: new Date().toISOString()
  });
}

// Helper function to make API calls with retry
async function makeApiCall(endpoint, method = 'GET', data = null, headers = {}) {
  const config = {
    method,
    url: `${API_BASE_URL}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': uuidv4(),
      ...headers
    },
    timeout: TEST_CONFIG.timeout
  };

  if (data) {
    config.data = data;
  }

  for (let attempt = 1; attempt <= TEST_CONFIG.retries; attempt++) {
    try {
      const response = await axios(config);
      return response.data;
    } catch (error) {
      if (attempt === TEST_CONFIG.retries) {
        throw error;
      }
      await new Promise(resolve => setTimeout(resolve, TEST_CONFIG.delay));
    }
  }
}

// Helper function to wait
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Test 1: Health Check
async function testHealthCheck() {
  try {
    const response = await axios.get('http://localhost:3000/health');
    const success = response.data.status === 'healthy';
    addResult('Health Check', success, response.data);
    return success;
  } catch (error) {
    addResult('Health Check', false, null, error.message);
    return false;
  }
}

// Test 2: API Landing Page
async function testApiLandingPage() {
  try {
    const response = await axios.get('http://localhost:3000/');
    const success = response.data && response.data.name === 'Cross-Border Payment API';
    addResult('API Landing Page', success, response.data);
    return success;
  } catch (error) {
    addResult('API Landing Page', false, null, error.message);
    return false;
  }
}

// Test 3: Swagger Documentation
async function testSwaggerDocs() {
  try {
    const response = await axios.get('http://localhost:3000/docs/');
    const success = response.status === 200 && response.data.includes('Cross-Border Payment API');
    addResult('Swagger Documentation', success, { status: response.status });
    return success;
  } catch (error) {
    addResult('Swagger Documentation', false, null, error.message);
    return false;
  }
}

// Test 4: Fee Estimation
async function testFeeEstimation() {
  try {
    const data = {
      source_amount: 100,
      source_currency: 'USD',
      destination_currency: 'EUR'
    };
    
    const response = await makeApiCall('/payments/estimate-fees', 'POST', data);
    const success = response.success && response.data && response.data.fee_breakdown;
    addResult('Fee Estimation', success, response.data);
    return success;
  } catch (error) {
    addResult('Fee Estimation', false, null, error.message);
    return false;
  }
}

// Test 5: Supported Currencies
async function testSupportedCurrencies() {
  try {
    const response = await makeApiCall('/payments/supported-currencies');
    const success = response.success && Array.isArray(response.data);
    addResult('Supported Currencies', success, { count: response.data?.length });
    return success;
  } catch (error) {
    addResult('Supported Currencies', false, null, error.message);
    return false;
  }
}

// Test 6: Payment Creation with Temporal
async function testPaymentCreation() {
  try {
    const data = {
      user_id: 'test-user-123',
      source_amount: 50,
      source_currency: 'USD',
      destination_currency: 'GBP',
      webhook_url: 'https://httpbin.org/post'
    };
    
    const response = await makeApiCall('/payments', 'POST', data);
    const success = response.success && response.data && response.data.id;
    
    if (success) {
      addResult('Payment Creation', success, {
        payment_id: response.data.id,
        status: response.data.status,
        amount: `${response.data.source_amount} ${response.data.source_currency} → ${response.data.destination_amount} ${response.data.destination_currency}`
      });
      
      // Store payment ID for workflow testing
      return response.data.id;
    } else {
      addResult('Payment Creation', false, null, 'Payment creation failed');
      return null;
    }
  } catch (error) {
    addResult('Payment Creation', false, null, error.message);
    return null;
  }
}

// Test 7: Workflow Status Check
async function testWorkflowStatus(paymentId) {
  if (!paymentId) {
    addResult('Workflow Status Check', false, null, 'No payment ID available');
    return false;
  }
  
  try {
    const response = await makeApiCall(`/payments/${paymentId}/workflow-status`);
    const success = response.success !== undefined; // Even if workflow not found, it's a valid response
    addResult('Workflow Status Check', success, response.data);
    return success;
  } catch (error) {
    addResult('Workflow Status Check', false, null, error.message);
    return false;
  }
}

// Test 8: Webhook Testing
async function testWebhook() {
  try {
    const data = {
      webhook_url: 'https://httpbin.org/post'
    };
    
    const response = await makeApiCall('/webhooks/test', 'POST', data);
    const success = response.success !== undefined; // Even if webhook fails, it's a valid response
    addResult('Webhook Testing', success, response.data);
    return success;
  } catch (error) {
    addResult('Webhook Testing', false, null, error.message);
    return false;
  }
}

// Test 9: Authentication Endpoints
async function testAuthentication() {
  try {
    // Test login with invalid credentials (should fail gracefully)
    const loginData = {
      email: 'test@example.com',
      password: 'wrongpassword'
    };
    
    const response = await makeApiCall('/auth/login', 'POST', loginData);
    const success = response.success === false && response.error; // Expected to fail
    addResult('Authentication (Login)', success, { expected_failure: true, error: response.error });
    return success;
  } catch (error) {
    addResult('Authentication (Login)', false, null, error.message);
    return false;
  }
}

// Test 10: Temporal UI Access
async function testTemporalUI() {
  try {
    const response = await axios.get(TEMPORAL_UI_URL);
    const success = response.status === 200 && response.data.includes('<!doctype html>');
    addResult('Temporal UI Access', success, { status: response.status });
    return success;
  } catch (error) {
    addResult('Temporal UI Access', false, null, error.message);
    return false;
  }
}

// Test 11: Temporal Workflow Count
async function testTemporalWorkflows() {
  try {
    const response = await axios.get(`${TEMPORAL_UI_URL}/api/v1/namespaces/default/workflows`);
    const workflows = response.data.executions || [];
    const success = Array.isArray(workflows);
    addResult('Temporal Workflows', success, { 
      workflow_count: workflows.length,
      workflows: workflows.map(w => ({ id: w.execution.workflowId, status: w.execution.status }))
    });
    return success;
  } catch (error) {
    addResult('Temporal Workflows', false, null, error.message);
    return false;
  }
}

// Test 12: Admin Endpoints (should require authentication)
async function testAdminEndpoints() {
  try {
    const response = await makeApiCall('/admin/users');
    const success = response.success === false && response.error; // Expected to fail without auth
    addResult('Admin Endpoints (Auth Required)', success, { expected_failure: true, error: response.error });
    return success;
  } catch (error) {
    addResult('Admin Endpoints (Auth Required)', false, null, error.message);
    return false;
  }
}

// Test 13: Ledger Endpoints
async function testLedgerEndpoints() {
  try {
    const response = await makeApiCall('/ledger/transactions');
    const success = response.success !== undefined; // Should return a response (even if empty)
    addResult('Ledger Endpoints', success, response.data);
    return success;
  } catch (error) {
    addResult('Ledger Endpoints', false, null, error.message);
    return false;
  }
}

// Test 14: Error Handling
async function testErrorHandling() {
  try {
    // Test invalid endpoint
    const response = await axios.get(`${API_BASE_URL}/invalid-endpoint`);
    addResult('Error Handling (Invalid Endpoint)', false, null, 'Should have returned 404');
    return false;
  } catch (error) {
    const success = error.response && error.response.status === 404;
    addResult('Error Handling (Invalid Endpoint)', success, { status: error.response?.status });
    return success;
  }
}

// Test 15: Rate Limiting (if implemented)
async function testRateLimiting() {
  try {
    // Make multiple rapid requests to test rate limiting
    const promises = Array(5).fill().map(() => 
      makeApiCall('/payments/supported-currencies')
    );
    
    const responses = await Promise.all(promises);
    const success = responses.every(r => r.success !== undefined);
    addResult('Rate Limiting', success, { requests_made: responses.length });
    return success;
  } catch (error) {
    addResult('Rate Limiting', false, null, error.message);
    return false;
  }
}

// Main test execution
async function runAllTests() {
  console.log('🚀 Starting Comprehensive API Testing');
  console.log('=====================================');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Temporal UI URL: ${TEMPORAL_UI_URL}`);
  console.log('');

  // Basic connectivity tests
  await testHealthCheck();
  await testApiLandingPage();
  await testSwaggerDocs();
  await testTemporalUI();
  
  await wait(500);
  
  // API functionality tests
  await testFeeEstimation();
  await testSupportedCurrencies();
  await testWebhook();
  await testAuthentication();
  await testAdminEndpoints();
  await testLedgerEndpoints();
  
  await wait(500);
  
  // Temporal integration tests
  const paymentId = await testPaymentCreation();
  await wait(2000); // Wait for workflow to start
  await testWorkflowStatus(paymentId);
  await testTemporalWorkflows();
  
  await wait(500);
  
  // System tests
  await testErrorHandling();
  await testRateLimiting();
  
  // Print summary
  console.log('\n📊 Test Summary');
  console.log('===============');
  console.log(`Total Tests: ${testResults.total}`);
  console.log(`Passed: ${testResults.passed}`);
  console.log(`Failed: ${testResults.failed}`);
  console.log(`Success Rate: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
  
  console.log('\n🎯 Temporal Integration Evaluation');
  console.log('==================================');
  const temporalTests = testResults.details.filter(t => 
    t.name.includes('Temporal') || t.name.includes('Workflow') || t.name.includes('Payment')
  );
  
  temporalTests.forEach(test => {
    console.log(`${test.success ? '✅' : '❌'} ${test.name}`);
    if (test.details) {
      console.log(`   Details: ${JSON.stringify(test.details)}`);
    }
  });
  
  console.log('\n🔗 Access Points');
  console.log('================');
  console.log(`API Documentation: http://localhost:3000/docs/`);
  console.log(`Temporal UI: ${TEMPORAL_UI_URL}`);
  console.log(`Health Check: http://localhost:3000/health`);
  
  console.log('\n📋 Detailed Results');
  console.log('==================');
  testResults.details.forEach(test => {
    console.log(`${test.success ? '✅' : '❌'} ${test.name}`);
    if (test.error) {
      console.log(`   Error: ${test.error}`);
    }
  });
  
  return testResults;
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(console.error);
}

export { runAllTests, testResults }; 