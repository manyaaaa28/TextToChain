import { Token } from "@uniswap/sdk-core";
import { FeeAmount } from "@uniswap/v3-sdk";

// Network Configuration
export const CHAIN_ID = 1; // Ethereum Mainnet (or 11155111 for Sepolia testnet)

// Contract Addresses (Ethereum Mainnet)
export const NONFUNGIBLE_POSITION_MANAGER_ADDRESS =
  "0xC36442b4a4522E871399CD717aBDD847Ab11FE88";
export const POOL_FACTORY_ADDRESS =
  "0x1F98431c8aD98523631AE4a59f267346ea31F984";
export const SWAP_ROUTER_ADDRESS = "0xE592427A0AEce92De3Edee1F18E0157C05861564";

// Token Addresses (Replace with your actual addresses)
export const ATOKEN_ADDRESS = "0x4d054FB258A260982F0bFab9560340d33D9E698B"; // Your ATOKEN address
export const WETH_ADDRESS = "0x7b79995e5f793A07Bc00c21412e50Ecae098E7f9"; // WETH on sepolia

// Token Definitions
export const ATOKEN = new Token(
  CHAIN_ID,
  ATOKEN_ADDRESS,
  18, // decimals
  "ATOKEN",
  "A Token",
);

export const WETH = new Token(
  CHAIN_ID,
  WETH_ADDRESS,
  18,
  "WETH",
  "Wrapped Ether",
);

// Pool Configuration
export const POOL_FEE = FeeAmount.MEDIUM; // 0.3% (3000)
// Other options: FeeAmount.LOW (500), FeeAmount.HIGH (10000)

// Transaction Settings
export const SLIPPAGE_TOLERANCE = 50; // 0.5% (50/10000)
export const DEADLINE_MINUTES = 20;

// ABIs
export const ERC20_ABI = [
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
];

export const POOL_ABI = [
  "function liquidity() view returns (uint128)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function fee() view returns (uint24)",
];
