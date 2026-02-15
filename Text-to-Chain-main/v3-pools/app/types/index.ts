import { Token } from "@uniswap/sdk-core";

export interface PoolState {
  liquidity: string;
  sqrtPriceX96: string;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

export interface MintPositionParams {
  token0: Token;
  token1: Token;
  fee: number;
  amount0: string;
  amount1: string;
  tickLower: number;
  tickUpper: number;
  recipient: string;
}

export interface PositionInfo {
  tokenId: string;
  liquidity: string;
  token0: string;
  token1: string;
  fee: number;
  tickLower: number;
  tickUpper: number;
}
