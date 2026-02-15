# 🔧 Backend Integration

> **TypeScript/Express API server — Port 3000**

Central API layer that bridges the SMS handler with smart contracts, Uniswap V3, ENS, Twilio, and Reloadly. Handles voucher redemption, token swaps, balance queries, ENS registration, deposit monitoring, and Lycamobile airtime purchases.

---

## Architecture

```
SMS Handler (Rust) ──▶ Backend API (Express, Port 3000)
                            │
                ┌───────────┼───────────────┐
                ▼           ▼               ▼
        ┌────────────┐ ┌──────────┐  ┌──────────────┐
        │  Contract   │ │   ENS    │  │  Blockchain  │
        │  Service    │ │  Service │  │   Monitor    │
        │ (swap,mint, │ │(register,│  │ (deposits,   │
        │  redeem)    │ │ resolve) │  │  SMS notify) │
        └──────┬─────┘ └────┬─────┘  └──────┬───────┘
               │             │               │
               ▼             ▼               ▼
        ┌──────────────────────────────────────────┐
        │         Ethereum Sepolia Testnet          │
        │  TXTC · VoucherManager · Uniswap V3 · ENS│
        └──────────────────────────────────────────┘
```

---

## Folder Structure

```
backend-integration/
├── api-server.ts           # Express API server — all endpoints
├── contract-service.ts     # Smart contract interactions (swap, redeem, mint, balance)
├── ens-service.ts          # ENS subdomain registration (*.ttcip.eth)
├── blockchain-monitor.ts   # Deposit detection + SMS notifications
├── deposit-monitor.ts      # Alchemy webhook-based deposit tracking
├── contracts.config.ts     # Contract addresses + pool config (Sepolia)
├── generate-vouchers.ts    # CLI tool to generate voucher codes on-chain
├── voucher-codes.md        # Active voucher codes reference
├── EntryPointV3.abi.json   # ABI files
├── TokenXYZ.abi.json       #
├── VoucherManager.abi.json #
├── UniswapV3PoolManager.abi.json
├── package.json            # Dependencies
├── tsconfig.json           # TypeScript config
├── Dockerfile              # Docker build
└── .env                    # Environment variables
```

---

## API Endpoints

### Core
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `POST` | `/api/redeem` | Redeem voucher → mint TXTC + send ETH gas |
| `GET` | `/api/balance/:address` | Get TXTC + ETH balance |
| `POST` | `/api/swap` | Swap TXTC → ETH via Uniswap V3 (1% pool) |
| `POST` | `/api/send` | Send TXTC to address |
| `POST` | `/api/quote` | Get swap quote |
| `GET` | `/api/price` | Current TXTC price |
| `GET` | `/api/contracts` | Contract addresses |

### ENS
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/ens/check/:name` | Check subdomain availability |
| `POST` | `/api/ens/register` | Register `<name>.ttcip.eth` |
| `GET` | `/api/ens/resolve/:name` | Resolve name → address |

### Airtime (Reloadly/Lycamobile)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/buy` | Buy Lycamobile airtime with TXTC |

---

## Deployed Contracts (Sepolia)

| Contract | Address |
|----------|---------|
| **TXTC Token** | `0x4d054FB258A260982F0bFab9560340d33D9E698B` |
| **VoucherManager** | `0x3094e5820F911f9119D201B9E2DdD4b9cf792990` |
| **EntryPointV3** | `0x6b5b8b917f3161aeb72105b988E55910e231d240` |
| **PoolManager** | `0xd9794c0daC0382c11F6Cf4a8365a8A49690Dcfc8` |
| **Uniswap V3 Pool** | `0xfAFFB106AC76424C30999d15eB0Ad303d2Add407` (1% fee, 500 TXTC : 1 ETH) |
| **SwapRouter** | `0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E` |
| **ENS Registrar** | `0xcD057A8AbF3832e65edF5d224313c6b4e6324F76` |

---

## Setup

```bash
cd backend-integration
npm install
```

### Environment

```env
PRIVATE_KEY=0x...
ENS_PRIVATE_KEY=0x...
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ETHERSCAN_API_KEY=...

# Contract addresses
TokenXYZ=0x4d054FB258A260982F0bFab9560340d33D9E698B
VoucherManager=0x3094e5820F911f9119D201B9E2DdD4b9cf792990
UniswapV3Pool=0xfAFFB106AC76424C30999d15eB0Ad303d2Add407
EntryPointV3=0x6b5b8b917f3161aeb72105b988E55910e231d240

# Alchemy
ALCHEMY_WEBHOOK_ID=...
ALCHEMY_API_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+18449862896

# Reloadly (Lycamobile airtime)
RELOADLY_CLIENT_ID=...
RELOADLY_CLIENT_SECRET=...
```

### Run

```bash
# Development
npx ts-node api-server.ts

# Production (Docker)
docker compose up -d backend
```

---

## Voucher Generation

```bash
# Generate 10 vouchers of 1 TXTC each
npx tsx generate-vouchers.ts 10 1

# Generate 5 vouchers of 100 TXTC each
npx tsx generate-vouchers.ts 5 100
```

---

## Testing

```bash
# Health check
curl http://localhost:3000/health

# Get balance
curl http://localhost:3000/api/balance/0xYourAddress

# Redeem voucher
curl -X POST http://localhost:3000/api/redeem \
  -H "Content-Type: application/json" \
  -d '{"voucherCode":"BB673BCC","userAddress":"0x..."}'

# Swap TXTC → ETH
curl -X POST http://localhost:3000/api/swap \
  -H "Content-Type: application/json" \
  -d '{"userAddress":"0x...","amount":"10"}'
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Express** | REST API server |
| **ethers.js v6** | Blockchain interactions |
| **Twilio** | SMS notifications |
| **Reloadly** | Lycamobile airtime API |
| **TypeScript** | Type-safe implementation |

