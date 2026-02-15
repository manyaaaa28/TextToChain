# Text-to-Chain

**DeFi over SMS for 2.5 billion feature phone users**

Text-to-Chain is a full-stack SMS-based DeFi platform. Users interact with blockchain using only text messages: no smartphone, no app, no MetaMask.

> Send `JOIN alice` to create a wallet. Send `SEND 10 TXTC TO bob.ttcip.eth` to transfer tokens.

---

## The Problem

For many people, joining the global economy is not about convenience. It is about access.

Most still have no banks, internet, app stores, or digital wallets. Sometimes infrastructure was never built; sometimes it was destroyed; sometimes it is simply out of reach. The reasons differ. The result is the same: people who should benefit from the digital revolution are cut off from participation.

The real challenge is not adoption. It is inclusion. How do we include unbanked people with no internet or smartphone?

### Access barriers

- **No smartphones** — Billions rely on feature phones with no app stores or browsers. Existing crypto wallets require smartphones and internet.
- **No banking** — 1.4 billion adults are unbanked globally. Traditional DeFi assumes bank accounts for on/off ramps.
- **No bridge** — Seed phrases, gas fees, chain switching are overwhelming. No solution today connects SMS-native users to on-chain DeFi.

### Scale

- **2.5B** feature phone users worldwide  
- **$0** in DeFi accessible to them  
- **Zero** SMS-native DeFi platforms exist today  

---

## The Solution

Instead of asking people to get better phones, internet, or government, we asked: what if Web3 worked over SMS?

Text-to-Chain turns a basic phone into a blockchain wallet using plain text messages. No smartphone. No apps. No browser extensions. SMS to create a wallet. SMS to check balance. SMS to send money, swap tokens, or cash out. Under the hood it is real DeFi — wallets, smart contracts, on-chain settlement. For the user it is as simple as texting. Someone with a feature phone can own assets, move value, and participate in the global economy.

We are not simplifying finance. We are making it accessible to anyone.

### Capabilities

**SMS-native interface**  
13+ commands for wallets, transfers, swaps, bridges, and more. Works on any phone that can send a text.

**Instant transfers (Yellow Network)**  
Off-chain batching reduces gas costs by up to 67%. State channels for near-instant settlement. Small transfers become viable where each cent matters.

**On-chain swaps (Uniswap V3)**  
Swap TXTC for ETH from SMS. Custom liquidity pool, 0.3% fee tier.

**Cross-chain cashout (Circle CCTP)**  
Convert TXTC to USDC and bridge to Arc Testnet in one SMS. Circle Developer-Controlled Wallets per user. CCTP V2 Fast Transfer (~20s attestation).

**Cross-chain bridge (Li.Fi)**  
Bridge tokens across 7+ chains (Ethereum, Polygon, Base, Arbitrum, etc.). Aggregates 20+ bridges for best execution.

**ENS identity**  
`JOIN alice` registers `alice.ttcip.eth` on-chain. Human-readable addresses for SMS transfers.

**Airtime-to-token**  
Buy TXTC with mobile airtime (MTN, Airtel). USSD menu for feature phone users in Africa.

---

## Technical Architecture

### Core Technologies

| Technology | Purpose |
|------------|---------|
| **Rust + Axum** | High-performance SMS webhook handler |
| **Solidity + Foundry** | Smart contracts with 102 passing tests |
| **ethers.js v6** | Blockchain interactions |
| **Circle CCTP V2** | Cross-chain USDC bridging |
| **Uniswap V3** | On-chain token swaps |
| **Li.Fi SDK** | Multi-chain bridge aggregation |
| **Docker Compose** | One-command deployment |

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                          USER LAYER                             │
│                                                                 │
│   Feature Phone ──► SMS ──► Twilio ──► HTTPS (Caddy/sslip.io)   │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│               SMS REQUEST HANDLER (Rust · Port 8080)            │
│                                                                 │
│   Command Parser ─── User Auth ─── PostgreSQL ─── Router        │
│   (13+ commands)     (phone→wallet)  (users, vouchers)          │
└───────┬──────────┬──────────────┬───────────────┬───────────────┘
        │          │              │               │
        ▼          ▼              ▼               ▼
┌──────────┐ ┌──────────┐ ┌───────────┐ ┌────────────────┐
│ Backend  │ │ Yellow   │ │ Arc/CCTP  │ │ Airtime        │
│ API      │ │ Network  │ │ Service   │ │ Service        │
│ :3000    │ │ :8083    │ │ :8084     │ │ :8082          │
│          │ │          │ │           │ │                │
│ Redeem   │ │ Batch    │ │ CASHOUT   │ │ Airtime→Token  │
│ Balance  │ │ Transfer │ │ CCTP V2   │ │ USSD Menu      │
│ Swap     │ │ Nitrolite│ │ Circle    │ │ Africa's       │
│ ENS      │ │ Settle   │ │ Wallets   │ │ Talking        │
│ Bridge   │ │          │ │           │ │                │
└────┬─────┘ └────┬─────┘ └─────┬─────┘ └────────────────┘
     │            │             │
     ▼            ▼             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ETHEREUM SEPOLIA                             │
│                                                                 │
│   TXTC Token ─── VoucherManager ─── Uniswap V3 Pool             │
│   EntryPointV3 ─── ENS Registrar ─── TokenMessengerV2 (CCTP)    │
└─────────────────────────────┬───────────────────────────────────┘
                              │ CCTP depositForBurn
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      ARC TESTNET                                │
│                                                                 │
│   USDC (native) ─── Circle Wallets (per user) ─── Batch Payout  │
└─────────────────────────────────────────────────────────────────┘
```

→ **[Vision & Mission](docs/vision-and-mission.md)** — what Text-to-Chain is about and why we build it.  
→ **[Technical Overview](docs/technical-overview.md)** — deep dive: onboarding, features, architecture, trust model (TEE / secure server).

---

## SMS Commands

| Command | Description | Example |
|---------|-------------|---------|
| `JOIN <name>` | Create wallet + ENS subdomain | `JOIN alice` |
| `BALANCE` | Check TXTC and ETH balances | `BALANCE` |
| `DEPOSIT` | Get your wallet address | `DEPOSIT` |
| `REDEEM <code>` | Redeem voucher for TXTC tokens | `REDEEM 766F58CA` |
| `SEND <amt> <token> TO <recipient>` | Transfer tokens (Yellow Network batched) | `SEND 10 TXTC TO bob.ttcip.eth` |
| `SWAP <amt> TXTC` | Swap TXTC → ETH via Uniswap V3 | `SWAP 5 TXTC` |
| `CASHOUT <amt> TXTC` | Convert TXTC → USDC on Arc (CCTP) | `CASHOUT 10 TXTC` |
| `BRIDGE <amt> <token> FROM <chain> TO <chain>` | Cross-chain bridge via Li.Fi | `BRIDGE 10 USDC FROM POLYGON TO BASE` |
| `SAVE <name> <phone>` | Save a contact | `SAVE alice +919876543210` |
| `CONTACTS` | List saved contacts | `CONTACTS` |
| `CHAIN <name>` | Switch active chain | `CHAIN polygon` |
| `PIN <xxxx>` | Set/change security PIN | `PIN 1234` |
| `HELP` | Show available commands | `HELP` |

---

## Project Structure

```
Text-to-Chain/
│
├── sms-request-handler/        # Rust SMS webhook + command parser
│   ├── src/commands/           #   Command parsing & routing
│   ├── src/sms/                #   Twilio webhook handler
│   ├── src/db/                 #   PostgreSQL (users, vouchers, contacts)
│   └── src/wallet/             #   Wallet creation & chain config
│
├── backend-integration/        # TypeScript API server (Port 3000)
│   ├── api-server.ts           #   Express endpoints (swap, redeem, balance, ENS)
│   ├── contract-service.ts     #   Smart contract interactions
│   ├── lifi-service.ts         #   Li.Fi bridge aggregation
│   ├── ens-service.ts          #   ENS subdomain registration
│   └── blockchain-monitor.ts   #   Deposit detection service
│
├── yellow/                     # Yellow Network batch service (Port 8083)
│   └── src/
│       ├── batch-service.ts    #   Nitrolite SDK, 3-min batch loop
│       └── api-server.ts       #   Queue/status/pending endpoints
│
├── arc-service/                # Arc/Circle CCTP cashout (Port 8084)
│   └── src/
│       ├── index.ts            #   Express API (cashout, wallet, treasury)
│       ├── cashout-service.ts  #   TXTC→WETH→USDC swap + CCTP bridge
│       └── circle-wallet.ts    #   Circle Developer-Controlled Wallets
│
├── Liquidity-pools/            # Solidity smart contracts (Foundry)
│   ├── src/
│   │   ├── TokenXYZ.sol        #   TXTC ERC20 (mint, burn, burnFromAny)
│   │   ├── VoucherManager.sol  #   Shop staking, voucher gen/redeem
│   │   ├── EntryPointV3.sol    #   Backend orchestration hub
│   │   └── UniswapV3PoolManager.sol  # Uniswap V3 pool management
│   └── test/                   #   102 Foundry tests (100% on core contracts)
│
├── ens_service/                # Rust ENS integration
│   └── src/
│       ├── ens.rs              #   Namehash, registry bindings
│       └── register.rs         #   Commit-reveal registration
│
├── airtime-service/            # Airtime-to-token conversion (Port 8082)
├── front/                      # Web frontend
├── docker-compose.yml          # One-command deployment
└── Caddyfile                   # Auto-HTTPS reverse proxy (sslip.io)
```

---

## Smart Contracts

Deployed on **Ethereum Sepolia** with **102 Foundry tests** passing.

| Contract | Address | Description |
|----------|---------|-------------|
| **TXTC Token** | [`0x4d054F...698B`](https://sepolia.etherscan.io/address/0x4d054FB258A260982F0bFab9560340d33D9E698B) | ERC20 with minter roles and `burnFromAny` |
| **VoucherManager** | [`0x3094e5...2990`](https://sepolia.etherscan.io/address/0x3094e5820F911f9119D201B9E2DdD4b9cf792990) | Shop staking, voucher generation & redemption |
| **EntryPointV3** | [`0x6b5b8b...d240`](https://sepolia.etherscan.io/address/0x6b5b8b917f3161aeb72105b988E55910e231d240) | Backend orchestration for swaps & redemptions |
| **PoolManager** | [`0xd9794c...fc8`](https://sepolia.etherscan.io/address/0xd9794c0daC0382c11F6Cf4a8365a8A49690Dcfc8) | Uniswap V3 TXTC/WETH pool management |
| **Uniswap V3 Pool** | [`0xfAFFB1...d407`](https://sepolia.etherscan.io/address/0xfAFFB106AC76424C30999d15eB0Ad303d2Add407) | TXTC/WETH 1% fee tier (500 TXTC : 1 ETH) |

### Test Coverage

```
| Contract              | Lines   | Statements | Branches | Functions |
|-----------------------|---------|------------|----------|-----------|
| TokenXYZ.sol          | 100.00% | 100.00%    | 100.00%  | 100.00%   |
| VoucherManager.sol    | 100.00% | 100.00%    | 93.94%   | 100.00%   |
| EntryPointV3.sol      | 77.55%  | 69.57%     | 82.14%   | 100.00%   |
| UniswapV3PoolManager  | 39.68%  | 23.81%     | 50.00%   | 100.00%   |
```

> PoolManager coverage is lower because swap/liquidity functions require a live Uniswap V3 pool. All function entry points and access control paths are fully tested.

---

## Key Flows

### SEND Flow (Yellow Network Batching)

```
SMS: "SEND 10 TXTC TO alice.ttcip.eth"
  → Queue in Yellow batch service
  → Wait for 3-minute batch window
  → Open Nitrolite state channel session
  → Off-chain transfer via Yellow Network
  → On-chain settlement: mint TXTC to recipient
  → SMS: "Sent 10 TXTC to alice.ttcip.eth"
```

### CASHOUT Flow (TXTC → USDC on Arc)

```
SMS: "CASHOUT 10 TXTC"
  → Burn TXTC from user wallet
  → Swap TXTC → WETH (Uniswap V3, 0.3% pool)
  → Swap WETH → USDC (Uniswap V3, 0.05% pool)
  → CCTP depositForBurn (Sepolia → Arc, domain 0 → 26)
  → Circle Iris API attestation (~20s Fast Transfer)
  → receiveMessage on Arc → USDC minted to user's Circle Wallet
  → SMS: "Cashout complete! 10 TXTC → ~$240 USDC"
```

### SWAP Flow

```
SMS: "SWAP 5 TXTC"
  → Burn 5 TXTC from user wallet
  → Mint 5 TXTC to backend
  → Approve SwapRouter
  → exactInputSingle (TXTC → WETH, 0.3% pool)
  → Unwrap WETH → ETH
  → Send ETH to user wallet
  → SMS: "Swapped 5 TXTC → 0.01135 ETH"
```

---

## Quick Start

### Prerequisites

- **Docker & Docker Compose** (required)
- **Rust** (latest stable) — for local SMS handler development
- **Node.js v18+** — for local backend development
- **Foundry** — for smart contract testing

### Installation

```bash
# Clone the repository
git clone https://github.com/ArcReactor9/Text-to-Chain.git
cd Text-to-Chain

# Copy environment files (see below for required variables)
cp backend-integration/.env.example backend-integration/.env
cp arc-service/.env.example arc-service/.env
cp yellow/.env.example yellow/.env
cp sms-request-handler/.env.example sms-request-handler/.env

# Start all services
docker compose up -d --build

# Services running:
#   sms-handler  :8080  — Rust SMS webhook
#   backend      :3000  — TypeScript API
#   yellow       :8083  — Yellow Network batch
#   arc          :8084  — Arc/CCTP cashout
#   airtime      :8082  — Airtime service
#   caddy        :443   — Auto-HTTPS reverse proxy
#   postgres     :5432  — Database
```

### Environment Variables

**`backend-integration/.env`**
```env
PRIVATE_KEY=0x...                    # Backend wallet (Sepolia)
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+18449862896
```

**`arc-service/.env`**
```env
PRIVATE_KEY=0x...                    # Same backend wallet
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
CIRCLE_API_KEY=...                   # Circle Developer Console
CIRCLE_ENTITY_SECRET=...            # Circle entity secret
```

**`yellow/.env`**
```env
PRIVATE_KEY=0x...
ALCHEMY_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Run Smart Contract Tests

```bash
cd Liquidity-pools
forge test -vv          # 102 tests
forge coverage          # Coverage report
```

---

## Deployment

### AWS EC2 (Production)

```bash
# On EC2 (Ubuntu 24.04)
sudo apt update && sudo apt install -y docker.io docker-compose-v2 git
sudo usermod -aG docker ubuntu && newgrp docker

git clone https://github.com/ArcReactor9/Text-to-Chain.git
cd Text-to-Chain

# Copy .env files, then:
docker compose up -d --build
```

Caddy auto-provisions HTTPS via **sslip.io** — no manual certificate management.

Set your Twilio webhook to: `https://<EC2-IP-WITH-DASHES>.sslip.io/sms/webhook`

---

## Security

- **No private key storage** — user wallets are on-chain only
- **Environment variables** — all secrets in `.env` files (never committed)
- **Owner-only functions** — `mint`, `burnFromAny`, `emergencyWithdraw` restricted
- **Authorized backends** — `EntryPointV3` uses allowlist for backend callers
- **ReentrancyGuard** — on all state-changing contract functions
- **PIN protection** — optional PIN for transaction authorization

---

## Built With

| Partner / Sponsor | Integration |
|-------------------|-------------|
| **Circle** | Arc Testnet, USDC, CCTP V2, Developer-Controlled Wallets |
| **Yellow Network** | Nitrolite SDK, off-chain state channels, batch settlement |
| **Uniswap** | V3 pools, SwapRouter, NonfungiblePositionManager |
| **ENS** | Subdomain registration (`*.ttcip.eth`) |
| **Twilio** | SMS gateway for global reach |
| **Reloadly** | Lycamobile airtime top-ups (50+ countries) |
| **Africa's Talking** | Airtime payments + USSD for feature phones |

---

## License

[MIT](LICENSE)

---
Built with love for AM HACKS 2.0 🤍
Built for the next billion: no smartphone, no app, no MetaMask. Just SMS.
