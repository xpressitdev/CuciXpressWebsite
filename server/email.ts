import nodemailer from 'nodemailer';
import sgMail from '@sendgrid/mail';
import QRCode from 'qrcode';

const GMAIL_USER = 'cucixpress.bn@gmail.com';
const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY;

// "From" identity for all outbound mail. For best inbox delivery this must be an
// address on a SendGrid domain-authenticated domain (e.g. noreply@cucixpress.com).
// Override with the MAIL_FROM env var if you authenticate a different address.
const MAIL_FROM = process.env.MAIL_FROM || 'noreply@cucixpress.com';
const MAIL_FROM_NAME = 'Cuci Xpress';

if (SENDGRID_API_KEY) {
  sgMail.setApiKey(SENDGRID_API_KEY);
} else {
  console.log('SENDGRID_API_KEY not set - SendGrid disabled, will use Gmail fallback');
}
if (!GMAIL_APP_PASSWORD) {
  console.log('GMAIL_APP_PASSWORD not set - Gmail fallback disabled');
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

/**
 * Single outbound-mail path for the whole app. Prefers SendGrid (a
 * transactional provider with domain authentication delivers reliably to the
 * inbox), and falls back to Gmail SMTP so mail keeps flowing if SendGrid is not
 * usable yet (e.g. before the cucixpress.com domain is authenticated). Returns
 * true if any provider accepted the message.
 */
async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; cid: string; contentType?: string }>;
}): Promise<boolean> {
  // 1. Preferred: SendGrid.
  if (SENDGRID_API_KEY) {
    try {
      await sgMail.send({
        to: opts.to,
        from: { email: MAIL_FROM, name: MAIL_FROM_NAME },
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.attachments
          ? {
              attachments: opts.attachments.map((a) => ({
                content: a.content.toString('base64'),
                filename: a.filename,
                type: a.contentType ?? 'application/octet-stream',
                disposition: 'inline',
                contentId: a.cid,
              })),
            }
          : {}),
      });
      return true;
    } catch (err: any) {
      // Common reason before DNS setup: the domain/sender isn't verified yet.
      // Log the SendGrid error detail and fall through to Gmail.
      console.error(
        '[email] SendGrid send failed, falling back to Gmail:',
        err?.response?.body?.errors ?? err?.message ?? err
      );
    }
  }

  // 2. Fallback: Gmail SMTP (legacy path).
  if (GMAIL_APP_PASSWORD) {
    try {
      const transporter = createTransporter();
      await transporter.sendMail({
        from: `"${MAIL_FROM_NAME}" <${GMAIL_USER}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
        ...(opts.text ? { text: opts.text } : {}),
        ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
        ...(opts.attachments
          ? {
              attachments: opts.attachments.map((a) => ({
                filename: a.filename,
                content: a.content,
                cid: a.cid,
                contentType: a.contentType,
              })),
            }
          : {}),
      });
      return true;
    } catch (err) {
      console.error('[email] Gmail send failed:', err);
      return false;
    }
  }

  console.log('[email] no email provider configured — email not sent');
  return false;
}

export interface InteriorRefreshReminderData {
  customerEmail: string;
  customerName?: string | null;
  branchName: string;
  vehicle: string;
  slotStart: Date;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]!);
}

export function buildInteriorRefreshReminderEmail(data: InteriorRefreshReminderData) {
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Brunei",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(data.slotStart);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Brunei",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(data.slotStart);
  const greeting = data.customerName ? `Hi ${data.customerName},` : "Hi,";
  const safeGreeting = escapeHtml(greeting);
  const safeBranch = escapeHtml(data.branchName);
  const safeVehicle = escapeHtml(data.vehicle);
  const subject = `Reminder: Interior Refresh at Tungku on ${date}`;
  const text = `${greeting}\n\nYour complimentary Interior Refresh appointment is tomorrow.\n\nLocation: ${data.branchName} (Tungku)\nVehicle: ${data.vehicle}\nDate: ${date}\nTime: ${time} (Brunei time)\n\nIf you cannot attend, please cancel from your Cuci Xpress dashboard so another subscriber can use the slot.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#1f2937;max-width:600px">
      <p>${safeGreeting}</p>
      <p>Your complimentary <strong>Interior Refresh</strong> appointment is tomorrow.</p>
      <div style="background:#faf5ff;border:1px solid #e9d5ff;border-radius:12px;padding:16px">
        <p style="margin:0"><strong>Location:</strong> ${safeBranch} (Tungku)</p>
        <p style="margin:6px 0 0"><strong>Vehicle:</strong> ${safeVehicle}</p>
        <p style="margin:6px 0 0"><strong>Date:</strong> ${date}</p>
        <p style="margin:6px 0 0"><strong>Time:</strong> ${time} (Brunei time)</p>
      </div>
      <p>If you cannot attend, please cancel from your Cuci Xpress dashboard so another subscriber can use the slot.</p>
    </div>`;
  return { subject, text, html };
}

export async function sendInteriorRefreshReminder(
  data: InteriorRefreshReminderData,
): Promise<boolean> {
  const message = buildInteriorRefreshReminderEmail(data);
  return sendEmail({ to: data.customerEmail, ...message });
}

interface PaymentConfirmationData {
  customerEmail: string;
  transactionId: string;
  orderId: string;
  service: string;
  amount: number;
  branch: string;
  customerName?: string;
  // Web checkout: the buyer hasn't picked a branch yet (the lane stamps it at
  // scan-in), so the receipt is branch-agnostic and embeds a scannable QR.
  isOnline?: boolean;
}

export async function sendPaymentConfirmation(data: PaymentConfirmationData): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD && !SENDGRID_API_KEY) {
    console.log('No email provider configured - skipping payment confirmation email');
    return false;
  }

  const branchNames: Record<string, string> = {
    tungku: 'Tungku Link',
    salar: 'Salar',
    bengkurong: 'Bengkurong',
    tutong: 'Tutong',
  };
  const branchDisplay = branchNames[data.branch] || data.branch;
  const branchLabel = data.isOnline ? 'Any Cuci Xpress branch' : branchDisplay;

  // Generate a scannable QR that our lane / POS reads at scan-in. Same payload
  // the website success page renders. Non-fatal: if it fails we still send the
  // receipt (with the Order ID) so staff can look it up manually.
  let qrAttachment: { filename: string; content: Buffer; cid: string; contentType: string } | undefined;
  try {
    const qrBuf = await QRCode.toBuffer(
      JSON.stringify({ type: 'CUCI_XPRESS_PAYMENT', order_id: data.orderId }),
      { errorCorrectionLevel: 'M', width: 300, margin: 2, color: { dark: '#000000', light: '#FFFFFF' } }
    );
    qrAttachment = { filename: 'cuci-xpress-qr.png', content: qrBuf, cid: 'wash-qr', contentType: 'image/png' };
  } catch (qrErr) {
    console.error('[email] QR generation failed — sending receipt without embedded QR:', qrErr);
  }

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
            <span class="detail-value">${data.isOnline ? 'Any branch (chosen at your wash)' : branchDisplay}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">Amount Paid</span>
            <span class="detail-value amount-value">BND ${data.amount}</span>
          </div>
        </div>
${qrAttachment ? `
        <div style="text-align:center; margin: 24px 0;">
          <p style="font-size:14px; color:#555; margin:0 0 12px;">Show this QR code to our staff at the branch:</p>
          <img src="cid:wash-qr" alt="Cuci Xpress wash QR code" width="220" height="220" style="border:1px solid #eee; border-radius:12px; padding:8px; background:#fff;" />
          <p style="font-size:12px; color:#999; margin:8px 0 0;">Order ID: ${data.orderId}</p>
        </div>` : ''}

        <div class="next-steps">
          <h3>📍 What to Do Next</h3>
          <div class="step"><div class="step-num">1</div>${data.isOnline ? 'Drive to <strong>any Cuci Xpress branch</strong> — Tungku Link, Salar, Bengkurong or Tutong' : `Drive to <strong>${branchDisplay} branch</strong>`} (Daily: 8:00 AM – 7:00 PM)</div>
          <div class="step"><div class="step-num">2</div>Show the <strong>QR code in this email</strong> (or quote your Order ID) to our staff</div>
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
        120,000+ cars cleaned &bull; BND 1M+ revenue &bull; 5 branches across Brunei</p>
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
Branch:         ${data.isOnline ? 'Any branch (chosen at your wash)' : branchDisplay}
Amount Paid:    BND ${data.amount}

WHAT TO DO NEXT:
1. Drive to ${data.isOnline ? 'any Cuci Xpress branch' : `${branchDisplay} branch`} (Daily: 8:00 AM - 7:00 PM)
2. Show the QR code in this email (or quote your Order ID) to our staff
3. Enjoy your premium car wash!

Need help? Call +673 838 7000 or visit cucixpress.com

---
Cuci Xpress | 120,000+ cars cleaned | BND 1M+ revenue | 5 branches
  `;

  const ok = await sendEmail({
    to: data.customerEmail,
    subject: `Payment Confirmed ✅ – ${data.service}${data.isOnline ? '' : ` at ${branchDisplay}`}`,
    text: emailText,
    html: emailHtml,
    ...(qrAttachment ? { attachments: [qrAttachment] } : {}),
  });
  if (ok) console.log(`Payment confirmation email sent to ${data.customerEmail}`);
  return ok;
}

export async function sendCollaborationEmail(data: any): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD && !SENDGRID_API_KEY) {
    console.log('No email provider configured - skipping collaboration email');
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

  const ok = await sendEmail({
    to: GMAIL_USER,
    replyTo: data.email,
    subject: `New Collaboration Inquiry from ${data.name}`,
    html: emailHtml,
  });
  if (ok) console.log('Collaboration email sent');
  return ok;
}

// ============================================================
// OTP code email — sent when a customer is registering or signing in.
// Branded, single-purpose, no marketing fluff.
// ============================================================
export async function sendOtpEmail(args: {
  to: string;
  code: string;
  ttlMinutes: number;
  purpose: 'register' | 'signin' | 'profile';
}): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD && !SENDGRID_API_KEY) {
    console.log(`[email] no email provider configured — would have sent OTP to ${args.to}`);
    return false;
  }

  const heading =
    args.purpose === 'register'
      ? 'Confirm your email'
      : args.purpose === 'profile'
        ? 'Confirm your profile changes'
        : 'Your sign-in code';
  const blurb =
    args.purpose === 'register'
      ? 'Use the code below to finish creating your Cuci Xpress account.'
      : args.purpose === 'profile'
        ? 'Use the code below to confirm the changes to your Cuci Xpress profile. If you didn\'t make this change, ignore this email and your details stay the same.'
        : 'Use the code below to sign in to your Cuci Xpress account.';

  const html = `
  <!DOCTYPE html>
  <html><head><meta charset="utf-8"></head>
  <body style="font-family:Arial,sans-serif;background:#f4f4f4;margin:0;padding:0;color:#333;">
    <div style="max-width:480px;margin:30px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.08);">
      <div style="background:linear-gradient(135deg,#6C5CE7,#FFA500);color:white;padding:28px 24px;text-align:center;">
        <div style="font-size:24px;font-weight:bold;letter-spacing:0.3px;">🚗 Cuci Xpress</div>
        <h1 style="margin:8px 0 0;font-size:18px;font-weight:500;">${heading}</h1>
      </div>
      <div style="padding:28px 24px;">
        <p style="margin:0 0 16px;font-size:14px;color:#555;">${blurb}</p>
        <div style="background:#f8f7ff;border:2px dashed #6C5CE7;border-radius:10px;padding:18px;text-align:center;margin:18px 0;">
          <div style="font-family:'Courier New',monospace;font-size:36px;font-weight:bold;letter-spacing:0.5em;color:#6C5CE7;padding-left:0.5em;">${args.code}</div>
        </div>
        <p style="font-size:13px;color:#777;margin:12px 0 0;text-align:center;">
          This code expires in <strong>${args.ttlMinutes} minutes</strong>.<br>
          If you didn't request this, you can safely ignore this email.
        </p>
      </div>
      <div style="background:#fafafa;text-align:center;padding:16px;color:#999;font-size:12px;border-top:1px solid #eee;">
        Cuci Xpress · Brunei Darussalam · cucixpress.com
      </div>
    </div>
  </body></html>`;

  const text = `Cuci Xpress — ${heading}\n\n${blurb}\n\nYour code: ${args.code}\n\nExpires in ${args.ttlMinutes} minutes.\nIf you didn't request this, ignore this email.`;

  const ok = await sendEmail({
    to: args.to,
    subject: `${args.code} is your Cuci Xpress code`,
    text,
    html,
  });
  if (ok) console.log(`[email] OTP sent to ${args.to}`);
  else console.error(`[email] OTP send failed to ${args.to}`);
  return ok;
}

interface SubscriptionNotificationData {
  email: string;
  submittedAt: string;
}

export async function sendSubscriptionNotification(data: SubscriptionNotificationData): Promise<boolean> {
  if (!GMAIL_APP_PASSWORD && !SENDGRID_API_KEY) {
    console.log('No email provider configured - skipping subscription email');
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
        <p>In the meantime, visit any of our 5 branches for immediate service!</p>
        <p style="text-align:center;margin-top:25px;">
          <a href="tel:+6738387000" style="color:#6C5CE7;font-weight:bold;">📞 +673 838 7000</a> &nbsp;|&nbsp;
          <a href="https://cucixpress.com" style="color:#6C5CE7;font-weight:bold;">🌐 cucixpress.com</a>
        </p>
      </div>
    </div>
  </body>
  </html>
  `;

  const ok = await sendEmail({
    to: data.email,
    subject: 'Welcome to Cuci Xpress – You\'re on the subscription list! 🚗',
    html: emailHtml,
  });
  if (ok) console.log(`Subscription notification sent to ${data.email}`);
  return ok;
}
