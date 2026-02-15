/**
 * Blockchain Monitor Service
 * Polls blockchain directly to detect deposits to all user wallets
 * No dependency on Alchemy webhooks or API
 */

import { ethers } from 'ethers';
import { SEPOLIA_CONFIG } from './contracts.config';
import axios from 'axios';
import twilio from 'twilio';

interface WalletBalance {
  address: string;
  balance: string;
  lastChecked: number;
}

export class BlockchainMonitor {
  private provider: ethers.JsonRpcProvider;
  private walletBalances: Map<string, WalletBalance> = new Map();
  private pollInterval: number = 60000; // Check every 60 seconds
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;
  private smsHandlerUrl: string;
  private twilioClient: any;
  private twilioPhoneNumber: string;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
    this.smsHandlerUrl = process.env.SMS_HANDLER_URL || 'http://localhost:8080';
    
    // Initialize Twilio
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || '';
    
    if (accountSid && authToken) {
      this.twilioClient = twilio(accountSid, authToken);
      console.log('✅ Twilio SMS initialized');
    } else {
      console.warn('⚠️  Twilio credentials not configured - SMS notifications disabled');
    }
  }

  /**
   * Start monitoring all user wallets
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Blockchain monitor already running');
      return;
    }

    console.log('🔍 Starting blockchain monitor...');
    console.log(`   Polling interval: ${this.pollInterval / 1000}s`);

    this.isRunning = true;

    // Initial load of wallets
    await this.loadWallets();

    // Start polling
    this.intervalId = setInterval(async () => {
      await this.checkAllWallets();
    }, this.pollInterval);

    console.log('✅ Blockchain monitor started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log('🛑 Blockchain monitor stopped');
  }

  /**
   * Load all wallet addresses from database
   */
  private async loadWallets(): Promise<void> {
    try {
      const response = await axios.get(`${this.smsHandlerUrl}/admin/wallets`, {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`,
        },
      });

      const wallets = response.data.wallets || [];
      console.log(`📊 Loaded ${wallets.length} wallets to monitor`);

      for (const wallet of wallets) {
        const address = wallet.wallet_address.toLowerCase();
        
        // Get initial balance
        const balance = await this.provider.getBalance(address);
        const balanceEth = ethers.formatEther(balance);

        this.walletBalances.set(address, {
          address,
          balance: balanceEth,
          lastChecked: Date.now(),
        });
      }

      console.log(`✅ Initialized ${this.walletBalances.size} wallet balances`);
    } catch (error: any) {
      console.error('❌ Error loading wallets:', error.message);
    }
  }

  /**
   * Check all wallets for balance changes
   */
  private async checkAllWallets(): Promise<void> {
    // Reload wallets periodically to catch new users
    if (Math.random() < 0.1) { // 10% chance each poll
      await this.loadWallets();
    }

    const addresses = Array.from(this.walletBalances.keys());
    
    for (const address of addresses) {
      await this.checkWallet(address);
    }
  }

  /**
   * Check a single wallet for balance changes
   */
  private async checkWallet(address: string): Promise<void> {
    try {
      const currentData = this.walletBalances.get(address);
      if (!currentData) return;

      // Get current balance
      const balance = await this.provider.getBalance(address);
      const balanceEth = ethers.formatEther(balance);

      // Check if balance increased
      const oldBalance = parseFloat(currentData.balance);
      const newBalance = parseFloat(balanceEth);

      if (newBalance > oldBalance) {
        const depositAmount = newBalance - oldBalance;
        console.log(`💰 Deposit detected!`);
        console.log(`   Address: ${address}`);
        console.log(`   Amount: +${depositAmount.toFixed(6)} ETH`);
        console.log(`   New balance: ${newBalance.toFixed(6)} ETH`);

        // Send notification
        await this.notifyDeposit(address, depositAmount, newBalance);
      }

      // Update stored balance
      this.walletBalances.set(address, {
        address,
        balance: balanceEth,
        lastChecked: Date.now(),
      });
    } catch (error: any) {
      console.error(`❌ Error checking wallet ${address}:`, error.message);
    }
  }

  /**
   * Send SMS notification about deposit
   */
  private async notifyDeposit(
    address: string,
    depositAmount: number,
    newBalance: number
  ): Promise<void> {
    try {
      // Get user info
      const userInfo = await this.getUserByWallet(address);
      if (!userInfo) {
        console.log('⚠️  No user found for wallet:', address);
        return;
      }

      const ensName = userInfo.ensName || 'your wallet';
      const message = `✅ Deposit received!\n+${depositAmount.toFixed(4)} ETH to ${ensName}\n\nUser: ${userInfo.phone}\nNew balance: ${newBalance.toFixed(4)} ETH`;

      console.log(`📱 Sending deposit SMS to ${userInfo.phone}`);

      // Send via Twilio
      if (this.twilioClient && this.twilioPhoneNumber) {
        await this.twilioClient.messages.create({
          body: message,
          from: this.twilioPhoneNumber,
          to: userInfo.phone,
        });
        console.log(`✅ Deposit notification sent to ${userInfo.phone}`);
      } else {
        console.log('⚠️  Twilio not configured - notification not sent');
        console.log(`📱 Would send: ${message}`);
      }
    } catch (error: any) {
      console.error('❌ Error sending notification:', error.message);
      console.log(`📱 Would notify: +${depositAmount.toFixed(4)} ETH deposited`);
    }
  }

  /**
   * Get user info by wallet address
   */
  private async getUserByWallet(walletAddress: string): Promise<{ phone: string; ensName?: string } | null> {
    try {
      const response = await axios.get(`${this.smsHandlerUrl}/admin/wallets`, {
        headers: {
          'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}`,
        },
      });

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
   * Add a new wallet to monitor
   */
  async addWallet(address: string): Promise<void> {
    const normalizedAddress = address.toLowerCase();
    
    if (this.walletBalances.has(normalizedAddress)) {
      console.log(`⚠️  Wallet already being monitored: ${address}`);
      return;
    }

    try {
      const balance = await this.provider.getBalance(normalizedAddress);
      const balanceEth = ethers.formatEther(balance);

      this.walletBalances.set(normalizedAddress, {
        address: normalizedAddress,
        balance: balanceEth,
        lastChecked: Date.now(),
      });

      console.log(`✅ Added wallet to monitoring: ${address}`);
      console.log(`   Initial balance: ${balanceEth} ETH`);
    } catch (error: any) {
      console.error(`❌ Error adding wallet ${address}:`, error.message);
    }
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    isRunning: boolean;
    walletsMonitored: number;
    pollInterval: number;
  } {
    return {
      isRunning: this.isRunning,
      walletsMonitored: this.walletBalances.size,
      pollInterval: this.pollInterval,
    };
  }
}

// Export singleton instance
export const blockchainMonitor = new BlockchainMonitor();
