import axios, { AxiosInstance } from 'axios';
import { TelcoOperator } from '../interfaces/TelcoOperator';
import {
  BalanceResponse,
  DeductionResponse,
  TransferResponse,
  SMSResponse,
  VerificationResponse,
  OperatorInfo,
} from '../../types';

/**
 * Lycamobile Operator via Reloadly Airtime API
 * 
 * Reloadly is a third-party aggregator that supports Lycamobile
 * across 50+ countries. It provides REST APIs for:
 * - Airtime top-up (send credit to any Lycamobile number)
 * - Operator auto-detection
 * - Balance checking (account balance)
 * - Transaction history
 * 
 * Docs: https://developers.reloadly.com
 */
export class LycamobileOperator implements TelcoOperator {
  name = 'Lycamobile';
  countryCode = 'IE'; // Ireland by default, supports multi-country
  currency = 'EUR';

  private apiClient: AxiosInstance;
  private clientId: string;
  private clientSecret: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  private isSandbox: boolean;

  constructor(config: LycamobileConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
    this.isSandbox = config.sandbox ?? true;
    this.countryCode = config.countryCode || 'IE';
    this.currency = config.currency || 'EUR';

    const baseURL = this.isSandbox
      ? 'https://topups-sandbox.reloadly.com'
      : 'https://topups.reloadly.com';

    this.apiClient = axios.create({
      baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/com.reloadly.topups-v1+json',
      },
    });

    // Add auth interceptor
    this.apiClient.interceptors.request.use(async (reqConfig) => {
      const token = await this.getAccessToken();
      reqConfig.headers.Authorization = `Bearer ${token}`;
      return reqConfig;
    });
  }

  /**
   * Get OAuth2 access token from Reloadly
   */
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }

    try {
      const authUrl = this.isSandbox
        ? 'https://auth.reloadly.com/oauth/token'
        : 'https://auth.reloadly.com/oauth/token';

      const response = await axios.post(authUrl, {
        client_id: this.clientId,
        client_secret: this.clientSecret,
        grant_type: 'client_credentials',
        audience: this.isSandbox
          ? 'https://topups-sandbox.reloadly.com'
          : 'https://topups.reloadly.com',
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);

      console.log('✅ Reloadly authentication successful');

      if (!this.accessToken) {
        throw new Error('Reloadly authentication failed: No access token');
      }

      return this.accessToken;
    } catch (error: any) {
      throw new Error(`Reloadly authentication failed: ${error.message}`);
    }
  }

  /**
   * Check Reloadly account balance (not user's airtime balance)
   */
  async checkBalance(phoneNumber: string): Promise<BalanceResponse> {
    try {
      const response = await this.apiClient.get('/accounts/balance');

      return {
        success: true,
        balance: response.data.balance,
        currency: response.data.currencyCode,
        lastUpdated: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        balance: 0,
        currency: this.currency,
        lastUpdated: new Date(),
        error: this.parseError(error),
      };
    }
  }

  /**
   * Send airtime top-up to a Lycamobile number via Reloadly
   * This is the primary method — "deduct" from platform balance to top up user
   */
  async deductBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    try {
      // Step 1: Auto-detect operator for the phone number
      const operator = await this.detectOperatorForNumber(phoneNumber);

      if (!operator) {
        return {
          success: false,
          transactionId: '',
          newBalance: 0,
          amountDeducted: 0,
          fee: 0,
          timestamp: new Date(),
          error: 'Could not detect operator for this number',
        };
      }

      console.log(`📱 Detected operator: ${operator.name} (ID: ${operator.operatorId})`);

      // Step 2: Get valid fixed amounts for this operator
      const opDetails = await this.apiClient.get(`/operators/${operator.operatorId}`);
      const fixedAmounts: number[] = opDetails.data.fixedAmounts || [];
      const denomType = opDetails.data.denominationType;

      let sendAmount = amount;
      if (denomType === 'FIXED' && fixedAmounts.length > 0) {
        // Find the closest fixed amount >= requested, or the smallest available
        const valid = fixedAmounts.filter((a: number) => a >= amount);
        sendAmount = valid.length > 0 ? valid[0] : fixedAmounts[0];
        console.log(`📊 Fixed denomination: requested ${amount}, sending ${sendAmount}`);
      }

      // Step 3: Send top-up
      const response = await this.apiClient.post('/topups', {
        operatorId: operator.operatorId,
        amount: sendAmount,
        useLocalAmount: false,
        customIdentifier: `txtc_${Date.now()}`,
        recipientPhone: {
          countryCode: this.countryCode,
          number: phoneNumber.replace(/^\+/, ''),
        },
      });

      const pin = response.data.pinDetail;
      if (pin && pin.code) {
        console.log(`✅ Airtime PIN: ${pin.code} (dial ${pin.info3})`);
      }
      console.log(`✅ Airtime sent: ${response.data.transactionId}`);

      return {
        success: true,
        transactionId: response.data.transactionId?.toString() || '',
        newBalance: response.data.balanceInfo?.newBalance || 0,
        amountDeducted: response.data.requestedAmount || amount,
        fee: response.data.fee || 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
      console.error('❌ Reloadly top-up error:', error.response?.data || error.message);
      return {
        success: false,
        transactionId: '',
        newBalance: 0,
        amountDeducted: 0,
        fee: 0,
        timestamp: new Date(),
        error: this.parseError(error),
      };
    }
  }

  /**
   * Add balance (refund) — send airtime to user's number
   */
  async addBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    // Reloadly only supports top-ups (adding credit), so this is the same as deductBalance
    return this.deductBalance(phoneNumber, amount, reason);
  }

  /**
   * P2P transfer not directly supported — handled via separate flow
   */
  async transferBalance(
    fromPhone: string,
    toPhone: string,
    amount: number
  ): Promise<TransferResponse> {
    throw new Error('P2P transfers handled via blockchain (TXTC) — not via airtime');
  }

  /**
   * Send SMS via Twilio (Reloadly doesn't provide SMS)
   */
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    return {
      success: false,
      messageId: '',
      cost: 0,
      error: 'SMS handled by Twilio, not Reloadly',
    };
  }

  /**
   * Auto-detect operator for a phone number
   */
  async verifyPhoneNumber(phoneNumber: string): Promise<VerificationResponse> {
    try {
      const operator = await this.detectOperatorForNumber(phoneNumber);

      return {
        isValid: !!operator,
        operator: operator?.name || 'Unknown',
        countryCode: operator?.countryCode || this.countryCode,
        numberType: 'mobile',
      };
    } catch {
      return {
        isValid: false,
        operator: 'Unknown',
        countryCode: this.countryCode,
        numberType: 'unknown',
      };
    }
  }

  async getOperatorInfo(phoneNumber: string): Promise<OperatorInfo> {
    return {
      name: this.name,
      code: 'LYCA',
      country: this.countryCode,
      supportsUSSD: false,
      supportsMobileMoney: false,
      apiVersion: 'reloadly-v1',
    };
  }

  async getConversionRate(): Promise<number> {
    return parseFloat(process.env.EUR_TO_USD_RATE || '1.08');
  }

  async getTransactionFee(amount: number): Promise<number> {
    const feePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || '2');
    return amount * (feePercent / 100);
  }

  /**
   * Auto-detect mobile operator for a given phone number via Reloadly
   */
  private async detectOperatorForNumber(
    phoneNumber: string
  ): Promise<{ operatorId: number; name: string; countryCode: string } | null> {
    try {
      const cleaned = phoneNumber.replace(/^\+/, '');
      const response = await this.apiClient.get(
        `/operators/auto-detect/phone/${cleaned}/countries/${this.countryCode}`
      );

      return {
        operatorId: response.data.operatorId,
        name: response.data.name,
        countryCode: response.data.country?.isoName || this.countryCode,
      };
    } catch (error: any) {
      console.error('Operator detection failed:', error.response?.data || error.message);
      return null;
    }
  }

  /**
   * List available operators for a country
   */
  async listOperators(countryCode?: string): Promise<any[]> {
    try {
      const iso = countryCode || this.countryCode;
      const response = await this.apiClient.get(`/operators/countries/${iso}`);
      return response.data;
    } catch (error: any) {
      console.error('Failed to list operators:', error.message);
      return [];
    }
  }

  private parseError(error: any): string {
    if (error.response) {
      const data = error.response.data;
      return data.message || data.errorCode || `HTTP ${error.response.status}`;
    }
    return error.message || 'Unknown error';
  }
}

export interface LycamobileConfig {
  clientId: string;
  clientSecret: string;
  sandbox?: boolean;
  countryCode?: string;
  currency?: string;
}
