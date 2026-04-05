import nodemailer from 'nodemailer';

const GMAIL_USER = 'cucixpress.bn@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;

if (!GMAIL_APP_PASSWORD) {
  console.log('GMAIL_APP_PASSWORD not set - email notifications disabled');
}

function createTransporter() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: GMAIL_USER,
      pass: GMAIL_APP_PASSWORD,
    },
  });
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
  if (!GMAIL_APP_PASSWORD) {
    console.log('Gmail not configured - skipping payment confirmation email');
    return false;
  }

  const branchNames: Record<string, string> = {
    tungku: 'Tungku Link',
    salar: 'Salar',
    bengkurong: 'Bengkurong',
    tutong: 'Tutong',
  };
  const branchDisplay = branchNames[data.branch] || data.branch;

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; background: #f4f4f4; }
      .wrapper { max-width: 600px; margin: 30px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.1); }
      .header { background: linear-gradient(135deg, #6C5CE7, #FFA500); color: white; padding: 35px 30px; text-align: center; }
      .header .logo { font-size: 28px; font-weight: bold; margin-bottom: 8px; }
      .header h1 { margin: 0; font-size: 22px; font-weight: 500; }
      .check { font-size: 48px; margin-bottom: 10px; }
      .body { padding: 30px; }
      .greeting { font-size: 16px; color: #555; margin-bottom: 20px; }
      .detail-card { background: #f8f7ff; border-left: 4px solid #6C5CE7; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .detail-card h3 { margin: 0 0 15px; color: #6C5CE7; font-size: 16px; text-transform: uppercase; letter-spacing: 0.5px; }
      .detail-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #ede9ff; font-size: 14px; }
      .detail-row:last-child { border-bottom: none; }
      .detail-label { color: #777; }
      .detail-value { font-weight: 600; color: #333; }
      .amount-value { color: #28a745; font-size: 18px; font-weight: bold; }
      .next-steps { background: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; }
      .next-steps h3 { margin: 0 0 12px; color: #1976d2; font-size: 15px; }
      .step { display: flex; align-items: flex-start; margin: 10px 0; font-size: 14px; color: #444; }
      .step-num { background: #6C5CE7; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; flex-shrink: 0; margin-right: 10px; margin-top: 1px; }
      .footer { background: #fafafa; text-align: center; padding: 20px 30px; color: #999; font-size: 13px; border-top: 1px solid #eee; }
      .footer a { color: #6C5CE7; text-decoration: none; }
      .contact { text-align: center; padding: 15px; background: #fff; border: 1px solid #eee; border-radius: 8px; margin: 20px 0; }
      .contact a { color: #6C5CE7; font-weight: bold; text-decoration: none; }
    </style>
  </head>
  <body>
    <div class="wrapper">
      <div class="header">
        <div class="check">✅</div>
        <div class="logo">🚗 Cuci Xpress</div>
        <h1>Payment Confirmed!</h1>
      </div>
      <div class="body">
        <p class="greeting">Hi${data.customerName ? ` ${data.customerName}` : ''},<br>Thank you for choosing Cuci Xpress! Your payment has been received and your car wash service is confirmed.</p>

        <div class="detail-card">
          <h3>Order Details</h3>
          <div class="detail-row">
            <span class="detail-label">Transaction ID</span>
            <span class="detail-value">${data.transactionId}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Order ID</span>
            <span class="detail-value">${data.orderId}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Service</span>
            <span class="detail-value">${data.service}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Branch</span>
            <span class="detail-value">${branchDisplay}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Amount Paid</span>
            <span class="detail-value amount-value">BND ${data.amount}</span>
          </div>
        </div>

        <div class="next-steps">
          <h3>📍 What to Do Next</h3>
          <div class="step"><div class="step-num">1</div>Drive to <strong>${branchDisplay} branch</strong> (Daily: 8:00 AM – 7:00 PM)</div>
          <div class="step"><div class="step-num">2</div>Show your <strong>QR receipt</strong> (from the website) or quote your Transaction ID to our staff</div>
          <div class="step"><div class="step-num">3</div>Sit back and enjoy your premium Cuci Xpress car wash!</div>
        </div>

        <div class="contact">
          <p style="margin:0 0 8px;">Need help? We're here for you.</p>
          <a href="tel:+6738387000">📞 +673 838 7000</a> &nbsp;|&nbsp;
          <a href="https://cucixpress.com">🌐 cucixpress.com</a>
        </div>
      </div>
      <div class="footer">
        <p>This is an automated receipt from Cuci Xpress.<br>
        120,000+ cars cleaned &bull; BND 1M+ revenue &bull; 6 branches across Brunei</p>
      </div>
    </div>
  </body>
  </html>
  `;

  const emailText = `
CUCI XPRESS - Payment Confirmation

Hi${data.customerName ? ` ${data.customerName}` : ''},
Thank you for choosing Cuci Xpress! Your payment has been received.

ORDER DETAILS:
Transaction ID: ${data.transactionId}
Order ID:       ${data.orderId}
Service:        ${data.service}
Branch:         ${branchDisplay}
Amount Paid:    BND ${data.amount}

WHAT TO DO NEXT:
1. Drive to ${branchDisplay} branch (Daily: 8:00 AM - 7:00 PM)
2. Show your QR receipt or quote your Transaction ID to our staff
3. Enjoy your premium car wash!

Need help? Call +673 838 7000 or visit cucixpress.com

---
Cuci Xpress | 120,000+ cars cleaned | BND 1M+ revenue | 6 branches
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Cuci Xpress" <${GMAIL_USER}>`,
      to: data.customerEmail,
      subject: `Payment Confirmed ✅ – ${data.service} at ${branchDisplay}`,
      text: emailText,
      html: emailHtml,
    });

    console.log(`Payment confirmation email sent to ${data.customerEmail}`);
    return true;
  } catch (error) {
    console.error('Gmail email error:', error);
    return false;
  }
}

export async function sendCollaborationEmail(data: any): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD) {
    console.log('Gmail not configured - skipping collaboration email');
    return false;
  }

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <body style="font-family:Arial,sans-serif;color:#333;background:#f4f4f4;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#6C5CE7,#FFA500);color:white;padding:25px 30px;text-align:center;">
        <h1 style="margin:0;">🚗 New Collaboration Inquiry</h1>
        <p style="margin:5px 0 0;">Cuci Xpress Partnership Opportunity</p>
      </div>
      <div style="padding:30px;">
        <p><strong>Name:</strong> ${data.name}</p>
        <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
        <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
        <p><strong>Business Type:</strong> ${data.businessType || 'Not specified'}</p>
        <p><strong>Message:</strong></p>
        <blockquote style="background:#f8f7ff;border-left:4px solid #6C5CE7;padding:15px;border-radius:4px;">${data.message || 'No message provided'}</blockquote>
        <p style="color:#999;font-size:13px;">Submitted: ${data.submittedAt}</p>
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Cuci Xpress Website" <${GMAIL_USER}>`,
      to: GMAIL_USER,
      replyTo: data.email,
      subject: `New Collaboration Inquiry from ${data.name}`,
      html: emailHtml,
    });
    console.log('Collaboration email sent');
    return true;
  } catch (error) {
    console.error('Gmail collaboration email error:', error);
    return false;
  }
}

interface SubscriptionNotificationData {
  email: string;
  submittedAt: string;
}

export async function sendSubscriptionNotification(data: SubscriptionNotificationData): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD) {
    console.log('Gmail not configured - skipping subscription email');
    return false;
  }

  const emailHtml = `
  <!DOCTYPE html>
  <html>
  <body style="font-family:Arial,sans-serif;color:#333;background:#f4f4f4;padding:20px;">
    <div style="max-width:600px;margin:0 auto;background:#fff;border-radius:12px;overflow:hidden;">
      <div style="background:linear-gradient(135deg,#6C5CE7,#FFA500);color:white;padding:35px 30px;text-align:center;">
        <div style="font-size:28px;font-weight:bold;">🚗 Cuci Xpress</div>
        <h1 style="margin:10px 0 5px;font-size:22px;">You're on the list!</h1>
        <p style="margin:0;opacity:0.9;">Subscription early access confirmed</p>
      </div>
      <div style="padding:30px;">
        <p>Hi there! You've successfully signed up for <strong>Cuci Xpress subscription early access</strong>.</p>
        <p>We'll notify you as soon as our subscription plans launch with:</p>
        <ul>
          <li>Unlimited car washes</li>
          <li>Priority service at all branches</li>
          <li>Family and corporate plans</li>
          <li>Exclusive member pricing</li>
        </ul>
        <p>In the meantime, visit any of our 6 branches for immediate service!</p>
        <p style="text-align:center;margin-top:25px;">
          <a href="tel:+6738387000" style="color:#6C5CE7;font-weight:bold;">📞 +673 838 7000</a> &nbsp;|&nbsp;
          <a href="https://cucixpress.com" style="color:#6C5CE7;font-weight:bold;">🌐 cucixpress.com</a>
        </p>
      </div>
    </div>
  </body>
  </html>
  `;

  try {
    const transporter = createTransporter();
    await transporter.sendMail({
      from: `"Cuci Xpress" <${GMAIL_USER}>`,
      to: data.email,
      subject: 'Welcome to Cuci Xpress – You\'re on the subscription list! 🚗',
      html: emailHtml,
    });
    console.log(`Subscription notification sent to ${data.email}`);
    return true;
  } catch (error) {
    console.error('Gmail subscription email error:', error);
    return false;
  }
}
