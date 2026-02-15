# 📞 Airtime Service — Buy Airtime with TXTC

> **TypeScript/Express API server — Port 8082**

SMS-based airtime top-up service. Users text `BUY 10` to purchase Lycamobile airtime using TXTC tokens. Supports multiple telco operators via Reloadly, MTN MoMo, and Africa's Talking APIs.

---

## Architecture

```
SMS: "BUY 10"
    │
    ▼
┌─────────────────────────────────────────────────┐
│         AIRTIME SERVICE (Port 8082)              │
│                                                  │
│  ┌──────────────┐  ┌────────────────────────┐   │
│  │ API Routes   │  │  Airtime Orchestrator   │   │
│  │ (buy, balance│──▶│ (rate calc, mint TXTC, │   │
│  │  history)    │  │  swap, top-up)          │   │
│  └──────────────┘  └──────────┬─────────────┘   │
│                                │                  │
│  ┌─────────────────────────────┼──────────────┐  │
│  │          Telco Factory                     │  │
│  │  ┌────────────┐ ┌─────┐ ┌──────────────┐  │  │
│  │  │ Lycamobile │ │ MTN │ │ Africa's     │  │  │
│  │  │ (Reloadly) │ │MoMo │ │ Talking      │  │  │
│  │  └────────────┘ └─────┘ └──────────────┘  │  │
│  └────────────────────────────────────────────┘  │
│                                                  │
│  ┌──────────┐  ┌──────────────┐                  │
│  │ Database │  │ Webhook Auth │                  │
│  │ (SQLite) │  │ Middleware   │                  │
│  └──────────┘  └──────────────┘                  │
└─────────────────────────────────────────────────┘
         │
         ▼
Backend API (Port 3000) → Blockchain (Sepolia)
```

---

## Folder Structure

```
airtime-service/
├── src/
│   ├── index.ts                    # Express server setup
│   ├── api/
│   │   ├── routes.ts               # Airtime buy/balance/history endpoints
│   │   └── ens-routes.ts           # ENS registration endpoint
│   ├── orchestrator/
│   │   └── AirtimeOrchestrator.ts  # Buy flow: rate calc → mint → swap → top-up
│   ├── telco/
│   │   ├── TelcoFactory.ts         # Operator detection + initialization
│   │   ├── interfaces/
│   │   │   └── TelcoOperator.ts    # Common operator interface
│   │   └── operators/
│   │       ├── LycamobileOperator.ts    # Reloadly API (Lycamobile top-up)
│   │       ├── MTNOperator.ts           # MTN MoMo API
│   │       └── AfricasTalkingOperator.ts # Africa's Talking API
│   ├── database/
│   │   └── Database.ts             # SQLite — users + transactions
│   ├── middleware/
│   │   └── webhookAuth.ts          # Webhook signature validation
│   └── types/
│       └── index.ts                # TypeScript type definitions
├── .env                            # Environment variables
├── .env.example                    # Example config
├── package.json
├── tsconfig.json
└── Dockerfile
```

---

## Supported Operators

| Operator | API | Countries | Detection |
|----------|-----|-----------|-----------|
| **Lycamobile** | Reloadly | India (+91), Ireland (+353), UK (+44) | Default fallback |
| **MTN** | MoMo API | Uganda (+256 77/78/76) | Prefix-based |
| **Africa's Talking** | AT API | Kenya (+254), Uganda (Airtel) | Prefix-based |

The `TelcoFactory` auto-detects the operator from the phone number prefix. Lycamobile (Reloadly) is the default fallback for unrecognized numbers.

---

## SMS Command

```
BUY <amount>
```

Example: `BUY 10` — buys 10 units of Lycamobile airtime using TXTC

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/airtime/buy` | Buy airtime with TXTC |
| `GET` | `/api/airtime/balance/:phoneNumber` | Check TXTC balance |
| `GET` | `/api/balance/:phoneNumber` | Check TXTC balance (alias) |
| `GET` | `/api/transactions/:phoneNumber` | Transaction history |
| `POST` | `/api/webhooks/payment` | Payment webhook (Africa's Talking) |
| `POST` | `/api/ussd/callback` | USSD menu callback |
| `POST` | `/api/ens/register` | ENS subdomain registration |
| `GET` | `/health` | Health check |

---

## Token Distribution

When a user buys airtime:

1. **Calculate TXTC cost** based on conversion rates
2. **Mint TXTC** to user wallet
3. **Split:**
   - 90% TXTC stays with user
   - 10% TXTC swapped for ETH (gas fees)
4. **Top-up airtime** via Reloadly/MTN/AT API

---

## Setup

```bash
cd airtime-service
cp .env.example .env
npm install
npm run dev
```

### Environment

```env
# Server
PORT=8082

# Reloadly (Lycamobile) — primary
RELOADLY_CLIENT_ID=...
RELOADLY_CLIENT_SECRET=...
RELOADLY_SANDBOX=true
LYCAMOBILE_COUNTRY_CODE=IE
LYCAMOBILE_CURRENCY=EUR

# MTN MoMo (optional)
MTN_API_KEY=...
MTN_API_SECRET=...
MTN_BASE_URL=https://sandbox.momodeveloper.mtn.com

# Africa's Talking (optional)
AT_API_KEY=...
AT_USERNAME=sandbox

# Backend
CONTRACT_API_URL=http://localhost:3000

# Blockchain
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

### Docker

```bash
docker compose up -d airtime
```

---

## Database Schema (SQLite)

### Users
```sql
CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  phone_number TEXT UNIQUE,
  wallet_address TEXT,
  encrypted_private_key TEXT,
  created_at DATETIME,
  last_active DATETIME
);
```

### Transactions
```sql
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  type TEXT,
  from_phone TEXT,
  airtime_amount REAL,
  txtc_amount REAL,
  eth_amount REAL,
  telco_tx_id TEXT,
  blockchain_tx_hash TEXT,
  status TEXT,
  created_at DATETIME
);
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Express** | REST API server |
| **Reloadly API** | Lycamobile airtime top-up |
| **MTN MoMo API** | MTN mobile money (Uganda) |
| **Africa's Talking** | Aggregator (Kenya, Uganda) |
| **better-sqlite3** | Local database |
| **ethers.js v6** | Blockchain interactions |
| **TypeScript** | Type-safe implementation |

---

## Testing

```bash
# Test MTN sandbox
npm run test:mtn

# Test webhook
npm run test:webhook

# Manual test
curl -X POST http://localhost:8082/api/airtime/buy \
  -H "Content-Type: application/json" \
  -d '{"phoneNumber":"+918595057429","airtimeAmount":10}'
```

