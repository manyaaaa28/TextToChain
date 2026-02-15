export interface BalanceResponse {
  success: boolean;
  balance: number;
  currency: string;
  lastUpdated: Date;
  error?: string;
}

export interface DeductionResponse {
  success: boolean;
  transactionId: string;
  newBalance: number;
  amountDeducted: number;
  fee: number;
  timestamp: Date;
  error?: string;
}

export interface TransferResponse {
  success: boolean;
  transactionId: string;
  fromBalance: number;
  toBalance: number;
  amountTransferred: number;
  fee: number;
  timestamp: Date;
  error?: string;
}

export interface SMSResponse {
  success: boolean;
  messageId: string;
  cost: number;
  error?: string;
}

export interface VerificationResponse {
  isValid: boolean;
  operator: string;
  countryCode: string;
  numberType: 'mobile' | 'landline' | 'unknown';
}

export interface OperatorInfo {
  name: string;
  code: string;
  country: string;
  supportsUSSD: boolean;
  supportsMobileMoney: boolean;
  apiVersion: string;
}

export interface PaymentWebhook {
  transactionId: string;
  phoneNumber: string;
  value: number;
  currency: string;
  status: 'Success' | 'Failed';
  provider: string;
  timestamp: Date;
}

export interface TokenDistribution {
  totalTXTC: number;
  txtcToUser: number;
  txtcForSwap: number;
  ethAmount: number;
  mintTxHash: string;
  swapTxHash?: string;
}

export interface User {
  id: number;
  phoneNumber: string;
  walletAddress: string;
  encryptedPrivateKey: string;
  ensName?: string;
  createdAt: Date;
  lastActive: Date;
}

export interface Transaction {
  id: number;
  type: 'airtime_purchase' | 'p2p_transfer' | 'refund';
  fromPhone: string;
  toPhone?: string;
  airtimeAmount: number;
  currency: string;
  txtcAmount: number;
  ethAmount: number;
  fee: number;
  telcoTxId: string;
  blockchainTxHash?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'refunded';
  errorMessage?: string;
  createdAt: Date;
  completedAt?: Date;
}
