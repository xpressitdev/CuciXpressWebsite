import { Request, Response } from 'express';
import { kedaiPOSIntegration } from './kedaipos-integration';

// KedaiPOS Webhook Handler
// This handles incoming webhooks from KedaiPOS system

export function handleKedaiPOSWebhook(req: Request, res: Response) {
  try {
    const signature = req.headers['x-kedaipos-signature'] as string;
    const payload = JSON.stringify(req.body);

    // Verify webhook signature
    if (!kedaiPOSIntegration.verifyWebhookSignature(payload, signature)) {
      console.error('Invalid KedaiPOS webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { action, order_id, data } = req.body;

    switch (action) {
      case 'order_updated':
        handleOrderStatusUpdate(data);
        break;
      
      case 'payment_verified':
        handlePaymentVerified(data);
        break;
      
      case 'service_completed':
        handleServiceCompleted(data);
        break;
      
      default:
        console.log('Unknown KedaiPOS webhook action:', action);
    }

    res.json({ success: true, message: 'Webhook processed' });

  } catch (error) {
    console.error('KedaiPOS webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}

function handleOrderStatusUpdate(data: any) {
  console.log('KedaiPOS Order Status Update:', {
    external_id: data.external_id,
    status: data.queue_status,
    updated_at: data.updated_at
  });
  
  // Here you could update your local database, send notifications, etc.
  // For example:
  // - Update order status in your database
  // - Send SMS to customer when service starts/completes
  // - Update analytics/reporting data
}

function handlePaymentVerified(data: any) {
  console.log('KedaiPOS Payment Verified:', {
    external_id: data.external_id,
    amount: data.payment.amount,
    method: data.payment.method
  });
  
  // Handle payment verification
  // This might be useful if you need double-verification
}

function handleServiceCompleted(data: any) {
  console.log('KedaiPOS Service Completed:', {
    external_id: data.external_id,
    customer: data.customer_info.car_plate,
    completed_at: data.completed_at
  });
  
  // Handle service completion
  // - Send completion SMS/email to customer
  // - Update customer history
  // - Generate loyalty points, etc.
}

// Endpoint for KedaiPOS to check order status
export function getOrderStatus(req: Request, res: Response) {
  const { transaction_id } = req.params;
  
  // In a real implementation, you'd query your database
  // For now, return basic status
  res.json({
    transaction_id,
    status: 'PAID',
    service_status: 'WAITING',
    estimated_completion: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes from now
  });
}

// Endpoint for updating queue status from KedaiPOS
export function updateQueueStatus(req: Request, res: Response) {
  const { transaction_id } = req.params;
  const { status } = req.body;
  
  console.log(`Queue status update: ${transaction_id} -> ${status}`);
  
  // Here you would:
  // 1. Update status in your database
  // 2. Send customer notifications if needed
  // 3. Update any real-time displays
  
  res.json({
    success: true,
    message: `Status updated to ${status}`,
    timestamp: new Date().toISOString()
  });
}