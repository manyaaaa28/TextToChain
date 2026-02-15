import {
  BalanceResponse,
  DeductionResponse,
  TransferResponse,
  SMSResponse,
  VerificationResponse,
  OperatorInfo,
} from '../../types';

export interface TelcoOperator {
  name: string;
  countryCode: string;
  currency: string;
  
  checkBalance(phoneNumber: string): Promise<BalanceResponse>;
  deductBalance(phoneNumber: string, amount: number, reason: string): Promise<DeductionResponse>;
  addBalance(phoneNumber: string, amount: number, reason: string): Promise<DeductionResponse>;
  transferBalance(fromPhone: string, toPhone: string, amount: number): Promise<TransferResponse>;
  
  sendSMS(to: string, message: string): Promise<SMSResponse>;
  verifyPhoneNumber(phoneNumber: string): Promise<VerificationResponse>;
  getOperatorInfo(phoneNumber: string): Promise<OperatorInfo>;
  
  getConversionRate(): Promise<number>;
  getTransactionFee(amount: number): Promise<number>;
}
