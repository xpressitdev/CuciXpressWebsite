import { Request, Response } from 'express';

// KedaiPOS Integration Module
// This module handles integration with KedaiPOS system

interface KedaiPOSOrder {
  external_id: string;
  customer_info: {
    car_plate: string;
    phone: string;
  };
  service: {
    name: string;
    code: string;
    price: number;
    duration: number;
  };
  payment: {
    status: 'PAID' | 'PENDING' | 'FAILED';
    method: 'ONLINE';
    transaction_id: string;
    amount: number;
    timestamp: string;
  };
  branch: {
    name: string;
    code: string;
  };
  queue_status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
  created_at: string;
}

interface KedaiPOSWebhookPayload {
  action: 'order_created' | 'order_updated' | 'payment_verified';
  order_id: string;
  data: KedaiPOSOrder;
  signature: string;
  timestamp: string;
}

export class KedaiPOSIntegration {
  private apiKey: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor(apiKey?: string, baseUrl?: string, webhookSecret?: string) {
    this.apiKey = apiKey || process.env.KEDAIPOS_API_KEY || '';
    this.baseUrl = baseUrl || process.env.KEDAIPOS_BASE_URL || '';
    this.webhookSecret = webhookSecret || process.env.KEDAIPOS_WEBHOOK_SECRET || '';
  }

  // Send new order to KedaiPOS
  async createOrder(orderData: {
    transaction_id: string;
    car_plate: string;
    phone: string;
    service: string;
    amount: number;
    branch: string;
  }): Promise<{ success: boolean; kedai_order_id?: string; error?: string }> {
    try {
      if (!this.apiKey || !this.baseUrl) {
        console.log('KedaiPOS API not configured - order creation skipped');
        return { success: false, error: 'API not configured' };
      }

      const kedaiOrder: KedaiPOSOrder = {
        external_id: orderData.transaction_id,
        customer_info: {
          car_plate: orderData.car_plate,
          phone: orderData.phone
        },
        service: {
          name: orderData.service,
          code: orderData.service === 'Full Package' ? 'FP' : 'BW',
          price: orderData.amount,
          duration: orderData.service === 'Full Package' ? 12 : 8
        },
        payment: {
          status: 'PAID',
          method: 'ONLINE',
          transaction_id: orderData.transaction_id,
          amount: orderData.amount,
          timestamp: new Date().toISOString()
        },
        branch: {
          name: orderData.branch,
          code: this.getBranchCode(orderData.branch)
        },
        queue_status: 'WAITING',
        created_at: new Date().toISOString()
      };

      const response = await fetch(`${this.baseUrl}/api/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'CuciXpress-Integration/1.0'
        },
        body: JSON.stringify(kedaiOrder)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Order created in KedaiPOS:', result);
        return { success: true, kedai_order_id: result.id };
      } else {
        const error = await response.text();
        console.error('KedaiPOS API error:', error);
        return { success: false, error: `API Error: ${response.status}` };
      }

    } catch (error) {
      console.error('KedaiPOS integration error:', error);
      return { success: false, error: 'Network error' };
    }
  }

  // Update order status in KedaiPOS
  async updateOrderStatus(transactionId: string, status: 'WAITING' | 'IN_PROGRESS' | 'COMPLETED'): Promise<boolean> {
    try {
      if (!this.apiKey || !this.baseUrl) return false;

      const response = await fetch(`${this.baseUrl}/api/orders/${transactionId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({ queue_status: status })
      });

      return response.ok;
    } catch (error) {
      console.error('Error updating KedaiPOS order status:', error);
      return false;
    }
  }

  // Verify webhook signature
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.webhookSecret) return true; // Skip verification if no secret

    const crypto = require('crypto');
    const expectedSignature = crypto
      .createHmac('sha256', this.webhookSecret)
      .update(payload)
      .digest('hex');

    return `sha256=${expectedSignature}` === signature;
  }

  // Get branch code for KedaiPOS
  private getBranchCode(branchName: string): string {
    const branchMap: { [key: string]: string } = {
      'Tungku Link': 'TL',
      'Salar': 'SL', 
      'Bengkurong': 'BK',
      'Tutong': 'TT'
    };
    
    return branchMap[branchName] || 'UK'; // UK = Unknown
  }

  // Get service details for KedaiPOS
  getServiceDetails(serviceName: string) {
    const services: { [key: string]: { code: string; duration: number } } = {
      'Basic Wash': { code: 'BW', duration: 8 },
      'Full Package': { code: 'FP', duration: 12 }
    };
    
    return services[serviceName] || { code: 'BW', duration: 8 };
  }
}

// Export singleton instance
export const kedaiPOSIntegration = new KedaiPOSIntegration();