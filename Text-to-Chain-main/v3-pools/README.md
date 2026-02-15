# 🏊 V3 Pools — Liquidity Management dApp

> **Next.js + RainbowKit + Uniswap V3 SDK**

Web-based dApp for managing TXTC/WETH Uniswap V3 liquidity positions. Connect your wallet, add/remove liquidity, and monitor pool state.

---

## Features

- Connect wallet via RainbowKit (MetaMask, WalletConnect, etc.)
- View TXTC/WETH pool state (price, liquidity, tick)
- Add liquidity to the TXTC/WETH pool
- Manage existing positions
- Real-time pool data from Sepolia

---

## Folder Structure

```
v3-pools/
├── app/
│   ├── page.tsx            # Main page
│   ├── layout.tsx          # Root layout
│   ├── providers.tsx       # Wagmi + RainbowKit providers
│   ├── globals.css         # Global styles (Tailwind)
│   ├── components/
│   │   ├── ConnectWallet.tsx    # Wallet connection button
│   │   └── LiquidityForm.tsx   # Add liquidity form
│   ├── lib/
│   │   ├── constants.ts        # Contract addresses, chain config
│   │   ├── hooks/              # React hooks for pool data
│   │   └── uniswap/            # Uniswap V3 SDK helpers
│   └── types/              # TypeScript type definitions
├── public/                 # Static assets
├── package.json
├── next.config.ts
├── tsconfig.json
├── postcss.config.mjs
└── eslint.config.mjs
```

---

## Tech Stack

| Technology | Purpose |
|------------|---------|
| **Next.js 16** | React framework |
| **RainbowKit** | Wallet connection UI |
| **Wagmi** | React hooks for Ethereum |
| **Uniswap V3 SDK** | Pool math + position management |
| **viem** | Ethereum client |
| **ethers.js v6** | Contract interactions |
| **Tailwind CSS** | Styling |
| **Lucide React** | Icons |

---

## Setup

```bash
cd v3-pools
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Pool Info

| Parameter | Value |
|-----------|-------|
| **Pool** | `0xfAFFB106AC76424C30999d15eB0Ad303d2Add407` |
| **Token0 (TXTC)** | `0x4d054FB258A260982F0bFab9560340d33D9E698B` |
| **Token1 (WETH)** | `0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14` |
| **Fee** | 1% (10000) |
| **Rate** | 1 TXTC = 0.002 ETH (1 ETH = 500 TXTC) |
| **Network** | Sepolia Testnet |

