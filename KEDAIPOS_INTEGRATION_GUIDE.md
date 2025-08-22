# KedaiPOS Integration Guide for Cuci Xpress

This document explains how to integrate your Cuci Xpress website with your KedaiPOS system.

## 🔧 What's Already Built

Your website now includes comprehensive POS integration features:

### ✅ Automated Order Creation
- When customers complete online payments, orders are automatically sent to KedaiPOS
- Includes customer info (car plate, phone), service details, and payment confirmation
- Non-blocking integration - website works even if POS is offline

### ✅ QR Code System
- Customers receive QR codes containing all order information
- Staff can scan QR codes to verify payments and get customer details
- QR codes include service codes (BW = Basic Wash, FP = Full Package)

### ✅ API Endpoints for KedaiPOS
- `/api/kedaipos-webhook` - Receives updates from your POS system
- `/api/kedaipos/order/:transaction_id/status` - Check order status
- `/api/kedaipos/queue/:transaction_id` - Update queue status
- `/api/add-to-queue` - Manually add customers to queue
- `/api/pos/pending-orders` - Get list of paid customers waiting for service

## 🔗 Setup Instructions

### Step 1: Get Your KedaiPOS API Details
From your KedaiPOS system, you need:
1. **API Key** - For authentication
2. **Base URL** - Your POS system's API endpoint
3. **Webhook Secret** - For secure webhook verification (optional)

### Step 2: Configure Environment Variables
Add these to your environment variables:

```env
KEDAIPOS_API_KEY=your_api_key_here
KEDAIPOS_BASE_URL=https://your-pos-system.com/api
KEDAIPOS_WEBHOOK_SECRET=your_webhook_secret
```

### Step 3: Test the Integration
1. Make a test payment on your website
2. Check your KedaiPOS system for the new order
3. Scan the QR code from the payment receipt

## 📡 How It Works

### Customer Places Order:
1. Customer selects service and enters car plate/phone
2. Payment processed through Pocket Pay
3. **Automatically** → Order sent to KedaiPOS with all details
4. Customer receives QR code receipt

### At Your Shop:
1. Staff can see new paid orders in KedaiPOS
2. Staff scans customer's QR code to verify payment
3. Customer gets their car wash service
4. Status updates sync between systems

### Data Flow:
```
Customer Payment → Pocket Pay → Your Website → KedaiPOS → Queue Management
                ↓
            QR Code Receipt (for verification)
```

## 🛠️ Staff Training Points

### For Staff Using KedaiPOS:
1. **New Orders**: Paid online customers appear automatically in your queue
2. **QR Scanning**: Scan customer QR codes to verify payments instantly
3. **Customer Info**: All customer details (car plate, phone, service) are included
4. **Service Codes**: 
   - **BW** = Basic Wash (BND 8)
   - **FP** = Full Package (BND 12)

### For Managers:
1. **Dashboard**: View all pending online orders at `/api/pos/pending-orders`
2. **Status Updates**: KedaiPOS can send updates back to website
3. **Reporting**: All online and in-store transactions in one system

## 🔍 Troubleshooting

### If Orders Don't Appear in KedaiPOS:
1. Check environment variables are set correctly
2. Verify KedaiPOS API credentials
3. Check server logs for integration errors
4. Orders still work with QR code verification as backup

### If QR Codes Don't Scan:
1. Ensure customer shows the QR code clearly
2. Use `/verify/:transaction_id` endpoint manually
3. Check customer details against payment records

### For Technical Support:
- All transactions are logged with detailed information
- Integration is non-blocking - website works independently
- Multiple verification methods ensure no lost orders

## 📈 Benefits

✅ **Streamlined Operations**: Online orders flow directly to your POS  
✅ **No Data Entry**: Staff don't need to manually enter customer info  
✅ **Payment Verification**: QR codes confirm legitimate customers  
✅ **Real-time Updates**: Status changes sync between systems  
✅ **Backup Methods**: Multiple ways to verify customers  
✅ **Complete Integration**: One system for all transactions  

## 📞 Next Steps

1. **Contact KedaiPOS Support** for your API credentials
2. **Configure the environment variables** in your deployment
3. **Test with a small payment** to verify integration
4. **Train staff** on new QR code verification process
5. **Monitor logs** during first few days for any issues

The integration is designed to be robust and fail-safe - your business operations continue normally even during any technical issues.