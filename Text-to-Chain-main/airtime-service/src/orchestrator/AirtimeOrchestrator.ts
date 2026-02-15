import axios from 'axios';
import { ethers } from 'ethers';
import { TelcoFactory } from '../telco/TelcoFactory';
import { AirtimeDatabase } from '../database/Database';
import { TokenDistribution } from '../types';

export class AirtimeOrchestrator {
  private db: AirtimeDatabase;
  private contractApiUrl: string;
  
  constructor() {
    this.db = new AirtimeDatabase(process.env.DATABASE_PATH || './airtime.db');
    this.contractApiUrl = process.env.CONTRACT_API_URL || 'http://localhost:3000';
  }
  
  async buyTokensWithAirtime(
    phoneNumber: string,
    airtimeAmount: number
  ): Promise<TokenDistribution> {
    console.log(`\n💰 Processing airtime purchase: ${airtimeAmount} UGX from ${phoneNumber}`);
    
    // Step 1: Validate amount
    const usdAmount = airtimeAmount / parseFloat(process.env.UGX_TO_USD_RATE || '3700');
    const minUSD = parseFloat(process.env.MIN_TRANSACTION_USD || '1');
    const maxUSD = parseFloat(process.env.MAX_TRANSACTION_USD || '100');
    
    if (usdAmount < minUSD || usdAmount > maxUSD) {
      throw new Error(`Amount must be between $${minUSD} and $${maxUSD}`);
    }
    
    // Step 2: Get or create user
    let user = this.db.getUser(phoneNumber);
    if (!user) {
      console.log('👤 Creating new user wallet...');
      const wallet = ethers.Wallet.createRandom();
      user = this.db.createUser(phoneNumber, wallet.address, wallet.privateKey);
      console.log(`✅ Wallet created: ${wallet.address}`);
    }
    
    // Step 3: Deduct airtime via telco API
    console.log('📱 Deducting airtime...');
    const operator = TelcoFactory.getOperator(phoneNumber);
    const deduction = await operator.deductBalance(
      phoneNumber,
      airtimeAmount,
      'TXTC Token Purchase'
    );
    
    if (!deduction.success) {
      throw new Error(`Airtime deduction failed: ${deduction.error}`);
    }
    
    console.log(`✅ Airtime deducted. TX: ${deduction.transactionId}`);
    
    // Step 4: Calculate token amounts
    const totalTXTC = usdAmount * parseFloat(process.env.USD_TO_TXTC_RATE || '100');
    const txtcUserPercent = parseFloat(process.env.TXTC_USER_PERCENT || '90');
    const txtcGasPercent = parseFloat(process.env.TXTC_GAS_PERCENT || '10');
    
    const txtcToUser = totalTXTC * (txtcUserPercent / 100);
    const txtcForSwap = totalTXTC * (txtcGasPercent / 100);
    
    console.log(`📊 Distribution:`);
    console.log(`   Total: ${totalTXTC} TXTC`);
    console.log(`   To user: ${txtcToUser} TXTC (${txtcUserPercent}%)`);
    console.log(`   For gas: ${txtcForSwap} TXTC (${txtcGasPercent}%)`);
    
    // Step 5: Create transaction record
    const txId = this.db.createTransaction({
      type: 'airtime_purchase',
      fromPhone: phoneNumber,
      airtimeAmount,
      currency: 'UGX',
      txtcAmount: totalTXTC,
      fee: deduction.fee,
      telcoTxId: deduction.transactionId,
      status: 'processing',
    });
    
    try {
      // Step 6: Mint TXTC tokens
      console.log('⛓️  Minting TXTC tokens...');
      const mintResponse = await axios.post(`${this.contractApiUrl}/api/mint`, {
        toAddress: user.walletAddress,
        amount: totalTXTC,
      });
      
      const mintTxHash = mintResponse.data.txHash;
      console.log(`✅ Minted ${totalTXTC} TXTC. TX: ${mintTxHash}`);
      
      // Step 7: Swap 10% TXTC for ETH
      console.log('🔄 Swapping TXTC for ETH...');
      const swapResponse = await axios.post(`${this.contractApiUrl}/api/swap`, {
        fromAddress: user.walletAddress,
        amount: txtcForSwap,
        privateKey: this.db.decryptPrivateKey(user.encryptedPrivateKey),
      });
      
      const ethAmount = swapResponse.data.ethAmount;
      const swapTxHash = swapResponse.data.txHash;
      console.log(`✅ Swapped ${txtcForSwap} TXTC for ${ethAmount} ETH. TX: ${swapTxHash}`);
      
      // Step 8: Update transaction
      this.db.updateTransaction(txId, {
        blockchainTxHash: mintTxHash,
        ethAmount,
        status: 'completed',
      });
      
      // Step 9: Send confirmation SMS
      await this.sendConfirmationSMS(
        phoneNumber,
        txtcToUser,
        ethAmount,
        mintTxHash
      );
      
      console.log('✅ Purchase completed successfully!\n');
      
      return {
        totalTXTC,
        txtcToUser,
        txtcForSwap,
        ethAmount,
        mintTxHash,
        swapTxHash,
      };
    } catch (error: any) {
      console.error('❌ Blockchain operation failed:', error.message);
      
      // Update transaction as failed
      this.db.updateTransaction(txId, {
        status: 'failed',
        errorMessage: error.message,
      });
      
      // Refund airtime
      console.log('🔄 Refunding airtime...');
      await operator.addBalance(phoneNumber, airtimeAmount, 'Refund - Transaction failed');
      
      throw error;
    }
  }
  
  async checkAirtimeBalance(phoneNumber: string): Promise<any> {
    const operator = TelcoFactory.getOperator(phoneNumber);
    return await operator.checkBalance(phoneNumber);
  }
  
  async getUserBalance(phoneNumber: string): Promise<any> {
    const user = this.db.getUser(phoneNumber);
    if (!user) {
      return {
        txtc: 0,
        eth: 0,
        wallet: null,
      };
    }
    
    try {
      const response = await axios.get(`${this.contractApiUrl}/api/balance/${user.walletAddress}`);
      return {
        txtc: response.data.txtcBalance,
        eth: response.data.ethBalance,
        wallet: user.walletAddress,
      };
    } catch (error) {
      return {
        txtc: 0,
        eth: 0,
        wallet: user.walletAddress,
      };
    }
  }
  
  async getTransactionHistory(phoneNumber: string, limit: number = 10): Promise<any[]> {
    return this.db.getTransactionsByPhone(phoneNumber, limit);
  }
  
  private async sendConfirmationSMS(
    phoneNumber: string,
    txtcAmount: number,
    ethAmount: number,
    txHash: string
  ): Promise<void> {
    try {
      const operator = TelcoFactory.getOperator(phoneNumber);
      const message = `✓ Purchase confirmed!\n\nYou received:\n${txtcAmount.toFixed(2)} TXTC\n${ethAmount} ETH (for gas)\n\nTX: ${txHash.substring(0, 10)}...\n\nReply BALANCE to check.`;
      
      await operator.sendSMS(phoneNumber, message);
      console.log('📨 Confirmation SMS sent');
    } catch (error) {
      console.error('Failed to send SMS:', error);
    }
  }
}
