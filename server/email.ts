import { MailService } from '@sendgrid/mail';

if (!process.env.SENDGRID_API_KEY) {
  console.warn("SENDGRID_API_KEY not provided - email notifications disabled");
}

const mailService = new MailService();
if (process.env.SENDGRID_API_KEY) {
  mailService.setApiKey(process.env.SENDGRID_API_KEY);
}

interface CollaborationEmailData {
  name: string;
  email: string;
  phone?: string;
  businessType?: string;
  message?: string;
  submittedAt: string;
}

interface SubscriptionEmailData {
  email: string;
  submittedAt: string;
}

export async function sendCollaborationNotification(data: CollaborationEmailData): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("Email notification skipped - no SENDGRID_API_KEY configured");
    return false;
  }

  try {
    const emailContent = `
New Collaboration Request Received

Business Owner Details:
- Name: ${data.name}
- Email: ${data.email}
- Phone: ${data.phone || 'Not provided'}
- Business Type: ${data.businessType || 'Not specified'}

Collaboration Ideas:
${data.message || 'No message provided'}

Submitted at: ${data.submittedAt}

---
This notification was sent from the Cuci Xpress website collaboration form.
    `.trim();

    await mailService.send({
      to: 'cucixpress.bn@gmail.com',
      from: 'noreply@cucixpress.com', // Must be verified sender domain
      subject: `New Collaboration Request from ${data.name}`,
      text: emailContent,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6C5CE7;">New Collaboration Request Received</h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Business Owner Details:</h3>
            <p><strong>Name:</strong> ${data.name}</p>
            <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
            <p><strong>Phone:</strong> ${data.phone || 'Not provided'}</p>
            <p><strong>Business Type:</strong> ${data.businessType || 'Not specified'}</p>
          </div>
          
          <div style="background: #ffffff; border: 1px solid #e9ecef; padding: 20px; border-radius: 8px;">
            <h3 style="color: #333; margin-top: 0;">Collaboration Ideas:</h3>
            <p style="white-space: pre-wrap;">${data.message || 'No message provided'}</p>
          </div>
          
          <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
            Submitted at: ${data.submittedAt}<br>
            This notification was sent from the Cuci Xpress website collaboration form.
          </p>
        </div>
      `,
    });

    console.log("Collaboration notification email sent successfully");
    return true;
  } catch (error) {
    console.error('Failed to send collaboration notification email:', error);
    return false;
  }
}

export async function sendSubscriptionNotification(data: SubscriptionEmailData): Promise<boolean> {
  if (!process.env.SENDGRID_API_KEY) {
    console.log("Subscription notification skipped - no SENDGRID_API_KEY configured");
    return false;
  }

  try {
    const emailContent = `
New Subscription Signup

Email: ${data.email}
Signed up at: ${data.submittedAt}

---
This notification was sent from the Cuci Xpress subscription signup form.
    `.trim();

    await mailService.send({
      to: 'cucixpress.bn@gmail.com',
      from: 'noreply@cucixpress.com',
      subject: `New Subscription Signup: ${data.email}`,
      text: emailContent,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #6C5CE7;">New Subscription Signup</h2>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h3 style="color: #333; margin-top: 0;">Customer Details:</h3>
            <p><strong>Email:</strong> <a href="mailto:${data.email}">${data.email}</a></p>
            <p><strong>Signed up at:</strong> ${data.submittedAt}</p>
          </div>
          
          <p style="color: #6c757d; font-size: 12px; margin-top: 30px;">
            This notification was sent from the Cuci Xpress subscription signup form.
          </p>
        </div>
      `,
    });

    console.log("Subscription notification email sent successfully");
    return true;
  } catch (error) {
    console.error('Failed to send subscription notification email:', error);
    return false;
  }
}