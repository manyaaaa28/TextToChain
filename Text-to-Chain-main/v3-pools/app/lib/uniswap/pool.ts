import { ethers } from "ethers";
import { Pool, computePoolAddress } from "@uniswap/v3-sdk";
import { Token } from "@uniswap/sdk-core";
import { POOL_FACTORY_ADDRESS, POOL_ABI, POOL_FEE } from "../constants";
import { PoolState } from "../../types";

export async function getPoolAddress(
  token0: Token,
  token1: Token,
  fee: number,
): Promise<string> {
  return computePoolAddress({
    factoryAddress: POOL_FACTORY_ADDRESS,
    tokenA: token0,
    tokenB: token1,
    fee,
  });
}

export async function getPoolState(
  poolAddress: string,
  provider: ethers.Provider,
): Promise<PoolState> {
  const poolContract = new ethers.Contract(poolAddress, POOL_ABI, provider);

  const [liquidity, slot0] = await Promise.all([
    poolContract.liquidity(),
    poolContract.slot0(),
  ]);

  return {
    liquidity: liquidity.toString(),
    sqrtPriceX96: slot0.sqrtPriceX96.toString(),
    tick: Number(slot0.tick),
    observationIndex: slot0.observationIndex,
    observationCardinality: slot0.observationCardinality,
    observationCardinalityNext: slot0.observationCardinalityNext,
    feeProtocol: slot0.feeProtocol,
    unlocked: slot0.unlocked,
  };
}

export function createPoolInstance(
  token0: Token,
  token1: Token,
  fee: number,
  poolState: PoolState,
): Pool {
  return new Pool(
    token0,
    token1,
    fee,
    poolState.sqrtPriceX96,
    poolState.liquidity,
    poolState.tick,
  );
}
