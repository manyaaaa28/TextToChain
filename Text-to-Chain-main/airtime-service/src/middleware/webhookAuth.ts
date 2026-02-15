import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function verifyWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = process.env.WEBHOOK_SECRET;
  
  if (!secret) {
    console.warn('⚠️  WEBHOOK_SECRET not configured - skipping verification');
    return next();
  }
  
  // Option 1: Simple secret in header (Africa's Talking)
  const providedSecret = req.headers['x-webhook-secret'] as string;
  
  if (providedSecret === secret) {
    console.log('✅ Webhook verified via header secret');
    return next();
  }
  
  // Option 2: HMAC signature verification (MTN)
  const signature = req.headers['x-signature'] as string;
  
  if (signature) {
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
    
    if (signature === expectedSignature) {
      console.log('✅ Webhook verified via HMAC signature');
      return next();
    }
  }
  
  // Verification failed
  console.error('❌ Webhook verification failed');
  console.error('   Provided secret:', providedSecret);
  console.error('   Provided signature:', signature);
  
  return res.status(401).json({
    success: false,
    error: 'Unauthorized webhook request',
  });
}

// For development/testing - bypass verification
export function bypassWebhookAuth(req: Request, res: Response, next: NextFunction) {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️  Development mode - bypassing webhook auth');
    return next();
  }
  
  return verifyWebhookSecret(req, res, next);
}
