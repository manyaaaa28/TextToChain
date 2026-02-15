import express from 'express';
import { AirtimeOrchestrator } from '../orchestrator/AirtimeOrchestrator';
import { verifyWebhookSecret, bypassWebhookAuth } from '../middleware/webhookAuth';

const router = express.Router();
const orchestrator = new AirtimeOrchestrator();

// Buy TXTC tokens with airtime
router.post('/airtime/buy', async (req, res) => {
  try {
    const { phoneNumber, airtimeAmount } = req.body;
    
    if (!phoneNumber || !airtimeAmount) {
      return res.status(400).json({
        success: false,
        error: 'Missing phoneNumber or airtimeAmount',
      });
    }
    
    console.log(`📱 Buy request: ${airtimeAmount} UGX from ${phoneNumber}`);
    
    const result = await orchestrator.buyTokensWithAirtime(phoneNumber, airtimeAmount);
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    console.error('❌ Buy error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Check airtime balance
router.get('/airtime/balance/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const balance = await orchestrator.checkAirtimeBalance(phoneNumber);
    
    res.json({
      success: true,
      ...balance,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get user token balance
router.get('/balance/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    
    const balance = await orchestrator.getUserBalance(phoneNumber);
    
    res.json({
      success: true,
      ...balance,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Get transaction history
router.get('/transactions/:phoneNumber', async (req, res) => {
  try {
    const { phoneNumber } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;
    
    const transactions = await orchestrator.getTransactionHistory(phoneNumber, limit);
    
    res.json({
      success: true,
      transactions,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Africa's Talking payment webhook (with verification)
router.post('/webhooks/payment', bypassWebhookAuth, async (req, res) => {
  try {
    console.log('💰 Payment webhook received:', req.body);
    
    const {
      transactionId,
      phoneNumber,
      value,
      status,
      provider,
    } = req.body;
    
    if (status !== 'Success') {
      console.log('❌ Payment failed:', status);
      return res.status(200).send('OK');
    }
    
    // Process the payment
    await orchestrator.buyTokensWithAirtime(phoneNumber, parseFloat(value));
    
    res.status(200).json({ success: true });
  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    res.status(200).send('OK'); // Always return 200 to Africa's Talking
  }
});

// USSD callback
router.post('/ussd/callback', async (req, res) => {
  try {
    const { sessionId, phoneNumber, text } = req.body;
    
    let response = '';
    
    if (text === '') {
      // Main menu
      response = `CON Welcome to TXTC
1. Buy Tokens
2. Check Balance
3. Transaction History`;
    } else if (text === '1') {
      // Buy tokens
      response = `CON Enter amount in UGX:`;
    } else if (text.startsWith('1*')) {
      // Process purchase
      const amount = parseInt(text.split('*')[1]);
      
      if (isNaN(amount) || amount < 1000) {
        response = `END Invalid amount. Minimum 1000 UGX.`;
      } else {
        // Initiate payment (Africa's Talking will handle)
        response = `END Payment request sent to your phone.
Please approve to complete purchase.`;
      }
    } else if (text === '2') {
      // Check balance
      const balance = await orchestrator.getUserBalance(phoneNumber);
      response = `END Your balance:
${balance.txtc} TXTC
${balance.eth} ETH

Wallet: ${balance.wallet ? balance.wallet.substring(0, 10) + '...' : 'None'}`;
    } else if (text === '3') {
      // Transaction history
      const txs = await orchestrator.getTransactionHistory(phoneNumber, 3);
      
      if (txs.length === 0) {
        response = `END No transactions yet.`;
      } else {
        response = `END Recent transactions:\n`;
        txs.forEach((tx, i) => {
          response += `${i + 1}. ${tx.txtcAmount} TXTC - ${tx.status}\n`;
        });
      }
    } else {
      response = `END Invalid option.`;
    }
    
    res.set('Content-Type', 'text/plain');
    res.send(response);
  } catch (error: any) {
    console.error('USSD error:', error);
    res.set('Content-Type', 'text/plain');
    res.send('END Service temporarily unavailable.');
  }
});

export default router;
