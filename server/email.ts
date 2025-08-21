import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.log('SENDGRID_API_KEY not provided - email notifications disabled');
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface PaymentConfirmationData {
  customerEmail: string;
  transactionId: string;
  orderId: string;
  service: string;
  amount: number;
  branch: string;
  customerName?: string;
}

export async function sendPaymentConfirmation(data: PaymentConfirmationData): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured - skipping email');
    return false;
  }

  try {
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6C5CE7, #FFA500); color: white; padding: 30px 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 30px 20px; border-radius: 0 0 10px 10px; }
            .details-box { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #6C5CE7; }
            .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #eee; }
            .detail-row:last-child { border-bottom: none; }
            .label { font-weight: bold; color: #666; }
            .value { color: #333; }
            .amount { color: #28a745; font-weight: bold; font-size: 18px; }
            .steps { background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .steps ul { margin: 0; padding-left: 20px; }
            .steps li { margin: 8px 0; }
            .footer { text-align: center; color: #666; font-size: 14px; margin-top: 30px; }
            .logo { font-size: 24px; font-weight: bold; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="logo">🚗 Cuci Xpress</div>
                <h1>Payment Confirmed!</h1>
                <p>Thank you for being Xpress!</p>
            </div>
            
            <div class="content">
                <h2>Your booking has been confirmed</h2>
                
                <div class="details-box">
                    <h3 style="margin-top: 0; color: #6C5CE7;">Order Details</h3>
                    <div class="detail-row">
                        <span class="label">Transaction ID:</span>
                        <span class="value">${data.transactionId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Order ID:</span>
                        <span class="value">${data.orderId}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Service:</span>
                        <span class="value">${data.service}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Branch:</span>
                        <span class="value">${data.branch}</span>
                    </div>
                    <div class="detail-row">
                        <span class="label">Amount:</span>
                        <span class="value amount">BND ${data.amount}</span>
                    </div>
                </div>
                
                <div class="steps">
                    <h3 style="margin-top: 0; color: #1976d2;">What's Next?</h3>
                    <ul>
                        <li><strong>Drive to ${data.branch} branch</strong> - Operating hours: Daily 8:00 AM - 7:00 PM</li>
                        <li><strong>Show this email</strong> or mention your transaction ID at the service counter</li>
                        <li><strong>Enjoy your premium car wash service!</strong></li>
                    </ul>
                </div>
                
                <div style="background: white; padding: 20px; border-radius: 8px; text-align: center;">
                    <p><strong>Need help?</strong></p>
                    <p>Call us at <a href="tel:+6738387000" style="color: #6C5CE7;">+673 838 7000</a></p>
                    <p>Visit our website: <a href="https://cucixpress.com" style="color: #6C5CE7;">cucixpress.com</a></p>
                </div>
            </div>
            
            <div class="footer">
                <p>This is an automated message from Cuci Xpress.<br>
                Over 100,000 cars cleaned • BND 1M+ revenue • 4 branches</p>
            </div>
        </div>
    </body>
    </html>
    `;

    const emailText = `
    CUCI XPRESS - Payment Confirmation
    
    Thank you for being Xpress! Your car wash service has been confirmed.
    
    ORDER DETAILS:
    Transaction ID: ${data.transactionId}
    Order ID: ${data.orderId}
    Service: ${data.service}
    Branch: ${data.branch}
    Amount: BND ${data.amount}
    
    WHAT'S NEXT:
    1. Drive to ${data.branch} branch (Daily 8:00 AM - 7:00 PM)
    2. Show this email or mention your transaction ID at the service counter
    3. Enjoy your premium car wash service!
    
    Need help? Call +673 838 7000 or visit cucixpress.com
    
    ---
    This is an automated message from Cuci Xpress.
    Over 100,000 cars cleaned • BND 1M+ revenue • 4 branches
    `;

    await mailService.send({
      to: data.customerEmail,
      from: {
        email: 'noreply@cucixpress.com',
        name: 'Cuci Xpress'
      },
      subject: `Payment Confirmed - ${data.service} at ${data.branch}`,
      text: emailText,
      html: emailHtml,
    });

    console.log(`Payment confirmation email sent to ${data.customerEmail}`);
    return true;
    
  } catch (error) {
    console.error('SendGrid email error:', error);
    return false;
  }
}

export async function sendCollaborationEmail(data: any): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log('SendGrid not configured - skipping email');
    return false;
  }

  try {
    const emailHtml = `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: linear-gradient(135deg, #6C5CE7, #FFA500); color: white; padding: 20px; text-align: center; border-radius: 10px 10px 0 0; }
            .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 10px 10px; }
            .details { background: white; border-radius: 8px; padding: 20px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🚗 New Collaboration Inquiry</h1>
                <p>Cuci Xpress Partnership Opportunity</p>
            </div>
            
            <div class="content">
                <div class="details">
                    <h3>Contact Details:</h3>
                    <p><strong>Name:</strong> ${data.name}</p>
                    <p><strong>Email:</strong> ${data.email}</p>
                    <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
                    <p><strong>Business Type:</strong> ${data.businessType || 'Not specified'}</p>
                    
                    <h3>Message:</h3>
                    <p>${data.message || 'No additional message provided'}</p>
                    
                    <h3>Submission Details:</h3>
                    <p><strong>Date:</strong> ${data.submittedAt}</p>
                </div>
            </div>
        </div>
    </body>
    </html>
    `;

    await mailService.send({
      to: 'cucixpress.bn@gmail.com',
      from: {
        email: 'noreply@cucixpress.com',
        name: 'Cuci Xpress Website'
      },
      subject: `New Collaboration Inquiry from ${data.name}`,
      html: emailHtml,
      replyTo: data.email
    });

    console.log('Collaboration email sent to cucixpress.bn@gmail.com');
    return true;
    
  } catch (error) {
    console.error('SendGrid collaboration email error:', error);
    return false;
  }
}