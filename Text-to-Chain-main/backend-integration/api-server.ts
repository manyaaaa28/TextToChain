/**
 * Contract API Server
 * Provides HTTP endpoints for SMS handler to call smart contracts
 */

import * as dotenv from "dotenv";
import "dotenv/config";
import express from "express";
import { SEPOLIA_CONFIG } from "./contracts.config.ts";
import { getContractService } from "./contract-service.ts";
import { EnsService } from "./ens-service.ts";
import { blockchainMonitor } from "./blockchain-monitor.ts";
import { ethers } from "ethers";
import twilio from "twilio";

const app = express();
app.use(express.json());

// Initialize contract service
const contractService = getContractService(process.env.PRIVATE_KEY!);

// Initialize ENS service
const ensService = new EnsService(process.env.ENS_PRIVATE_KEY || process.env.PRIVATE_KEY!);

// Initialize Twilio
let twilioClient: any = null;
let twilioPhoneNumber: string = "";
const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER || "";

if (accountSid && authToken) {
  twilioClient = twilio(accountSid, authToken);
  console.log("✅ Twilio SMS initialized");
} else {
  console.warn("⚠️  Twilio credentials not configured - SMS notifications disabled");
}

// Helper: get Reloadly OAuth2 token for airtime API
let _reloadlyTokenCache: { token: string; expiry: number } | null = null;
async function getReloadlyToken(): Promise<string> {
  if (_reloadlyTokenCache && _reloadlyTokenCache.expiry > Date.now()) {
    return _reloadlyTokenCache.token;
  }
  const clientId = process.env.RELOADLY_CLIENT_ID;
  const clientSecret = process.env.RELOADLY_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Reloadly credentials not configured');

  const audience = process.env.RELOADLY_SANDBOX !== 'false'
    ? 'https://topups-sandbox.reloadly.com'
    : 'https://topups.reloadly.com';

  const resp = await fetch('https://auth.reloadly.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials', audience }),
  });
  const data = await resp.json() as any;
  if (!data.access_token) throw new Error('Reloadly auth failed');
  _reloadlyTokenCache = { token: data.access_token, expiry: Date.now() + (data.expires_in - 60) * 1000 };
  return data.access_token;
}

// Helper: look up user by wallet address via SMS handler admin API
async function getUserByWallet(walletAddress: string): Promise<{ phone: string; ensName?: string } | null> {
  try {
    const smsHandlerUrl = process.env.SMS_HANDLER_URL || 'http://sms-handler:8080';
    const response = await fetch(`${smsHandlerUrl}/admin/wallets`, {
      headers: { 'Authorization': `Bearer ${process.env.ADMIN_TOKEN || 'admin123'}` },
    });
    const data = await response.json() as any;
    const users = data.wallets || [];
    const user = users.find((u: any) =>
      u.wallet_address.toLowerCase() === walletAddress.toLowerCase()
    );
    return user ? { phone: user.phone, ensName: user.ens_name } : null;
  } catch {
    return null;
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", network: "sepolia", chainId: 11155111 });
});

// ============================================================================
// STEP 1: REDEEM Endpoint
// ============================================================================
app.post("/api/redeem", async (req, res) => {
  try {
    const { voucherCode, userAddress, userPhone } = req.body;

    if (!voucherCode || !userAddress) {
      return res.status(400).json({
        success: false,
        error: "Missing voucherCode or userAddress",
      });
    }

    console.log(`📝 Redeeming voucher ${voucherCode} for ${userAddress}`);

    // Redeem voucher with auto-swap enabled (10% will be swapped for gas automatically by the contract)
    const result = await contractService.redeemVoucher(
      voucherCode,
      userAddress,
      true, // Enable auto-swap - contract handles the 10% gas reserve
    );

    console.log(
      `✅ Redemption successful: ${result.tokenAmount} TXTC received, ${result.ethAmount} ETH for gas`,
    );

    // The contract automatically:
    // 1. Mints full amount to user
    // 2. Takes 10% for gas reserve
    // 3. Swaps that 10% to ETH via Uniswap
    // 4. Sends ETH to user
    // User ends up with: 90% TXTC + ETH for gas

    // Send SMS notification about the deposit
    if (twilioClient && twilioPhoneNumber && userPhone) {
      try {
        // tokenAmount and ethAmount are already formatted strings from contract service
        const txtcAmount = result.tokenAmount;
        const ethAmount = result.ethAmount;
        const message = `✅ Voucher redeemed!\n\nReceived:\n${txtcAmount} TXTC\n${ethAmount} ETH (gas)\n\nReply BALANCE to check.`;
        
        await twilioClient.messages.create({
          body: message,
          from: twilioPhoneNumber,
          to: userPhone,
        });
        console.log(`📱 SMS notification sent to ${userPhone}`);
      } catch (smsError: any) {
        console.error(`⚠️  Failed to send SMS notification: ${smsError.message}`);
      }
    }

    res.json({
      success: true,
      tokenAmount: result.tokenAmount,
      ethAmount: result.ethAmount,
      txHash: result.txHash,
    });
  } catch (error: any) {
    console.error("❌ Redeem error:", error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STEP 2: BALANCE Endpoint
// ============================================================================
app.get("/api/balance/:address", async (req, res) => {
  try {
    const { address } = req.params;

    console.log(`📊 Getting balance for ${address}`);

    const [txtcBalance, ethBalance] = await Promise.all([
      contractService.getTokenBalance(address),
      contractService.getEthBalance(address),
    ]);

    res.json({
      success: true,
      address,
      balances: {
        txtc: txtcBalance,
        eth: ethBalance,
      },
    });
  } catch (error: any) {
    console.error("❌ Balance error:", error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STEP 2b: BUY Endpoint — Purchase TXTC with Lycamobile airtime (via Reloadly)
// ============================================================================
app.post("/api/buy", async (req, res) => {
  try {
    const { userAddress, amount, userPhone } = req.body;

    if (!userAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing userAddress or amount",
      });
    }

    console.log(`💰 BUY: ${amount} EUR airtime → TXTC for ${userAddress}`);

    // Respond immediately to avoid Twilio timeout
    res.json({ success: true, message: "Buy initiated" });

    // Process async
    (async () => {
      try {
        // Step 1: Deduct airtime via Reloadly (Lycamobile)
        const reloadlyToken = await getReloadlyToken();
        const baseUrl = process.env.RELOADLY_SANDBOX !== 'false'
          ? 'https://topups-sandbox.reloadly.com'
          : 'https://topups.reloadly.com';

        // Auto-detect operator
        const cleanPhone = (userPhone || '').replace(/^\+/, '');
        const countryCode = process.env.LYCAMOBILE_COUNTRY_CODE || 'IE';

        const opResponse = await fetch(
          `${baseUrl}/operators/auto-detect/phone/${cleanPhone}/countries/${countryCode}`,
          { headers: { 'Authorization': `Bearer ${reloadlyToken}`, 'Accept': 'application/com.reloadly.topups-v1+json' } }
        );
        const opData = await opResponse.json() as any;

        if (!opData.operatorId) {
          throw new Error('Could not detect operator for this number');
        }

        // Get fixed amounts
        const fixedAmounts: number[] = opData.fixedAmounts || [];
        const denomType = opData.denominationType;
        let sendAmount = parseFloat(amount);

        if (denomType === 'FIXED' && fixedAmounts.length > 0) {
          const valid = fixedAmounts.filter((a: number) => a >= sendAmount);
          sendAmount = valid.length > 0 ? valid[0] : fixedAmounts[0];
          console.log(`   Fixed denomination: requested ${amount}, sending ${sendAmount}`);
        }

        // Send top-up
        const topupResponse = await fetch(`${baseUrl}/topups`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${reloadlyToken}`,
            'Accept': 'application/com.reloadly.topups-v1+json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            operatorId: opData.operatorId,
            amount: sendAmount,
            useLocalAmount: false,
            customIdentifier: `txtc_${Date.now()}`,
            recipientPhone: { countryCode, number: cleanPhone },
          }),
        });

        const topupData = await topupResponse.json() as any;

        if (!topupData.transactionId) {
          throw new Error(topupData.message || 'Airtime top-up failed');
        }

        console.log(`   ✅ Airtime sent: TX ${topupData.transactionId}`);
        const deliveredEur = topupData.deliveredAmount || sendAmount;

        // Step 2: Calculate TXTC amount (100 TXTC per USD, convert EUR→USD)
        const eurToUsd = parseFloat(process.env.EUR_TO_USD_RATE || '1.08');
        const usdAmount = deliveredEur * eurToUsd;
        const txtcRate = parseFloat(process.env.USD_TO_TXTC_RATE || '100');
        const totalTxtc = usdAmount * txtcRate;
        const txtcToUser = totalTxtc * 0.9;  // 90% to user
        const txtcForGas = totalTxtc * 0.1;  // 10% swapped for ETH gas

        console.log(`   📊 ${deliveredEur} EUR → ${totalTxtc} TXTC (${txtcToUser} to user, ${txtcForGas} for gas)`);

        // Step 3: Mint TXTC to user
        const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
        const signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const tokenContract = new ethers.Contract(
          SEPOLIA_CONFIG.contracts.tokenXYZ,
          ["function mint(address to, uint256 amount)"],
          signer,
        );

        const mintAmount = ethers.parseEther(txtcToUser.toFixed(4));
        const mintTx = await tokenContract.mint(userAddress, mintAmount);
        await mintTx.wait();
        console.log(`   ✅ Minted ${txtcToUser.toFixed(2)} TXTC to ${userAddress}`);

        // Step 4: Send SMS confirmation
        if (twilioClient && twilioPhoneNumber && userPhone) {
          const pinInfo = topupData.pinDetail?.code
            ? `\nPIN: ${topupData.pinDetail.code}`
            : '';
          await twilioClient.messages.create({
            body: `✅ Purchase complete!\n\n€${deliveredEur} airtime → ${txtcToUser.toFixed(2)} TXTC${pinInfo}\n\nReply BALANCE to check.`,
            from: twilioPhoneNumber,
            to: userPhone,
          });
        }
      } catch (error: any) {
        console.error("❌ Buy error:", error.message);
        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            await twilioClient.messages.create({
              body: `❌ Purchase failed: ${error.message}\n\nTry again later.`,
              from: twilioPhoneNumber,
              to: userPhone,
            });
          } catch {}
        }
      }
    })();
  } catch (error: any) {
    console.error("❌ Buy initiation error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// STEP 3: SWAP Endpoint (Async processing with SMS notification)
// ============================================================================
app.post("/api/swap", async (req, res) => {
  try {
    const { userAddress, tokenAmount, minEthOut = "0", userPhone } = req.body;

    if (!userAddress || !tokenAmount) {
      return res.status(400).json({
        success: false,
        error: "Missing userAddress or tokenAmount",
      });
    }

    console.log(`🔄 Swapping ${tokenAmount} TXTC to ETH for ${userAddress}`);

    // Respond immediately to avoid Twilio timeout
    res.json({
      success: true,
      message: "Swap initiated",
    });

    // Process swap asynchronously
    (async () => {
      try {
        const result = await contractService.swapTokenForEth(
          userAddress,
          tokenAmount,
          minEthOut,
        );

        console.log(`✅ Swap successful: ${result.ethReceived} ETH received`);

        // Send SMS notification if phone number provided
        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            const message = `✅ Swap complete!\n\n${tokenAmount} TXTC → ${result.ethReceived} ETH\n\nReply BALANCE to check.`;
            
            await twilioClient.messages.create({
              body: message,
              from: twilioPhoneNumber,
              to: userPhone,
            });
            console.log(`📱 Swap notification sent to ${userPhone}`);
          } catch (smsError: any) {
            console.error(`⚠️  Failed to send swap notification: ${smsError.message}`);
          }
        }
      } catch (error: any) {
        console.error("❌ Swap error:", error.message);
        
        // Send error notification if phone number provided
        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            await twilioClient.messages.create({
              body: "❌ Swap failed. Please try again later.",
              from: twilioPhoneNumber,
              to: userPhone,
            });
          } catch (smsError: any) {
            console.error(`⚠️  Failed to send error notification: ${smsError.message}`);
          }
        }
      }
    })();
  } catch (error: any) {
    console.error("❌ Swap initiation error:", error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STEP 4: SEND Endpoint (Token Transfer)
// ============================================================================
app.post("/api/send", async (req, res) => {
  try {
    const { userPrivateKey, toAddress, amount } = req.body;

    if (!userPrivateKey || !toAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing userPrivateKey, toAddress, or amount",
      });
    }

    console.log(`💸 Sending ${amount} TXTC to ${toAddress}`);

    // Create wallet from user's private key
    const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
    const userWallet = new ethers.Wallet(userPrivateKey, provider);
    const fromAddress = await userWallet.getAddress();

    console.log(`From: ${fromAddress}`);

    // Create token contract instance
    const tokenContract = new ethers.Contract(
      SEPOLIA_CONFIG.contracts.tokenXYZ,
      ["function transfer(address to, uint256 amount) returns (bool)"],
      userWallet,
    );

    // Execute transfer
    const amountWei = ethers.parseEther(amount);
    const tx = await tokenContract.transfer(toAddress, amountWei);

    console.log(`TX sent: ${tx.hash}`);
    await tx.wait();
    console.log(`✅ Transfer confirmed`);

    res.json({
      success: true,
      txHash: tx.hash,
    });
  } catch (error: any) {
    console.error("❌ Send error:", error.message);

    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STEP 5a: Yellow Network Settlement (mint TXTC on-chain after batch)
// ============================================================================
app.post("/api/yellow/settle", async (req, res) => {
  try {
    const { recipientAddress, amount, txId, token, fromAddress, senderKey, userPhone } = req.body;

    if (!recipientAddress || !amount) {
      return res.status(400).json({
        success: false,
        error: "Missing recipientAddress or amount",
      });
    }

    const tokenType = (token || "TXTC").toUpperCase();
    console.log(`⛓️  Yellow Settlement: ${amount} ${tokenType} → ${recipientAddress} [${txId}]`);

    const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);

    let txHash: string;

    if (tokenType === "ETH") {
      // ETH: send from user's wallet using their key
      let signer;
      if (senderKey) {
        signer = new ethers.Wallet(senderKey, provider);
        console.log(`   Sending ETH from user wallet ${fromAddress}`);
      } else {
        signer = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        console.log(`   ⚠️ No sender key, using backend wallet`);
      }
      const amountWei = ethers.parseEther(amount);
      const tx = await signer.sendTransaction({ to: recipientAddress, value: amountWei });
      await tx.wait();
      txHash = tx.hash;
    } else {
      // TXTC: mint to recipient (sender already debited off-chain by Yellow)
      const backendSigner = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
      const tokenContract = new ethers.Contract(
        SEPOLIA_CONFIG.contracts.tokenXYZ,
        ["function mint(address to, uint256 amount)"],
        backendSigner,
      );
      const amountWei = ethers.parseEther(amount);

      console.log(`   Minting ${amount} TXTC to ${recipientAddress} (sender debited off-chain)`);
      const mintTx = await tokenContract.mint(recipientAddress, amountWei);
      await mintTx.wait();
      txHash = mintTx.hash;
    }

    console.log(`   ✅ Settled: ${txHash}`);

    // Send SMS notification to sender
    if (twilioClient && twilioPhoneNumber && userPhone) {
      try {
        await twilioClient.messages.create({
          body: `✅ Sent ${amount} ${tokenType} to ${recipientAddress.slice(0, 10)}...\n\nSettled via Yellow Network.\nReply BALANCE to check.`,
          from: twilioPhoneNumber,
          to: userPhone,
        });
      } catch (smsError: any) {
        console.error(`⚠️  SMS error: ${smsError.message}`);
      }
    }

    // Send SMS notification to recipient
    if (twilioClient && twilioPhoneNumber) {
      try {
        const recipientUser = await getUserByWallet(recipientAddress);
        if (recipientUser && recipientUser.phone !== userPhone) {
          const senderLabel = fromAddress ? fromAddress.slice(0, 10) + '...' : 'another user';
          await twilioClient.messages.create({
            body: `✅ Received ${amount} ${tokenType} from ${senderLabel}\n\nSettled via Yellow Network.\nReply BALANCE to check.`,
            from: twilioPhoneNumber,
            to: recipientUser.phone,
          });
          console.log(`   📱 Recipient notified: ${recipientUser.phone}`);
        }
      } catch (smsError: any) {
        console.error(`⚠️  Recipient SMS error: ${smsError.message}`);
      }
    }

    res.json({
      success: true,
      txHash,
      recipient: recipientAddress,
      amount,
      token: tokenType,
    });
  } catch (error: any) {
    console.error("❌ Settlement error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// STEP 5b: SEND via Yellow Network (Instant Finality)
// ============================================================================
app.post("/api/send-yellow", async (req, res) => {
  try {
    const { fromAddress, toAddress, amount, token, userPhone, senderKey } = req.body;

    if (!fromAddress || !toAddress || !amount || !token) {
      return res.status(400).json({
        success: false,
        error: "Missing fromAddress, toAddress, amount, or token",
      });
    }

    console.log(`🟡 Yellow Send: ${amount} ${token} from ${fromAddress} to ${toAddress}`);

    // Queue transaction with Yellow batch service
    try {
      const yellowResponse = await fetch("http://yellow:8083/api/yellow/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientAddress: toAddress,
          amount: amount,
          userPhone: userPhone || "",
          token: token,
          fromAddress: fromAddress,
          senderKey: senderKey || "",
        }),
      });

      const yellowResult = await yellowResponse.json() as any;

      if (yellowResult.success) {
        console.log(`✅ Queued via Yellow: ${yellowResult.transactionId}`);

        // Send SMS notification
        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            await twilioClient.messages.create({
              body: `✅ Transfer queued!\n\n${amount} ${token} → ${toAddress.slice(0, 10)}...\n\nProcessing via Yellow Network (instant finality).`,
              from: twilioPhoneNumber,
              to: userPhone,
            });
          } catch (smsError: any) {
            console.error(`⚠️  SMS error: ${smsError.message}`);
          }
        }

        res.json({
          success: true,
          transactionId: yellowResult.transactionId,
          message: "Queued via Yellow Network",
          estimatedProcessing: "Within 3 minutes",
        });
      } else {
        throw new Error(yellowResult.error || "Yellow service error");
      }
    } catch (yellowError: any) {
      // Fallback to direct on-chain transfer if Yellow is unavailable
      console.log(`⚠️  Yellow unavailable (${yellowError.message}), falling back to on-chain`);

      const provider = new ethers.JsonRpcProvider(SEPOLIA_CONFIG.rpcUrl);
      
      if (token.toUpperCase() === "TXTC") {
        // Mint to recipient (sender debited off-chain by Yellow)
        const amountWei = ethers.parseEther(amount);
        const backendSigner = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
        const tokenContract = new ethers.Contract(
          SEPOLIA_CONFIG.contracts.tokenXYZ,
          [
            "function mint(address to, uint256 amount)",
          ],
          backendSigner,
        );

        console.log(`   Minting ${amount} TXTC to ${toAddress} (sender debited off-chain)`);
        const mintTx = await tokenContract.mint(toAddress, amountWei);
        await mintTx.wait();

        console.log(`✅ On-chain TXTC transfer complete`);

        // Send SMS notification
        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            await twilioClient.messages.create({
              body: `✅ Sent ${amount} TXTC to ${toAddress.slice(0, 10)}...\n\nReply BALANCE to check.`,
              from: twilioPhoneNumber,
              to: userPhone,
            });
          } catch (smsError: any) {
            console.error(`⚠️  SMS error: ${smsError.message}`);
          }
        }

        res.json({
          success: true,
          message: "Transfer complete (on-chain fallback)",
          txHash: mintTx.hash,
        });
      } else if (token.toUpperCase() === "ETH") {
        // Use sender's private key (passed from SMS handler) to send from their wallet
        let senderSigner;
        if (senderKey) {
          senderSigner = new ethers.Wallet(senderKey, provider);
          console.log(`   Sending ETH from user wallet ${fromAddress}`);
        } else {
          // Fallback to backend wallet if sender key not provided
          senderSigner = new ethers.Wallet(process.env.PRIVATE_KEY!, provider);
          console.log(`   ⚠️ No sender key, using backend wallet`);
        }
        const amountWei = ethers.parseEther(amount);
        const tx = await senderSigner.sendTransaction({
          to: toAddress,
          value: amountWei,
        });
        await tx.wait();

        console.log(`✅ On-chain ETH transfer complete: ${tx.hash}`);

        if (twilioClient && twilioPhoneNumber && userPhone) {
          try {
            await twilioClient.messages.create({
              body: `✅ Sent ${amount} ETH to ${toAddress.slice(0, 10)}...\n\nReply BALANCE to check.`,
              from: twilioPhoneNumber,
              to: userPhone,
            });
          } catch (smsError: any) {
            console.error(`⚠️  SMS error: ${smsError.message}`);
          }
        }

        res.json({
          success: true,
          message: "Transfer complete (on-chain fallback)",
          txHash: tx.hash,
        });
      } else {
        res.status(400).json({
          success: false,
          error: `Unsupported token: ${token}`,
        });
      }
    }
  } catch (error: any) {
    console.error("❌ Send-Yellow error:", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// Utility Endpoints
// ============================================================================

// Get current pool price
app.get("/api/price", async (req, res) => {
  try {
    const price = await contractService.getCurrentPrice();

    res.json({
      success: true,
      price,
      description: "1 TXTC = " + price + " ETH",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get swap quote
app.post("/api/quote", async (req, res) => {
  try {
    const { amount, isTokenToEth = true } = req.body;

    const quote = await contractService.estimateSwapOutput(
      amount,
      isTokenToEth,
    );

    res.json({
      success: true,
      inputAmount: amount,
      outputAmount: quote,
      direction: isTokenToEth ? "TXTC → ETH" : "ETH → TXTC",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Contract addresses info
app.get("/api/contracts", (req, res) => {
  res.json({
    success: true,
    network: SEPOLIA_CONFIG.network,
    chainId: SEPOLIA_CONFIG.chainId,
    contracts: SEPOLIA_CONFIG.contracts,
    etherscan: SEPOLIA_CONFIG.etherscan.baseUrl,
  });
});

// ============================================================================
// ENS Endpoints
// ============================================================================

// Check ENS name availability
app.get('/api/ens/check/:ensName', async (req, res) => {
  try {
    const { ensName } = req.params;
    const cleanName = ensName.toLowerCase().trim();
    
    const result = await ensService.checkAvailability(cleanName);
    
    res.json({
      success: true,
      available: result.available,
      ensName: result.available ? `${cleanName}.ttcip.eth` : undefined,
      reason: result.reason,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Register ENS subdomain
app.post('/api/ens/register', async (req, res) => {
  try {
    const { ensName, walletAddress } = req.body;
    
    if (!ensName || !walletAddress) {
      return res.status(400).json({
        success: false,
        error: 'Missing ensName or walletAddress',
      });
    }
    
    const cleanName = ensName.toLowerCase().trim();
    console.log(`📝 Registering ENS: ${cleanName}.ttcip.eth → ${walletAddress}`);
    
    const result = await ensService.registerSubdomain(cleanName, walletAddress);
    
    if (result.success) {
      res.json({
        success: true,
        ensName: result.ensName,
        walletAddress,
        txHash: result.txHash,
        message: `ENS name ${result.ensName} registered`,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Resolve ENS name to address
app.get('/api/ens/resolve/:ensName', async (req, res) => {
  try {
    const { ensName } = req.params;
    const address = await ensService.resolveAddress(ensName);
    
    if (address) {
      res.json({
        success: true,
        ensName,
        address,
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'ENS name not found',
      });
    }
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// ============================================================================
// POST /api/arc/notify — Send SMS notification (called by arc-service)
// Body: { phone: string, message: string }
// ============================================================================
app.post("/api/arc/notify", async (req, res) => {
  try {
    const { phone, message } = req.body;

    if (!phone || !message) {
      return res.status(400).json({
        success: false,
        error: "Missing phone or message",
      });
    }

    if (!twilioClient || !twilioPhoneNumber) {
      console.warn("⚠️  Twilio not configured — cannot send SMS");
      return res.status(503).json({
        success: false,
        error: "SMS service not configured",
      });
    }

    console.log(`📱 Sending notification to ${phone}`);
    const smsResult = await twilioClient.messages.create({
      body: message,
      from: twilioPhoneNumber,
      to: phone,
    });

    console.log(`✅ SMS sent: ${smsResult.sid}`);
    res.json({ success: true, messageSid: smsResult.sid });
  } catch (error: any) {
    console.error("❌ Notify error:", error.message);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Error handler
app.use(
  (
    err: any,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    console.error("Server error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
    });
  },
);

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🚀 Contract API Server Started");
  console.log("================================");
  console.log(`Port: ${PORT}`);
  console.log(`Network: ${SEPOLIA_CONFIG.network}`);
  console.log(`Chain ID: ${SEPOLIA_CONFIG.chainId}`);
  console.log("\n📋 Available Endpoints:");
  console.log("  POST /api/redeem    - Redeem voucher");
  console.log("  GET  /api/balance/:address - Get balance");
  console.log("  POST /api/swap      - Swap tokens for ETH");
  console.log("  POST /api/send      - Send tokens");
  console.log("  GET  /api/price     - Get current price");
  console.log("  POST /api/quote     - Get swap quote");
  console.log("  GET  /api/contracts - Contract addresses");
  console.log("  GET  /health        - Health check");
  console.log("\n✅ Ready to receive requests from SMS handler!");
  console.log("================================\n");

  // Start blockchain monitor for deposit detection (after short delay)
  setTimeout(() => {
    blockchainMonitor.start().catch((err: any) => {
      console.error('❌ Failed to start blockchain monitor:', err.message);
    });
  }, 3000);
});

export default app;
