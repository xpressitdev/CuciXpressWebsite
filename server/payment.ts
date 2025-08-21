// Pocket Pay API Integration for Cuci Xpress
// Documentation: https://app.swaggerhub.com/apis/ThreeGMedia/Pocket_Pay_API/

import crypto from 'crypto';

// Pocket Pay Configuration (using your actual API credentials)
const POCKET_PAY_CONFIG = {
  TEST_API_URL: 'http://pay.threeg.asia', // Test environment
  PROD_API_URL: 'https://pocket-pay.threeg.asia', // Production environment
  API_KEY: process.env.POCKET_PAY_API_KEY!, // Your actual API key
  SALT: process.env.POCKET_PAY_SALT! // Your actual salt
};

interface PaymentRequest {
  serviceName: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  cardNumber: string;
  expiryMonth: string;
  expiryYear: string;
  cvv: string;
  selectedBranch: string;
}

interface PocketPayOrderRequest {
  api_key: string;
  salt: string;
}

interface PocketPayHashRequest {
  api_key: string;
  order_id: string;
  amount: string;
  currency: string;
  description: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  return_url: string;
  cancel_url: string;
  callback_url: string;
  salt: string;
}

interface PocketPayCreateRequest {
  api_key: string;
  order_id: string;
  amount: string;
  currency: string;
  description: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  return_url: string;
  cancel_url: string;
  callback_url: string;
  hash: string;
}

// Generate unique transaction ID
function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `CX_${timestamp}_${random}`.toUpperCase();
}

// Generate hash for Pocket Pay API (following documentation format)
function generatePocketPayHash(hashData: PocketPayHashRequest): string {
  // Create hash string according to Pocket Pay documentation format
  const hashString = `${hashData.api_key}|${hashData.order_id}|${hashData.amount}|${hashData.currency}|${hashData.customer_email}|${hashData.salt}`;
  
  // Generate MD5 hash (as typically used by payment gateways)
  const hash = crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex');
    
  return hash.toUpperCase();
}

// Process payment through Pocket Pay using correct API flow
export async function processPocketPayPayment(paymentData: PaymentRequest): Promise<any> {
  try {
    const transactionId = generateTransactionId();
    
    console.log('Processing Pocket Pay transaction:', {
      transaction_id: transactionId,
      amount: paymentData.amount,
      customer_email: paymentData.customerEmail,
      service: paymentData.serviceName,
      branch: paymentData.selectedBranch
    });

    // Step 1: Generate Order ID
    const orderRequest: PocketPayOrderRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT
    };

    console.log('Sending order request to:', `${POCKET_PAY_CONFIG.PROD_API_URL}/payments/getNewOrderId`);
    console.log('Order request data:', JSON.stringify(orderRequest, null, 2));
    
    const orderResponse = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/getNewOrderId`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(orderRequest)
    });

    if (!orderResponse.ok) {
      const errorText = await orderResponse.text();
      console.error('Order ID API Error:', orderResponse.status, errorText);
      throw new Error(`Order ID generation failed: ${orderResponse.status} - ${errorText}`);
    }

    const orderResult = await orderResponse.json();
    console.log('Order ID response:', orderResult);
    const orderId = orderResult.new_id; // According to documentation, it returns "new_id" not "order_id"

    // Step 2: Generate Hash - Use same format as order ID generation
    const hashRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT,
      order_id: orderId,
      amount: paymentData.amount.toString(),
      currency: 'BND',
      description: `${paymentData.serviceName} - ${paymentData.selectedBranch} branch`,
      customer_name: paymentData.customerName,
      customer_email: paymentData.customerEmail,
      customer_phone: paymentData.customerPhone,
      return_url: `https://cucixpress.com/payment-success`,
      cancel_url: `https://cucixpress.com/payment-cancel`,
      callback_url: `https://cucixpress.com/api/payment-callback`
    };

    // Try simplified hash request first - some APIs only need api_key and salt for hash generation
    const simpleHashRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT
    };

    console.log('Sending hash request to:', `${POCKET_PAY_CONFIG.PROD_API_URL}/payments/hash`);
    console.log('Simple hash request data:', JSON.stringify(simpleHashRequest, null, 2));
    
    const hashResponse = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/hash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(simpleHashRequest)
    });

    let hash = '';
    if (!hashResponse.ok) {
      const errorText = await hashResponse.text();
      console.error('Hash API Error with simple request:', hashResponse.status, errorText);
      
      // If simple request fails, try with full data
      console.log('Trying hash generation with full data...');
      const fullHashResponse = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/hash`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(hashRequest)
      });

      if (!fullHashResponse.ok) {
        const fullErrorText = await fullHashResponse.text();
        console.error('Hash API Error with full request:', fullHashResponse.status, fullErrorText);
        throw new Error(`Hash generation failed: ${fullHashResponse.status} - ${fullErrorText}`);
      }

      const fullHashResult = await fullHashResponse.json();
      console.log('Hash generation response (full):', fullHashResult);
      hash = fullHashResult.hash;
    } else {
      const hashResult = await hashResponse.json();
      console.log('Hash generation response (simple):', hashResult);
      hash = hashResult.hash;
    }

    // Step 3: Create Payment Link
    const createRequest: PocketPayCreateRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      order_id: orderId,
      amount: paymentData.amount.toString(),
      currency: 'BND',
      description: `${paymentData.serviceName} - ${paymentData.selectedBranch} branch`,
      customer_name: paymentData.customerName,
      customer_email: paymentData.customerEmail,
      customer_phone: paymentData.customerPhone,
      return_url: `https://cucixpress.com/payment-success`,
      cancel_url: `https://cucixpress.com/payment-cancel`,
      callback_url: `https://cucixpress.com/api/payment-callback`,
      hash: hash
    };

    console.log('Sending payment creation request to:', `${POCKET_PAY_CONFIG.PROD_API_URL}/payments/create`);
    console.log('Payment creation data:', JSON.stringify(createRequest, null, 2));
    
    const createResponse = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(createRequest)
    });

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      console.error('Payment creation API Error:', createResponse.status, errorText);
      throw new Error(`Payment creation failed: ${createResponse.status} - ${errorText}`);
    }

    const createResult = await createResponse.json();
    console.log('Payment creation response:', createResult);

    console.log('Payment link created successfully:', {
      order_id: orderId,
      payment_url: createResult.payment_url || createResult.url,
      transaction_id: transactionId
    });

    return {
      success: true,
      transaction_id: transactionId,
      order_id: orderId,
      payment_url: createResult.payment_url,
      qr_code: createResult.qr_code,
      message: 'Payment link created successfully'
    };
    
  } catch (error) {
    console.error('Pocket Pay payment processing error:', error);
    
    return {
      success: false,
      message: 'Payment processing failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Handle payment callback from Pocket Pay
export function handlePaymentCallback(callbackData: any): any {
  try {
    console.log('Payment callback received:', callbackData);

    // Verify callback authenticity (implement hash verification here)
    const expectedHash = generateCallbackHash(callbackData);
    
    if (callbackData.hash !== expectedHash) {
      console.warn('Invalid callback hash detected');
      return {
        success: false,
        message: 'Invalid callback authentication'
      };
    }

    // Process callback based on status
    if (callbackData.status === 'success' || callbackData.status === 'completed') {
      console.log('Payment completed successfully:', callbackData);
      
      // Here you can update your database, send confirmation emails, etc.
      
      return {
        success: true,
        status: 'completed',
        transaction_id: callbackData.transaction_id,
        order_id: callbackData.order_id,
        message: 'Payment completed successfully'
      };
    } else if (callbackData.status === 'failed' || callbackData.status === 'cancelled') {
      console.log('Payment failed or cancelled:', callbackData);
      
      return {
        success: false,
        status: callbackData.status,
        transaction_id: callbackData.transaction_id,
        order_id: callbackData.order_id,
        message: `Payment ${callbackData.status}`
      };
    } else {
      console.log('Payment status unknown:', callbackData);
      
      return {
        success: false,
        status: 'unknown',
        message: 'Unknown payment status'
      };
    }
    
  } catch (error) {
    console.error('Payment callback processing error:', error);
    
    return {
      success: false,
      message: 'Callback processing failed'
    };
  }
}

// Generate callback hash for verification
function generateCallbackHash(callbackData: any): string {
  // Implement hash generation for callback verification
  // This should match the format expected by Pocket Pay
  const hashString = `${callbackData.api_key}|${callbackData.order_id}|${callbackData.status}|${callbackData.amount}|${POCKET_PAY_CONFIG.SALT}`;
  
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}

// Query transaction status
export async function queryTransactionStatus(orderId: string): Promise<any> {
  try {
    const statusRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      order_id: orderId,
      hash: generateStatusHash(orderId)
    };

    const response = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(statusRequest)
    });

    if (!response.ok) {
      throw new Error(`Status query failed: ${response.status}`);
    }

    const result = await response.json();
    return result;
    
  } catch (error) {
    console.error('Transaction status query error:', error);
    return {
      success: false,
      message: 'Status query failed'
    };
  }
}

// Generate hash for status query
function generateStatusHash(orderId: string): string {
  const hashString = `${POCKET_PAY_CONFIG.API_KEY}|${orderId}|${POCKET_PAY_CONFIG.SALT}`;
  
  return crypto
    .createHash('md5')
    .update(hashString)
    .digest('hex')
    .toUpperCase();
}