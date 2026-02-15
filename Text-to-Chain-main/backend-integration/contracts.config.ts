/**
 * Smart Contract Configuration for Text-to-Chain Backend
 * Sepolia Testnet Deployment
 */

export const SEPOLIA_CONFIG = {
  chainId: 11155111,
  network: 'sepolia',
  rpcUrl: process.env.RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY',
  
  contracts: {
    tokenXYZ: '0x4d054FB258A260982F0bFab9560340d33D9E698B',
    voucherManager: '0x3094e5820F911f9119D201B9E2DdD4b9cf792990',
    uniswapV3PoolManager: '0xd9794c0daC0382c11F6Cf4a8365a8A49690Dcfc8',
    entryPointV3: '0x6b5b8b917f3161aeb72105b988E55910e231d240',
    uniswapV3Pool: '0xfAFFB106AC76424C30999d15eB0Ad303d2Add407', // 1% fee, 500 TXTC + 1 WETH
  },
  
  uniswap: {
    factory: '0x0227628f3F023bb0B980b67D528571c95c6DaC1c',
    positionManager: '0x1238536071E1c677A632429e3655c799b22cDA52',
    swapRouter: '0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E',
    weth9: '0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14',
  },
  
  poolInfo: {
    fee: 10000, // 1%
    tickSpacing: 200,
  },
  
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    baseUrl: 'https://sepolia.etherscan.io',
  },
} as const;

export type ContractAddresses = typeof SEPOLIA_CONFIG.contracts;
