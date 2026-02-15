/**
 * Contract Service for Text-to-Chain Backend
 * Handles all smart contract interactions
 */

import { ethers } from 'ethers';
import { SEPOLIA_CONFIG } from './contracts.config';

// Load ABIs using require to get the actual array
const EntryPointV3ABI = require('./EntryPointV3.abi.json');
const TokenXYZABI = require('./TokenXYZ.abi.json');
const VoucherManagerABI = require('./VoucherManager.abi.json');

// Minimal SwapRouter ABI for exactInputSingle
const SwapRouterABI = [
  'function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)'
];

export class ContractService {
  private provider: ethers.Provider;
  private signer: ethers.Wallet;
  
  // Contract instances
  private entryPoint: ethers.Contract;
  private tokenXYZ: ethers.Contract;
  private voucherManager: ethers.Contract;
  private swapRouter: ethers.Contract;
  
  constructor(privateKey: string) {
    this.provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
    this.signer = new ethers.Wallet(privateKey, this.provider);
    
    // Initialize contracts
    this.entryPoint = new ethers.Contract(
      SEPOLIA_CONFIG.contracts.entryPointV3,
      EntryPointV3ABI,
      this.signer
    );
    
    this.tokenXYZ = new ethers.Contract(
      SEPOLIA_CONFIG.contracts.tokenXYZ,
      TokenXYZABI,
      this.signer
    );
    
    this.voucherManager = new ethers.Contract(
      SEPOLIA_CONFIG.contracts.voucherManager,
      VoucherManagerABI,
      this.signer
    );
    
    this.swapRouter = new ethers.Contract(
      SEPOLIA_CONFIG.uniswap.swapRouter,
      SwapRouterABI,
      this.signer
    );
  }
  
  /**
   * Redeem voucher for user
   * SMS Command: REDEEM <code>
   * Directly redeems from VoucherManager, bypassing shop requirements
   */
  async redeemVoucher(
    voucherCode: string,
    userAddress: string,
    autoSwapToEth: boolean = true
  ): Promise<{
    success: boolean;
    tokenAmount: string;
    ethAmount: string;
    txHash: string;
  }> {
    try {
      // Redeem directly from VoucherManager contract
      const tx = await this.voucherManager.redeemVoucher(
        voucherCode,
        userAddress
      );
      
      const receipt = await tx.wait();
      
      // Parse VoucherRedeemed event from VoucherManager
      const event = receipt.logs.find((log: any) => {
        try {
          const parsed = this.voucherManager.interface.parseLog({
            topics: log.topics,
            data: log.data
          });
          return parsed && parsed.name === 'VoucherRedeemed';
        } catch {
          return false;
        }
      });
      
      let totalTokenAmount = '10'; // Default
      
      if (event) {
        const decoded = this.voucherManager.interface.parseLog({
          topics: event.topics,
          data: event.data
        });
        
        if (decoded) {
          totalTokenAmount = ethers.formatEther(decoded.args.tokenAmount);
        }
      }
      
      // Send ETH bonus for gas from backend wallet
      let ethAmount = '0';
      if (autoSwapToEth) {
        try {
          const totalTokens = parseFloat(totalTokenAmount);
          // Send 0.001 ETH per 10 TXTC voucher as gas bonus
          const ethToSend = (totalTokens / 10) * 0.001;
          
          console.log(`� Sending ${ethToSend.toFixed(4)} ETH gas bonus to ${userAddress}`);
          
          // Send ETH directly from backend wallet
          const ethTx = await this.signer.sendTransaction({
            to: userAddress,
            value: ethers.parseEther(ethToSend.toString())
          });
          
          await ethTx.wait();
          ethAmount = ethToSend.toString();
          
          console.log(`✅ Sent ${ethAmount} ETH gas bonus, user keeps ${totalTokenAmount} TXTC`);
        } catch (ethError: any) {
          console.error('Failed to send ETH bonus:', ethError.message);
          // If ETH send fails, user still gets all TXTC tokens
        }
      }
      
      return {
        success: true,
        tokenAmount: totalTokenAmount,
        ethAmount,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      console.error('Redeem voucher error:', error);
      throw new Error(`Failed to redeem voucher: ${error.message}`);
    }
  }
  
  /**
   * Swap tokens for ETH via Uniswap pool
   * SMS Command: SWAP <amount> TXTC
   * Process: Burn user's TXTC → Mint to backend → Swap via Uniswap → Send ETH to user
   */
  async swapTokenForEth(
    userAddress: string,
    tokenAmount: string,
    minEthOut: string = '0'
  ): Promise<{
    success: boolean;
    ethReceived: string;
    txHash: string;
  }> {
    try {
      const amountWei = ethers.parseEther(tokenAmount);
      
      console.log(`🔄 Swapping ${tokenAmount} TXTC to ETH for ${userAddress}`);
      
      // Mint tokens to backend for swap (user balance tracked off-chain)
      console.log('💰 Minting tokens to backend...');
      const mintTx = await this.tokenXYZ.mint(this.signer.address, amountWei);
      await mintTx.wait();
      console.log('✅ Tokens minted to backend');
      
      // Step 2: Approve SwapRouter to spend backend's tokens
      console.log('✅ Approving SwapRouter...');
      const approveTx = await this.tokenXYZ.approve(
        SEPOLIA_CONFIG.uniswap.swapRouter,
        amountWei
      );
      await approveTx.wait();
      console.log('✅ SwapRouter approved');
      
      // Step 3: Execute swap via Uniswap pool
      const swapParams = {
        tokenIn: SEPOLIA_CONFIG.contracts.tokenXYZ,
        tokenOut: SEPOLIA_CONFIG.uniswap.weth9,
        fee: SEPOLIA_CONFIG.poolInfo.fee,
        recipient: userAddress, // ETH goes directly to user
        amountIn: amountWei,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };
      
      console.log('🔄 Executing swap on Uniswap pool...');
      const swapTx = await this.swapRouter.exactInputSingle(swapParams);
      const receipt = await swapTx.wait();
      
      console.log(`✅ Swap complete! ETH sent to ${userAddress}, Tx: ${receipt.hash}`);
      
      // Estimate ETH received (pool rate: 1 TXTC ≈ 0.002 ETH, minus 1% fee)
      const ethReceived = (parseFloat(tokenAmount) * 0.002 * 0.99).toFixed(6);
      
      return {
        success: true,
        ethReceived,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      console.error('Swap error:', error);
      throw new Error(`Failed to swap tokens: ${error.message}`);
    }
  }
  
  /**
   * Get user token balance
   * SMS Command: BALANCE
   */
  async getTokenBalance(userAddress: string): Promise<string> {
    try {
      const balance = await this.tokenXYZ.balanceOf(userAddress);
      return ethers.formatEther(balance);
    } catch (error: any) {
      console.error('Get balance error:', error);
      throw new Error(`Failed to get balance: ${error.message}`);
    }
  }
  
  /**
   * Get user ETH balance
   */
  async getEthBalance(userAddress: string): Promise<string> {
    try {
      const balance = await this.provider.getBalance(userAddress);
      return ethers.formatEther(balance);
    } catch (error: any) {
      console.error('Get ETH balance error:', error);
      throw new Error(`Failed to get ETH balance: ${error.message}`);
    }
  }
  
  /**
   * Send tokens to another user
   * SMS Command: SEND <amount> <phone>
   */
  async sendTokens(
    fromAddress: string,
    toAddress: string,
    amount: string
  ): Promise<{
    success: boolean;
    txHash: string;
  }> {
    try {
      const amountWei = ethers.parseEther(amount);
      
      // This would need to be called by the user's wallet
      // For backend, we'd need to handle this differently
      const tx = await this.tokenXYZ.transfer(toAddress, amountWei);
      const receipt = await tx.wait();
      
      return {
        success: true,
        txHash: receipt.hash,
      };
    } catch (error: any) {
      console.error('Send tokens error:', error);
      throw new Error(`Failed to send tokens: ${error.message}`);
    }
  }
  
  /**
   * Get current pool price
   */
  async getCurrentPrice(): Promise<string> {
    try {
      const poolManager = new ethers.Contract(
        SEPOLIA_CONFIG.contracts.uniswapV3PoolManager,
        ['function getCurrentPrice() view returns (uint160)'],
        this.provider
      );
      
      const price = await poolManager.getCurrentPrice();
      return price.toString();
    } catch (error: any) {
      console.error('Get price error:', error);
      throw new Error(`Failed to get price: ${error.message}`);
    }
  }
  
  /**
   * Estimate swap output
   */
  async estimateSwapOutput(
    tokenAmount: string,
    isTokenToEth: boolean
  ): Promise<string> {
    try {
      const amountWei = ethers.parseEther(tokenAmount);
      
      const quote = await this.entryPoint.getSwapQuote(amountWei, isTokenToEth);
      return ethers.formatEther(quote);
    } catch (error: any) {
      console.error('Estimate swap error:', error);
      return '0';
    }
  }

  /**
   * Send ETH for gas fees to a user
   */
  async sendGasFee(toAddress: string, amount: string): Promise<string> {
    try {
      const tx = await this.signer.sendTransaction({
        to: toAddress,
        value: ethers.parseEther(amount),
      });
      await tx.wait();
      return tx.hash;
    } catch (error: any) {
      throw new Error(`Failed to send gas fee: ${error.message}`);
    }
  }
}

// Export singleton instance
let contractServiceInstance: ContractService | null = null;

export function getContractService(privateKey?: string): ContractService {
  if (!contractServiceInstance) {
    if (!privateKey) {
      throw new Error('Private key required for first initialization');
    }
    contractServiceInstance = new ContractService(privateKey);
  }
  return contractServiceInstance;
}
