
import crypto from 'crypto';

// Pocket Pay Test Configuration
const POCKET_PAY_CONFIG = {
  TEST_API_URL: 'https://test-api.pocketpay.com.bn',
  TEST_MERCHANT_ID: 'TEST_MERCHANT', // Replace with actual test merchant ID from documentation
  TEST_SECRET_KEY: 'TEST_SECRET_KEY', // Replace with actual test secret key from documentation
  TEST_SALT: 'TEST_SALT' // Replace with actual test salt from documentation
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

interface PocketPayTransaction {
  merchant_id: string;
  transaction_id: string;
  amount: number;
  currency: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string;
  card_number: string;
  expiry_month: string;
  expiry_year: string;
  cvv: string;
  description: string;
  return_url: string;
  cancel_url: string;
  callback_url: string;
  timestamp: string;
  hash: string;
}

// Generate unique transaction ID
function generateTransactionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 15);
  return `CX_${timestamp}_${random}`.toUpperCase();
}

// Generate hash for Pocket Pay API
function generateHash(data: any, salt: string, secretKey: string): string {
  // Create hash string in the format required by Pocket Pay
  const hashString = `${data.merchant_id}|${data.transaction_id}|${data.amount}|${data.currency}|${data.customer_email}|${salt}`;
  
  // Generate HMAC SHA256 hash
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(hashString)
    .digest('hex');
    
  return hash;
}

// Process payment through Pocket Pay
export async function processPocketPayPayment(paymentData: PaymentRequest): Promise<any> {
  try {
    const transactionId = generateTransactionId();
    const timestamp = new Date().toISOString();
    
    // Prepare transaction data
    const transactionData = {
      merchant_id: POCKET_PAY_CONFIG.TEST_MERCHANT_ID,
      transaction_id: transactionId,
      amount: paymentData.amount,
      currency: 'BND',
      customer_name: paymentData.customerName,
      customer_email: paymentData.customerEmail,
      customer_phone: paymentData.customerPhone,
      card_number: paymentData.cardNumber,
      expiry_month: paymentData.expiryMonth,
      expiry_year: paymentData.expiryYear,
      cvv: paymentData.cvv,
      description: `Cuci Xpress - ${paymentData.serviceName} at ${paymentData.selectedBranch} branch`,
      return_url: 'https://your-repl-url.repl.co/payment-success',
      cancel_url: 'https://your-repl-url.repl.co/payment-cancel',
      callback_url: 'https://your-repl-url.repl.co/api/payment-callback',
      timestamp: timestamp
    };

    // Generate hash
    const hash = generateHash(transactionData, POCKET_PAY_CONFIG.TEST_SALT, POCKET_PAY_CONFIG.TEST_SECRET_KEY);
    
    // Add hash to transaction data
    const finalTransactionData: PocketPayTransaction = {
      ...transactionData,
      hash: hash
    };

    // Log transaction attempt
    console.log('Processing Pocket Pay transaction:', {
      transaction_id: transactionId,
      amount: paymentData.amount,
      customer_email: paymentData.customerEmail,
      service: paymentData.serviceName,
      branch: paymentData.selectedBranch
    });

    // Make API request to Pocket Pay
    const response = await fetch(`${POCKET_PAY_CONFIG.TEST_API_URL}/api/v1/payment/process`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(finalTransactionData)
    });

    if (!response.ok) {
      throw new Error(`Pocket Pay API error: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();

    // Handle different response statuses
    if (result.status === 'success' || result.status === 'approved') {
      console.log('Payment successful:', result);
      return {
        success: true,
        transaction_id: transactionId,
        payment_id: result.payment_id || result.reference_number,
        message: 'Payment processed successfully',
        data: result
      };
    } else if (result.status === 'pending') {
      console.log('Payment pending:', result);
      return {
        success: false,
        pending: true,
        transaction_id: transactionId,
        message: 'Payment is being processed',
        data: result
      };
    } else {
      console.log('Payment failed:', result);
      return {
        success: false,
        transaction_id: transactionId,
        message: result.message || 'Payment failed',
        error: result.error || 'Unknown error',
        data: result
      };
    }

  } catch (error) {
    console.error('Pocket Pay payment processing error:', error);
    
    return {
      success: false,
      message: 'Payment processing failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

// Verify callback hash from Pocket Pay
export function verifyCallbackHash(callbackData: any): boolean {
  try {
    const receivedHash = callbackData.hash;
    const expectedHash = generateHash(callbackData, POCKET_PAY_CONFIG.TEST_SALT, POCKET_PAY_CONFIG.TEST_SECRET_KEY);
    
    return receivedHash === expectedHash;
  } catch (error) {
    console.error('Hash verification error:', error);
    return false;
  }
}

// Handle payment status updates from Pocket Pay
export function handlePaymentCallback(callbackData: any) {
  // Verify the callback is legitimate
  if (!verifyCallbackHash(callbackData)) {
    console.error('Invalid callback hash');
    return { success: false, message: 'Invalid callback' };
  }

  // Log the callback
  console.log('Payment callback received:', {
    transaction_id: callbackData.transaction_id,
    status: callbackData.status,
    amount: callbackData.amount
  });

  // Process the callback based on status
  switch (callbackData.status) {
    case 'success':
    case 'approved':
      // Payment successful - update database, send confirmation email, etc.
      return { success: true, status: 'completed' };
      
    case 'failed':
    case 'declined':
      // Payment failed - update database, notify customer, etc.
      return { success: false, status: 'failed' };
      
    case 'pending':
      // Payment pending - update database status
      return { success: true, status: 'pending' };
      
    default:
      console.error('Unknown payment status:', callbackData.status);
      return { success: false, status: 'unknown' };
  }
}
