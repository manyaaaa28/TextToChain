# ⛓️ Liquidity Pools — Smart Contracts

> **Solidity smart contracts — Foundry**

All on-chain logic for the Text-to-Chain platform: ERC20 token, voucher system, Uniswap V3 pool management, and backend orchestration. Built with [Foundry](https://book.getfoundry.sh/) and tested with **102 passing tests**.

---

## Deployed Contracts (Sepolia Testnet)

| Contract | Address |
|----------|---------|
| **TXTC Token** | [`0x4d054FB258A260982F0bFab9560340d33D9E698B`](https://sepolia.etherscan.io/address/0x4d054FB258A260982F0bFab9560340d33D9E698B) |
| **VoucherManager** | [`0x3094e5820F911f9119D201B9E2DdD4b9cf792990`](https://sepolia.etherscan.io/address/0x3094e5820F911f9119D201B9E2DdD4b9cf792990) |
| **EntryPointV3** | [`0x6b5b8b917f3161aeb72105b988E55910e231d240`](https://sepolia.etherscan.io/address/0x6b5b8b917f3161aeb72105b988E55910e231d240) |
| **UniswapV3PoolManager** | [`0xd9794c0daC0382c11F6Cf4a8365a8A49690Dcfc8`](https://sepolia.etherscan.io/address/0xd9794c0daC0382c11F6Cf4a8365a8A49690Dcfc8) |
| **Uniswap V3 Pool** | [`0xfAFFB106AC76424C30999d15eB0Ad303d2Add407`](https://sepolia.etherscan.io/address/0xfAFFB106AC76424C30999d15eB0Ad303d2Add407) — 1% fee, 500 TXTC : 1 ETH |
| **ENS Registrar** | [`0xcD057A8AbF3832e65edF5d224313c6b4e6324F76`](https://sepolia.etherscan.io/address/0xcD057A8AbF3832e65edF5d224313c6b4e6324F76) |

---

## Folder Structure

```
Liquidity-pools/
├── foundry.toml            # Foundry config (Solidity 0.8.20)
├── .env                    # Deployment keys
├── src/
│   ├── TokenXYZ.sol        # ERC20 token with mint + burnFromAny
│   ├── VoucherManager.sol  # Voucher generation + redemption + shop system
│   ├── EntryPointV3.sol    # Backend orchestration (swap, redeem)
│   ├── UniswapV3PoolManager.sol  # Uniswap V3 pool creation + management
│   └── interfaces/         # External contract interfaces
├── test/
│   ├── TokenXYZ.t.sol      # Token tests (100% coverage)
│   ├── VoucherManager.t.sol # Voucher tests (93.94% branch coverage)
│   ├── EntryPointV3.t.sol  # EntryPoint tests
│   └── UniswapV3PoolManager.t.sol # Pool manager tests
├── script/
│   └── DeployV3.s.sol      # Deployment script
├── lib/                    # Dependencies (OpenZeppelin, Uniswap V3)
├── broadcast/              # Deployment transaction logs
└── deployments/            # Deployment records
```

---

## Contracts

### TokenXYZ.sol
ERC20 token (TXTC) with owner-controlled minting and `burnFromAny` — enables only the backend wallet to burn tokens from any user wallet for gasless swaps.

### VoucherManager.sol
On-chain voucher creation and redemption with shop registration system. Shops stake ETH, generate voucher codes (stored as keccak256 hashes), and earn 2% commission. Backend can also generate vouchers without shop registration.

### EntryPointV3.sol
Central hub for backend operations — voucher redemption with auto-swap, token swap orchestration via Uniswap V3, and backend authorization.

### UniswapV3PoolManager.sol
Manages the TXTC/WETH Uniswap V3 liquidity pool. Handles pool creation, initialization, liquidity provision, and swap execution.

---

## Test Coverage (102 tests)

```
| Contract              | Lines   | Statements | Branches | Functions |
|-----------------------|---------|------------|----------|-----------|
| TokenXYZ.sol          | 100.00% | 100.00%    | 100.00%  | 100.00%   |
| VoucherManager.sol    | 100.00% | 100.00%    | 93.94%   | 100.00%   |
| EntryPointV3.sol      | 77.55%  | 69.57%     | 82.14%   | 100.00%   |
| UniswapV3PoolManager  | 39.68%  | 23.81%     | 50.00%   | 100.00%   |
```

---

## Usage

```bash
# Build
forge build

# Test (102 tests)
forge test

# Test with verbosity
forge test -vvv

# Deploy
forge script script/DeployV3.s.sol --rpc-url $RPC_URL --private-key $PRIVATE_KEY --broadcast --verify

# Gas report
forge test --gas-report
```

---

## Environment

```env
PRIVATE_KEY=0x...
RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ETHERSCAN_API_KEY=...
```

---

## Dependencies

- [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) — ERC20, Ownable, ReentrancyGuard
- [Uniswap V3 Core](https://github.com/Uniswap/v3-core) — Pool interfaces
- [Uniswap V3 Periphery](https://github.com/Uniswap/v3-periphery) — SwapRouter, NonfungiblePositionManager

