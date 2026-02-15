import { TelcoOperator } from './interfaces/TelcoOperator';
import { MTNOperator } from './operators/MTNOperator';
import { AfricasTalkingOperator } from './operators/AfricasTalkingOperator';
import { LycamobileOperator } from './operators/LycamobileOperator';

export class TelcoFactory {
  private static operators: Map<string, TelcoOperator> = new Map();
  
  static initialize(): void {
    if (process.env.MTN_API_KEY && process.env.MTN_API_SECRET) {
      this.operators.set('MTN', new MTNOperator({
        apiKey: process.env.MTN_API_KEY,
        apiSecret: process.env.MTN_API_SECRET,
        baseURL: process.env.MTN_BASE_URL,
        environment: process.env.MTN_ENVIRONMENT,
      }));
      console.log('✅ MTN operator initialized');
    }
    
    if (process.env.AT_API_KEY && process.env.AT_USERNAME) {
      this.operators.set('AfricasTalking', new AfricasTalkingOperator({
        apiKey: process.env.AT_API_KEY,
        username: process.env.AT_USERNAME,
      }));
      console.log('✅ Africa\'s Talking operator initialized');
    }

    if (process.env.RELOADLY_CLIENT_ID && process.env.RELOADLY_CLIENT_SECRET) {
      this.operators.set('Lycamobile', new LycamobileOperator({
        clientId: process.env.RELOADLY_CLIENT_ID,
        clientSecret: process.env.RELOADLY_CLIENT_SECRET,
        sandbox: process.env.RELOADLY_SANDBOX !== 'false',
        countryCode: process.env.LYCAMOBILE_COUNTRY_CODE || 'IE',
        currency: process.env.LYCAMOBILE_CURRENCY || 'EUR',
      }));
      console.log('✅ Lycamobile (via Reloadly) operator initialized');
    }
    
    if (this.operators.size === 0) {
      console.warn('⚠️  No telco operators configured!');
    }
  }
  
  static getOperator(phoneNumber: string): TelcoOperator {
    const operatorCode = this.detectOperator(phoneNumber);
    
    const operator = this.operators.get(operatorCode);
    if (!operator) {
      // Try Lycamobile as fallback, then AfricasTalking
      const fallback = this.operators.get('Lycamobile') || this.operators.get('AfricasTalking');
      if (!fallback) {
        throw new Error(`No operator configured for ${phoneNumber}`);
      }
      console.log(`Using fallback operator (${fallback.name}) for ${phoneNumber}`);
      return fallback;
    }
    
    return operator;
  }
  
  private static detectOperator(phoneNumber: string): string {
    const cleaned = phoneNumber.replace(/\D/g, '');
    
    // Uganda - MTN
    if (cleaned.startsWith('25677') || cleaned.startsWith('25678') || cleaned.startsWith('25676')) {
      return 'MTN';
    }
    
    // Uganda - Airtel
    if (cleaned.startsWith('25670') || cleaned.startsWith('25675')) {
      return 'Airtel';
    }
    
    // Kenya - Safaricom
    if (cleaned.startsWith('2547')) {
      return 'Safaricom';
    }
    
    // Kenya - Airtel
    if (cleaned.startsWith('2541')) {
      return 'Airtel';
    }

    // Ireland - Lycamobile (353 country code)
    if (cleaned.startsWith('353')) {
      return 'Lycamobile';
    }

    // UK - Lycamobile (44 country code, Lycamobile UK prefixes)
    if (cleaned.startsWith('447')) {
      return 'Lycamobile';
    }

    // India (91 country code) — route to Lycamobile/Reloadly for top-up
    if (cleaned.startsWith('91')) {
      return 'Lycamobile';
    }
    
    return 'AfricasTalking';
  }
  
  static getAllOperators(): TelcoOperator[] {
    return Array.from(this.operators.values());
  }
  
  static isSupported(phoneNumber: string): boolean {
    try {
      this.getOperator(phoneNumber);
      return true;
    } catch {
      return false;
    }
  }
}
