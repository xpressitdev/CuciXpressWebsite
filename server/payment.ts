// Pocket Pay API Integration for Cuci Xpress
// Documentation: https://app.swaggerhub.com/apis/ThreeGMedia/Pocket_Pay_API/

import crypto from 'crypto';
import { sendPaymentConfirmation } from './email';

// Pocket Pay Configuration - Production environment with credentials from environment
const POCKET_PAY_CONFIG = {
  TEST_API_URL: 'http://pay.threeg.asia', // Test environment URL
  PROD_API_URL: 'https://pocket-pay.threeg.asia', // Production environment URL
  API_KEY: process.env.POCKET_PAY_API_KEY || '', // Production API key from secrets
  SALT: process.env.POCKET_PAY_SALT || '', // Production salt from secrets
  MERCHANT_ID: process.env.POCKET_PAY_MERCHANT_ID || '' // Merchant ID from secrets
};

// Debug production configuration with activated credentials
console.log('Pocket Pay Production Config:', {
  api_key_length: POCKET_PAY_CONFIG.API_KEY.length,
  salt_length: POCKET_PAY_CONFIG.SALT.length,
  merchant_id: POCKET_PAY_CONFIG.MERCHANT_ID,
  api_key_preview: POCKET_PAY_CONFIG.API_KEY.substring(0, 8) + '...',
  salt_preview: POCKET_PAY_CONFIG.SALT.substring(0, 8) + '...',
  environment: 'PRODUCTION - Live Payment Processing'
});

interface PaymentRequest {
  serviceName: string;
  amount: number;
  carPlate: string;
  phone: string;
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
      car_plate: paymentData.carPlate,
      phone: paymentData.phone,
      service: paymentData.serviceName,
      branch: paymentData.selectedBranch
    });

    // Step 1: Generate Order ID
    const orderRequest: PocketPayOrderRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT
    };

    console.log('Sending order request to:', `${POCKET_PAY_CONFIG.PROD_API_URL}/payments/getNewOrderId`);
    
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

    // Step 2: Generate Hash Data (following exact documentation format) 
    const currentDomain = process.env.NODE_ENV === 'development' ? 'http://localhost:5000' : 'https://cucixpress.com';
    const liveDomain = currentDomain; // Use current domain for redirects
    
    // Convert BND to cents for production API (multiply by 100)
    const amountInCents = Math.round(paymentData.amount * 100);
    
    const hashRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT,
      subamount_1: amountInCents,
      subamount_1_label: "Order Total",
      subamount_2: 0,
      subamount_2_label: "string",
      subamount_3: 0,
      subamount_3_label: "string",
      subamount_4: 0,
      subamount_4_label: "string",
      subamount_5: 0,
      subamount_5_label: "string",
      order_id: orderId,
      order_info: `This is the order info ${orderId}.`,
      order_desc: `${paymentData.serviceName} - ${paymentData.selectedBranch} branch`,
      return_url: `${liveDomain}/payment-success`,
      callback_url: `${liveDomain}/api/payment-callback`,
      discount: 0
    };

    console.log('Sending hash request to:', `${POCKET_PAY_CONFIG.PROD_API_URL}/payments/hash`);
    
    const hashResponse = await fetch(`${POCKET_PAY_CONFIG.PROD_API_URL}/payments/hash`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(hashRequest)
    });

    if (!hashResponse.ok) {
      const errorText = await hashResponse.text();
      console.error('Hash API Error:', hashResponse.status, errorText);
      throw new Error(`Hash generation failed: ${hashResponse.status} - ${errorText}`);
    }

    const hashResult = await hashResponse.json();
    console.log('Hash generation response:', hashResult);
    const hashedData = hashResult.hashed_data;

    // Step 3: Create Payment Link & QR (following exact documentation format)
    const createRequest = {
      api_key: POCKET_PAY_CONFIG.API_KEY,
      salt: POCKET_PAY_CONFIG.SALT,
      hashed_data: hashedData,
      subamount_1: amountInCents,
      subamount_1_label: "Order Total",
      subamount_2: 0,
      subamount_2_label: "string",
      subamount_3: 0,
      subamount_3_label: "string",
      subamount_4: 0,
      subamount_4_label: "string",
      subamount_5: 0,
      subamount_5_label: "string",
      order_id: orderId,
      order_info: `This is the order info ${orderId}.`,
      order_desc: `${paymentData.serviceName} - ${paymentData.selectedBranch} branch`,
      return_url: `${liveDomain}/payment-success`,
      callback_url: `${liveDomain}/api/payment-callback`,
      discount: 0
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
      order_ref: createResult.order_ref,
      payment_url: createResult.payment_url,
      success_indicator: createResult.success_indicator,
      qr: createResult.qr ? 'QR code generated' : 'No QR code',
      transaction_id: transactionId
    });

    return {
      success: true,
      transaction_id: transactionId,
      order_id: orderId,
      order_ref: createResult.order_ref,
      payment_url: createResult.payment_url,
      success_indicator: createResult.success_indicator,
      qr_code: createResult.qr,
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

    const response = await fetch(`${POCKET_PAY_CONFIG.TEST_API_URL}/payments/status`, {
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