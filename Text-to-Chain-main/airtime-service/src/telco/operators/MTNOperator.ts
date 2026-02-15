import axios, { AxiosInstance } from 'axios';
import { v4 as uuidgen } from 'uuid';
import { TelcoOperator } from '../interfaces/TelcoOperator';
import {
  BalanceResponse,
  DeductionResponse,
  TransferResponse,
  SMSResponse,
  VerificationResponse,
  OperatorInfo,
} from '../../types';

export class MTNOperator implements TelcoOperator {
  name = 'MTN';
  countryCode = 'UG';
  currency = 'UGX';
  
  private apiClient: AxiosInstance;
  private apiKey: string;
  private apiSecret: string;
  private baseURL: string;
  private environment: string;
  private accessToken?: string;
  private tokenExpiry?: Date;
  
  constructor(config: MTNConfig) {
    this.apiKey = config.apiKey;
    this.apiSecret = config.apiSecret;
    this.baseURL = config.baseURL || 'https://sandbox.momodeveloper.mtn.com';
    this.environment = config.environment || 'sandbox';
    
    this.apiClient = axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    this.apiClient.interceptors.request.use(async (config) => {
      const token = await this.getAccessToken();
      config.headers.Authorization = `Bearer ${token}`;
      config.headers['X-Target-Environment'] = this.environment;
      config.headers['Ocp-Apim-Subscription-Key'] = this.apiKey;
      return config;
    });
  }
  
  private async getAccessToken(): Promise<string> {
    if (this.accessToken && this.tokenExpiry && this.tokenExpiry > new Date()) {
      return this.accessToken;
    }
    
    try {
      const response = await axios.post(
        `${this.baseURL}/collection/token/`,
        {},
        {
          headers: {
            'Ocp-Apim-Subscription-Key': this.apiKey,
          },
          auth: {
            username: this.apiKey,
            password: this.apiSecret,
          },
        }
      );
      
      this.accessToken = response.data.access_token;
      this.tokenExpiry = new Date(Date.now() + response.data.expires_in * 1000);
      
      console.log('✅ MTN authentication successful');
      
      if (!this.accessToken) {
        throw new Error('MTN authentication failed: No access token received');
      }
      
      return this.accessToken;
    } catch (error: any) {
      throw new Error(`MTN authentication failed: ${error.message}`);
    }
  }
  
  async checkBalance(phoneNumber: string): Promise<BalanceResponse> {
    try {
      const response = await this.apiClient.get('/collection/v1_0/account/balance');
      
      return {
        success: true,
        balance: parseFloat(response.data.availableBalance),
        currency: this.currency,
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
  
  async deductBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    try {
      const referenceId = uuidgen();
      
      await this.apiClient.post(
        '/collection/v1_0/requesttopay',
        {
          amount: amount.toString(),
          currency: this.currency,
          externalId: Date.now().toString(),
          payer: {
            partyIdType: 'MSISDN',
            partyId: phoneNumber.replace(/^\+/, ''),
          },
          payerMessage: reason,
          payeeNote: 'TXTC Token Purchase',
        },
        {
          headers: {
            'X-Reference-Id': referenceId,
          },
        }
      );
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const statusResponse = await this.apiClient.get(
        `/collection/v1_0/requesttopay/${referenceId}`
      );
      
      const status = statusResponse.data.status;
      
      if (status === 'SUCCESSFUL') {
        return {
          success: true,
          transactionId: referenceId,
          newBalance: 0,
          amountDeducted: amount,
          fee: 0,
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          transactionId: referenceId,
          newBalance: 0,
          amountDeducted: 0,
          fee: 0,
          timestamp: new Date(),
          error: `Transaction ${status}: ${statusResponse.data.reason || 'Unknown'}`,
        };
      }
    } catch (error: any) {
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
  
  async addBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    try {
      const referenceId = uuidgen();
      
      await this.apiClient.post(
        '/disbursement/v1_0/transfer',
        {
          amount: amount.toString(),
          currency: this.currency,
          externalId: Date.now().toString(),
          payee: {
            partyIdType: 'MSISDN',
            partyId: phoneNumber.replace(/^\+/, ''),
          },
          payerMessage: reason,
          payeeNote: 'Refund',
        },
        {
          headers: {
            'X-Reference-Id': referenceId,
          },
        }
      );
      
      return {
        success: true,
        transactionId: referenceId,
        newBalance: 0,
        amountDeducted: -amount,
        fee: 0,
        timestamp: new Date(),
      };
    } catch (error: any) {
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
  
  async transferBalance(
    fromPhone: string,
    toPhone: string,
    amount: number
  ): Promise<TransferResponse> {
    throw new Error('P2P transfers not supported via MTN API directly');
  }
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    return {
      success: false,
      messageId: '',
      cost: 0,
      error: 'SMS not supported by MTN API - use Africa\'s Talking',
    };
  }
  
  async verifyPhoneNumber(phoneNumber: string): Promise<VerificationResponse> {
    try {
      const cleanNumber = phoneNumber.replace(/^\+/, '');
      const response = await this.apiClient.get(
        `/collection/v1_0/accountholder/msisdn/${cleanNumber}/active`
      );
      
      return {
        isValid: response.data.result === true,
        operator: this.name,
        countryCode: this.countryCode,
        numberType: 'mobile',
      };
    } catch (error: any) {
      return {
        isValid: false,
        operator: this.name,
        countryCode: this.countryCode,
        numberType: 'unknown',
      };
    }
  }
  
  async getOperatorInfo(phoneNumber: string): Promise<OperatorInfo> {
    return {
      name: this.name,
      code: 'MTN',
      country: this.countryCode,
      supportsUSSD: true,
      supportsMobileMoney: true,
      apiVersion: 'v1_0',
    };
  }
  
  async getConversionRate(): Promise<number> {
    return parseFloat(process.env.UGX_TO_USD_RATE || '3700');
  }
  
  async getTransactionFee(amount: number): Promise<number> {
    const feePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || '2');
    return amount * (feePercent / 100);
  }
  
  private parseError(error: any): string {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      
      switch (status) {
        case 400:
          return data.message || 'Invalid request';
        case 401:
          return 'Authentication failed';
        case 403:
          return 'Insufficient permissions';
        case 404:
          return 'Account not found';
        case 409:
          return 'Duplicate transaction';
        case 429:
          return 'Rate limit exceeded';
        case 500:
          return 'Operator service unavailable';
        default:
          return data.message || 'Transaction failed';
      }
    }
    
    return error.message || 'Unknown error occurred';
  }
}

interface MTNConfig {
  apiKey: string;
  apiSecret: string;
  baseURL?: string;
  environment?: string;
}
