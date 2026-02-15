import AfricasTalking from 'africastalking';
import { TelcoOperator } from '../interfaces/TelcoOperator';
import {
  BalanceResponse,
  DeductionResponse,
  TransferResponse,
  SMSResponse,
  VerificationResponse,
  OperatorInfo,
} from '../../types';

export class AfricasTalkingOperator implements TelcoOperator {
  name = 'AfricasTalking';
  countryCode = 'MULTI';
  currency = 'USD';
  
  private client: any;
  private sms: any;
  private payments: any;
  
  constructor(config: ATConfig) {
    this.client = AfricasTalking({
      apiKey: config.apiKey,
      username: config.username,
    });
    
    this.sms = this.client.SMS;
    this.payments = this.client.PAYMENTS;
  }
  
  async checkBalance(phoneNumber: string): Promise<BalanceResponse> {
    try {
      const response = await this.client.APPLICATION.fetchApplicationData();
      
      return {
        success: true,
        balance: parseFloat(response.UserData.balance.split(' ')[1]),
        currency: 'USD',
        lastUpdated: new Date(),
      };
    } catch (error: any) {
      return {
        success: false,
        balance: 0,
        currency: 'USD',
        lastUpdated: new Date(),
        error: error.message,
      };
    }
  }
  
  async deductBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    try {
      const result = await this.payments.mobileCheckout({
        productName: 'TXTC',
        phoneNumber: phoneNumber,
        currencyCode: 'UGX',
        amount: amount,
        metadata: {
          reason: reason,
          timestamp: Date.now(),
        },
      });
      
      if (result.status === 'PendingConfirmation') {
        return {
          success: true,
          transactionId: result.transactionId,
          newBalance: 0,
          amountDeducted: amount,
          fee: 0,
          timestamp: new Date(),
        };
      } else {
        return {
          success: false,
          transactionId: result.transactionId || '',
          newBalance: 0,
          amountDeducted: 0,
          fee: 0,
          timestamp: new Date(),
          error: result.description || 'Payment failed',
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
        error: error.message,
      };
    }
  }
  
  async addBalance(
    phoneNumber: string,
    amount: number,
    reason: string
  ): Promise<DeductionResponse> {
    try {
      const result = await this.payments.mobileB2C({
        productName: 'TXTC',
        recipients: [
          {
            phoneNumber: phoneNumber,
            currencyCode: 'UGX',
            amount: amount,
            reason: reason,
            metadata: {
              type: 'refund',
            },
          },
        ],
      });
      
      return {
        success: true,
        transactionId: result.entries[0].transactionId,
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
        error: error.message,
      };
    }
  }
  
  async transferBalance(
    fromPhone: string,
    toPhone: string,
    amount: number
  ): Promise<TransferResponse> {
    throw new Error('P2P transfers handled via separate flow');
  }
  
  async sendSMS(to: string, message: string): Promise<SMSResponse> {
    try {
      const result = await this.sms.send({
        to: [to],
        message: message,
        from: process.env.AT_SENDER_ID || 'TXTC',
      });
      
      const recipient = result.SMSMessageData.Recipients[0];
      
      return {
        success: recipient.status === 'Success',
        messageId: recipient.messageId,
        cost: parseFloat(recipient.cost.replace(/[^\d.]/g, '')),
      };
    } catch (error: any) {
      return {
        success: false,
        messageId: '',
        cost: 0,
        error: error.message,
      };
    }
  }
  
  async verifyPhoneNumber(phoneNumber: string): Promise<VerificationResponse> {
    return {
      isValid: true,
      operator: 'Unknown',
      countryCode: 'MULTI',
      numberType: 'mobile',
    };
  }
  
  async getOperatorInfo(phoneNumber: string): Promise<OperatorInfo> {
    return {
      name: this.name,
      code: 'AT',
      country: 'MULTI',
      supportsUSSD: true,
      supportsMobileMoney: true,
      apiVersion: 'v1',
    };
  }
  
  async getConversionRate(): Promise<number> {
    return parseFloat(process.env.UGX_TO_USD_RATE || '3700');
  }
  
  async getTransactionFee(amount: number): Promise<number> {
    const feePercent = parseFloat(process.env.PLATFORM_FEE_PERCENT || '2');
    return amount * (feePercent / 100);
  }
}

interface ATConfig {
  apiKey: string;
  username: string;
}
