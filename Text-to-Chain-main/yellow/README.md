# Yellow Network Integration for Text-to-Chain

> **Enabling cost-efficient, instant token transfers for SMS-based DeFi**

The Yellow Network integration brings state channel technology to Text-to-Chain's SMS-based payment system, reducing gas costs by up to 67% while maintaining instant settlement. Users can send TXTC tokens via simple SMS commands like `SEND 10 TXTC TO alice.ttcip.eth`, and transactions are automatically batched for maximum efficiency.

**Part of the [Text-to-Chain](../README.md) SMS-based DeFi platform - bringing Web3 to 2.5 billion feature phone users.**

---

### Why Yellow Network for SMS Payments?

**The Problem:** Traditional blockchain transfers are expensive and slow
- Each SMS payment (`SEND 10 TXTC TO alice`) requires on-chain transaction
- Gas costs: ~0.003 ETH (~$9) per transfer
- Wait time: 15+ seconds for confirmation
- **Result:** Prohibitively expensive for feature phone users in developing countries

**The Yellow Network Solution:** Batch processing with state channels
- Queue multiple SMS payments from different users
- Open single Yellow Network state channel every 3 minutes
- Process all transfers **off-chain** with instant finality
- Close channel and settle on-chain once
- **Result:** 67-90% cost reduction, instant confirmation for users

### How State Channels Work

```
Traditional Approach (10 payments):
┌─────────────────────────────────────────┐
│ Payment 1: Open channel → Transfer → Close = 0.006 ETH │
│ Payment 2: Open channel → Transfer → Close = 0.006 ETH │
│ Payment 3: Open channel → Transfer → Close = 0.006 ETH │
│ ... (7 more payments)                   │
│ Total: 0.06 ETH (~$180)                │
└─────────────────────────────────────────┘

Yellow Network Batch (10 payments):
┌─────────────────────────────────────────┐
│ Open channel once        = 0.003 ETH   │
│ Transfer 1 (off-chain)   = 0 ETH       │
│ Transfer 2 (off-chain)   = 0 ETH       │
│ ... (8 more off-chain)                  │
│ Close & settle on-chain  = 0.003 ETH   │
│ Total: 0.006 ETH (~$18)                │
│ 💰 Savings: $162 (90%)                  │
└─────────────────────────────────────────┘
```

📚 **Learn More:**
- [Yellow Network Docs](https://docs.yellow.org/docs)
- [State Channels Explained](https://docs.yellow.org/docs/concepts/state-channels)
- [Nitrolite SDK](https://github.com/erc7824/nitrolite)

---

## 🎯 Key Features

### ⚡ Automatic SMS Payment Batching
- Users send `SEND 10 TXTC TO alice` via SMS
- Transactions automatically queued in memory
- Processed every 3 minutes in efficient batches
- SMS confirmation: "✅ Transfer queued! Processing within 3 minutes"

### 💰 Massive Cost Reduction
- **67% lower gas costs** for typical batch sizes (5-10 payments)
- **90% savings** for large batches (50+ payments)
- Single channel open/close for unlimited transfers
- Example: 100 SMS payments for the cost of 2 on-chain transactions

### 🚀 Instant User Experience
- Immediate SMS acknowledgment when payment queued
- Off-chain transfers complete in milliseconds
- No blockchain confirmation delays
- SMS notification when batch settles: "✅ 10 TXTC sent to alice.ttcip.eth"

### 🔄 Automatic Settlement
- On-chain TXTC token minting to recipients
- Auto-withdrawal of remaining funds
- Transparent custody management
- SMS notifications to all batch participants

### 📡 REST API for Integration
- Queue transactions: `POST /api/yellow/send`
- Check status: `GET /api/yellow/status`
- View pending: `GET /api/yellow/pending`
- Easy integration with SMS handler and other services

---

## 🏗️ Architecture in Text-to-Chain Ecosystem

```
┌──────────────────────────────────────────────────────────────┐
│                    USER LAYER (Feature Phones)               │
│  "SEND 10 TXTC TO alice"  →  SMS  →  Twilio                  │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│        SMS REQUEST HANDLER (Rust, Port 8080)                 │
│  • Parse "SEND" command                                      │
│  • Resolve recipient (alice → alice.ttcip.eth → 0x...)       │
│                                                              │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌──────────────────────────────────────────────────────────────┐
│      YELLOW NETWORK BATCH SERVICE (TypeScript, Port 8083)    │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Transaction Queue (In-Memory)                       │    │
│  │  • +919876543210: 10 TXTC → alice.ttcip.eth         │     │
│  │  • +918595057429: 5 TXTC → bob.ttcip.eth            │     │
│  │  • +917766554433: 20 TXTC → charlie.ttcip.eth       │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐     │
│  │  Batch Processor (3-minute intervals)                │    │
│  │  1. Check queue (min 1 transaction)                  │    │
│  │  2. Open Yellow Network state channel                │    │
│  │  3. Process ALL transfers off-chain                  │    │
│  │  4. Close channel & settle on-chain                  │    │
│  │  5. Mint TXTC to recipients (Sepolia)               │     │
│  │  6. Send SMS notifications via backend               │    │
│  └─────────────────────────────────────────────────────┘     │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌────────────────────────────────────────────────── ──────────── ┐
│           YELLOW NETWORK (Nitrolite SDK)                       │
│  • WebSocket: wss://clearnet-sandbox.yellow.com/ws             │
│  • Custody Address: 0x019B65A265EB3363822f2752141b3dF16131b262 │
│  • Asset: weth                  │
│  • Off-chain state channel transfers                           │
└────────────────────────┬────────────────────── ───────────── ──┘
                         │
                         ▼
┌──────────────────────────────────────────��───────────────────┐
│              ETHEREUM SEPOLIA TESTNET                         │
│  • TXTC Token: 0x4d054FB258A260982F0bFab9560340d33D9E698B     │
│  • ENS Registrar: 0xcD057A8AbF3832e65edF5d224313c6b4e6324F76  │
│  • On-chain settlement mints TXTC to recipients               │
└────────────────────────────────────────── ───────────────── ──┘
```
---

## Quick Start

### 1. Install Dependencies

```bash
cd yellow
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Required variables:
```env
PRIVATE_KEY=0x...                    # Your wallet private key
ALCHEMY_RPC_URL=https://...          # Sepolia RPC URL
PORT=8083                             # API server port (optional)
```

### 3. Run the Service

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

## API Usage

### Queue a Transaction

```bash
POST http://localhost:8083/api/yellow/send
Content-Type: application/json

{
  "recipientAddress": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
  "amount": "10",
  "userPhone": "+918595057429"
}
```

**Response:**
```json
{
  "success": true,
  "transactionId": "tx_1738842123_abc123",
  "message": "Transaction queued for next batch",
  "estimatedProcessing": "Within 3 minutes"
}
```

### Check Service Status

```bash
GET http://localhost:8083/api/yellow/status
```

**Response:**
```json
{
  "success": true,
  "sessionActive": true,
  "pendingTransactions": 5,
  "channelId": "0xabc123...",
  "sessionDuration": 45000
}
```

### View Pending Transactions

```bash
GET http://localhost:8083/api/yellow/pending
```

**Response:**
```json
{
  "success": true,
  "count": 3,
  "transactions": [
    {
      "id": "tx_1738842123_abc123",
      "recipientAddress": "0x742d35Cc...",
      "amount": "10",
      "asset": "ytest.usd",
      "userPhone": "+918595057429",
      "timestamp": 1738842123456
    }
  ]
}
```


### Security Checklist

- [ ] Private key stored in secure vault (AWS Secrets Manager, HashiCorp Vault)
- [ ] `.env` file not committed to Git
- [ ] API endpoints behind authentication/rate limiting
- [ ] HTTPS enabled for all external connections
- [ ] Wallet has minimal ETH (refill automatically)
- [ ] Monitoring alerts configured (PagerDuty, etc.)
- [ ] Backup Yellow Network endpoints configured
- [ ] Log rotation enabled (`pm2-logrotate`)

---

## 🌐 Yellow Network Resources

### Official Documentation
- **Main Docs:** [docs.yellow.org](https://docs.yellow.org)
- **API Reference:** [docs.yellow.org/api](https://docs.yellow.org/api)
- **Nitrolite SDK:** [github.com/erc7824/nitrolite](https://github.com/erc7824/nitrolite)
- **State Channels Guide:** [docs.yellow.org/concepts/state-channels](https://docs.yellow.org/concepts/state-channels)

### Community & Support
- **Website:** [yellow.org](https://yellow.org)
- **Discord:** [discord.gg/yellow](https://discord.gg/yellow)
- **Twitter:** [@Yellow](https://twitter.com/yellow)
- **Status Page:** [status.yellow.org](https://status.yellow.org)

### Developer Resources
- **Testnet Explorer:** [testnet.yellow.org](https://testnet.yellow.org)
- **Sandbox WebSocket:** `wss://clearnet-sandbox.yellow.com/ws`
- **Mainnet WebSocket:** `wss://clearnet.yellow.com/ws`
- **GitHub:** [github.com/yellow-org](https://github.com/yellow-org)

---

## 📚 Related Text-to-Chain Documentation

- **Main README:** [../README.md](../README.md) - Platform overview
- **SMS Handler:** [../sms-request-handler/README.md](../sms-request-handler/README.md) - Rust SMS processing
- **Backend API:** [../backend-integration/README.md](../backend-integration/README.md) - Contract interactions
- **Smart Contracts:** [../Liquidity-pools/README.md](../Liquidity-pools/README.md) - TXTC token, ENS
- **Arc/CCTP Service:** [../arc-service/README.md](../arc-service/README.md) - USDC cashout

---

---

## 🤝 Contributing

We welcome contributions! To add features or fix bugs:

1. Fork the repository
2. Create feature branch: `git checkout -b feature/yellow-improvements`
3. Test thoroughly with SMS integration
4. Submit pull request

**Areas for contribution:**
- Multi-token support (USDC, USDT)
- Dynamic batch sizing algorithms
- Advanced monitoring dashboards
- Mainnet deployment scripts
- Performance optimizations

---

## 🙏 Acknowledgments

- **Yellow Network** for providing state channel infrastructure
- **Nitrolite SDK** developers for the excellent TypeScript library
- **Text-to-Chain** community for supporting SMS-based DeFi
- **Feature phone users worldwide** who inspired this project

---

**Built with ❤️ for the next billion crypto users**

*Bringing Web3 to feature phones through Yellow Network's state channel technology*
