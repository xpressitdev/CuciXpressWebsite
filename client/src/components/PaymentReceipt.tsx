import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { QrCode, Download, Printer, Car, Clock, MapPin, CreditCard, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import QRCodeLib from "qrcode";

interface OrderDetails {
  transaction_id: string;
  order_id?: string;
  service: string;
  amount: number;
  branch: string;
  car_plate: string;
  phone: string;
  timestamp?: string;
}

interface PaymentReceiptProps {
  orderDetails: OrderDetails;
}

export default function PaymentReceipt({ orderDetails }: PaymentReceiptProps) {
  const [qrCodeUrl, setQrCodeUrl] = useState<string>("");
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    generateQRCode();
  }, [orderDetails]);

  const generateQRCode = async () => {
    try {
      // Create comprehensive QR code data for POS system
      const qrData = {
        type: "CUCI_XPRESS_PAYMENT",
        transaction_id: orderDetails.transaction_id,
        order_id: orderDetails.order_id || orderDetails.transaction_id,
        service: orderDetails.service,
        amount: orderDetails.amount,
        branch: orderDetails.branch,
        car_plate: orderDetails.car_plate,
        phone: orderDetails.phone,
        timestamp: new Date().toISOString(),
        verify_url: `https://cucixpress.com/verify/${orderDetails.transaction_id}`,
        status: "PAID"
      };

      // Generate QR code with high error correction for scanning reliability
      const qrCodeDataUrl = await QRCodeLib.toDataURL(JSON.stringify(qrData), {
        errorCorrectionLevel: 'H',
        width: 200,
        margin: 2,
        color: {
          dark: '#6C5CE7',  // Purple brand color
          light: '#FFFFFF'
        }
      });
      
      setQrCodeUrl(qrCodeDataUrl);
    } catch (error) {
      console.error('Error generating QR code:', error);
    }
  };

  const handlePrintReceipt = () => {
    if (receiptRef.current) {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(`
          <html>
            <head>
              <title>Cuci Xpress Payment Receipt</title>
              <style>
                body { font-family: Arial, sans-serif; margin: 20px; }
                .receipt { max-width: 400px; margin: 0 auto; }
                .header { text-align: center; border-bottom: 2px solid #6C5CE7; padding-bottom: 10px; margin-bottom: 20px; }
                .qr-section { text-align: center; margin: 20px 0; }
                .details { margin: 15px 0; }
                .detail-row { display: flex; justify-content: space-between; margin: 8px 0; }
                .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #666; }
                @media print { body { margin: 0; } }
              </style>
            </head>
            <body>
              ${receiptRef.current.innerHTML}
            </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    }
  };

  const handleDownloadReceipt = () => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 400;
    canvas.height = 600;
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Add receipt content to canvas (simplified version)
    ctx.fillStyle = 'black';
    ctx.font = '16px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Cuci Xpress Payment Receipt', 200, 30);
    
    // Add more content...
    ctx.font = '12px Arial';
    ctx.fillText(`Transaction: ${orderDetails.transaction_id}`, 200, 60);
    ctx.fillText(`Service: ${orderDetails.service}`, 200, 80);
    ctx.fillText(`Amount: BND ${orderDetails.amount}`, 200, 100);
    ctx.fillText(`Branch: ${orderDetails.branch}`, 200, 120);

    // Add QR code if available
    if (qrCodeUrl) {
      const img = new Image();
      img.onload = () => {
        ctx.drawImage(img, 150, 140, 100, 100);
        
        // Download the canvas as image
        canvas.toBlob((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `cuci-xpress-receipt-${orderDetails.transaction_id}.png`;
            a.click();
            URL.revokeObjectURL(url);
          }
        });
      };
      img.src = qrCodeUrl;
    }
  };

  const formatDateTime = (timestamp?: string) => {
    const date = timestamp ? new Date(timestamp) : new Date();
    return date.toLocaleString('en-BN', {
      timeZone: 'Asia/Brunei',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getBranchAddress = (branch: string) => {
    const branches = {
      'tungku': 'Tungku Link Shopping Complex',
      'salar': 'Salar Commercial Area',
      'bengkurong': 'Bengkurong Shopping Complex',
      'tutong': 'Tutong Town Commercial Area'
    };
    return branches[branch.toLowerCase() as keyof typeof branches] || branch;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="max-w-md mx-auto"
    >
      <Card className="border-2 border-cuci-primary bg-white shadow-lg">
        <CardHeader className="bg-gradient-to-r from-purple-600 to-orange-500 text-white text-center">
          <CardTitle className="flex items-center justify-center gap-2">
            <Car className="w-5 h-5" />
            Payment Receipt
          </CardTitle>
          <p className="text-sm opacity-90">Cuci Xpress Car Wash</p>
        </CardHeader>
        
        <CardContent className="p-6" ref={receiptRef}>
          {/* QR Code Section */}
          <div className="text-center mb-6">
            <div className="bg-gray-50 p-4 rounded-lg border-2 border-dashed border-cuci-primary mb-3">
              {qrCodeUrl ? (
                <img 
                  src={qrCodeUrl} 
                  alt="Receipt QR Code"
                  className="w-32 h-32 mx-auto"
                />
              ) : (
                <div className="w-32 h-32 mx-auto flex items-center justify-center bg-gray-200 rounded">
                  <QrCode className="w-8 h-8 text-gray-500" />
                </div>
              )}
            </div>
            <div className="text-center">
              <Badge variant="secondary" className="bg-green-100 text-green-800 border border-green-300">
                <QrCode className="w-3 h-3 mr-1" />
                Show QR to Staff
              </Badge>
              <p className="text-sm text-gray-600 mt-2 font-medium">
                "Scan for wash verification"
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Present this QR code to Cuci Xpress staff at your selected branch for service verification
              </p>
            </div>
          </div>

          {/* Order Details */}
          <div className="space-y-3 border-t pt-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Car Plate</span>
              </div>
              <span className="text-sm font-mono">{orderDetails.car_plate}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Phone</span>
              </div>
              <span className="text-sm">{orderDetails.phone}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Car className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Service</span>
              </div>
              <span className="text-sm">{orderDetails.service}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Amount</span>
              </div>
              <span className="text-sm font-semibold text-cuci-primary">BND {orderDetails.amount}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Branch</span>
              </div>
              <span className="text-sm">{getBranchAddress(orderDetails.branch)}</span>
            </div>
            
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-cuci-primary" />
                <span className="text-sm font-medium">Date & Time</span>
              </div>
              <span className="text-sm">{formatDateTime()}</span>
            </div>
          </div>

          {/* Transaction Details */}
          <div className="bg-gray-50 rounded-lg p-3 mt-4">
            <h4 className="font-medium text-xs text-gray-700 mb-2">Transaction Details</h4>
            <div className="space-y-1">
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Transaction ID:</span>
                <span className="font-mono">{orderDetails.transaction_id}</span>
              </div>
              {orderDetails.order_id && (
                <div className="flex justify-between text-xs">
                  <span className="text-gray-600">Order ID:</span>
                  <span className="font-mono">{orderDetails.order_id}</span>
                </div>
              )}
              <div className="flex justify-between text-xs">
                <span className="text-gray-600">Status:</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">PAID</Badge>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-6">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handlePrintReceipt}
              className="flex-1"
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleDownloadReceipt}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Save
            </Button>
          </div>

          {/* Footer */}
          <div className="text-center mt-6 pt-4 border-t text-xs text-gray-500">
            <p>Thank you for choosing Cuci Xpress!</p>
            <p>Daily: 8:00 AM - 7:00 PM | +673 838 7000</p>
            <p className="mt-2 font-mono text-xs">cucixpress.com</p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}