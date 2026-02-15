/**
 * Deposit Monitor Service
 * Handles Alchemy webhook notifications for incoming deposits
 * Sends SMS notifications to users when deposits are detected
 */

import { ethers } from 'ethers';
import { SEPOLIA_CONFIG } from './contracts.config';
import axios from 'axios';

interface AlchemyWebhookEvent {
  webhookId: string;
  id: string;
  createdAt: string;
  type: 'ADDRESS_ACTIVITY';
  event: {
    network: string;
    activity: Array<{
      fromAddress: string;
      toAddress: string;
      blockNum: string;
      hash: string;
      value: number;
      asset: string;
      category: string;
      rawContract: {
        rawValue: string;
        address: string | null;
        decimals: number | null;
      };
    }>;
  };
}

interface DepositInfo {
  userPhone: string;
  amount: string;
  token: string;
  txHash: string;
  newBalance: string;
}

export class DepositMonitor {
  private provider: ethers.JsonRpcProvider;
  private smsHandlerUrl: string;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
    this.smsHandlerUrl = process.env.SMS_HANDLER_URL || 'http://localhost:8080';
  }

  /**
   * Process Alchemy webhook notification
   */
  async processWebhook(webhookData: AlchemyWebhookEvent): Promise<void> {
    console.log('📨 Received Alchemy webhook:', webhookData.id);

    if (webhookData.type !== 'ADDRESS_ACTIVITY') {
      console.log('⏭️  Skipping non-address-activity webhook');
      return;
    }

    for (const activity of webhookData.event.activity) {
      // Only process incoming transactions (deposits)
      if (activity.category === 'external' || activity.category === 'token') {
        await this.handleDeposit(activity);
      }
    }
  }

  /**
   * Handle a deposit transaction
   */
  private async handleDeposit(activity: any): Promise<void> {
    const toAddress = activity.toAddress.toLowerCase();
    const amount = activity.value;
    const asset = activity.asset || 'MATIC';
    const txHash = activity.hash;

    console.log(`💰 Deposit detected: ${amount} ${asset} to ${toAddress}`);
    console.log(`   Transaction: ${txHash}`);

    try {
      // Get user info from database via SMS handler
      const userInfo = await this.getUserByWallet(toAddress);
      
      if (!userInfo) {
        console.log('⚠️  No user found for wallet:', toAddress);
        return;
      }

      // Get updated balance
      const balance = await this.getWalletBalance(toAddress);

      // Send SMS notification
      await this.sendDepositNotification({
        userPhone: userInfo.phone,
        amount: `${amount} ${asset}`,
        token: asset,
        txHash,
        newBalance: balance,
      });

      // Record deposit in database
      await this.recordDeposit(userInfo.phone, amount, asset, txHash);

      console.log(`✅ Deposit notification sent to ${userInfo.phone}`);
    } catch (error) {
      console.error('❌ Error handling deposit:', error);
    }
  }

  /**
   * Get user info by wallet address
   */
  private async getUserByWallet(walletAddress: string): Promise<{ phone: string; ensName?: string } | null> {
    try {
      // Query SMS handler admin API for user by wallet
      const response = await axios.get(
        `${this.smsHandlerUrl}/admin/wallets`,
        {
          headers: {
            'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`,
          },
        }
      );

      const users = response.data.wallets || [];
      const user = users.find((u: any) => 
        u.wallet_address.toLowerCase() === walletAddress.toLowerCase()
      );

      if (user) {
        return {
          phone: user.phone,
          ensName: user.ens_name,
        };
      }

      return null;
    } catch (error) {
      console.error('Error fetching user by wallet:', error);
      return null;
    }
  }

  /**
   * Get wallet balance
   */
  private async getWalletBalance(walletAddress: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(walletAddress);
      const ethBalance = ethers.formatEther(balance);
      return `${parseFloat(ethBalance).toFixed(4)} MATIC`;
    } catch (error) {
      console.error('Error getting balance:', error);
      return '0 MATIC';
    }
  }

  /**
   * Send SMS notification about deposit
   */
  private async sendDepositNotification(info: DepositInfo): Promise<void> {
    const message = `✅ Deposit received!\n+${info.amount}\n\nNew balance: ${info.newBalance}\n\nTx: ${info.txHash.substring(0, 10)}...\n\nReply BALANCE for details`;

    try {
      // Send via SMS handler's internal notification endpoint
      await axios.post(
        `${this.smsHandlerUrl}/internal/notify`,
        {
          phone: info.userPhone,
          message,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.INTERNAL_SECRET || 'internal-secret-key',
          },
        }
      );
    } catch (error) {
      console.error('Error sending SMS notification:', error);
      // Fallback: log the notification
      console.log(`📱 Would send SMS to ${info.userPhone}: ${message}`);
    }
  }

  /**
   * Record deposit in database
   */
  private async recordDeposit(
    phone: string,
    amount: string,
    token: string,
    txHash: string
  ): Promise<void> {
    try {
      await axios.post(
        `${this.smsHandlerUrl}/internal/record-deposit`,
        {
          phone,
          amount,
          token,
          txHash,
          source: 'external_wallet',
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Internal-Secret': process.env.INTERNAL_SECRET || 'internal-secret-key',
          },
        }
      );
    } catch (error) {
      console.error('Error recording deposit:', error);
    }
  }

  /**
   * Register a wallet address for monitoring
   */
  async registerWallet(walletAddress: string): Promise<void> {
    console.log(`📝 Registering wallet for monitoring: ${walletAddress}`);
    // This would call Alchemy API to add the address to the webhook
    // For now, addresses need to be added manually via Alchemy dashboard
  }
}

// Export singleton instance
export const depositMonitor = new DepositMonitor();
