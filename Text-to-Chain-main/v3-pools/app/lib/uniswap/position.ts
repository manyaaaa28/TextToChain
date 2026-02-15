import { Position, nearestUsableTick } from "@uniswap/v3-sdk";
import { Pool } from "@uniswap/v3-sdk";

export function createPosition(
  pool: Pool,
  amount0: string,
  amount1: string,
  tickSpacingMultiplier: number = 2, // How many tick spacings above/below
): Position {
  const tickLower =
    nearestUsableTick(pool.tickCurrent, pool.tickSpacing) -
    pool.tickSpacing * tickSpacingMultiplier;

  const tickUpper =
    nearestUsableTick(pool.tickCurrent, pool.tickSpacing) +
    pool.tickSpacing * tickSpacingMultiplier;

  return Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    useFullPrecision: true,
  });
}

export function createPositionWithCustomRange(
  pool: Pool,
  amount0: string,
  amount1: string,
  tickLower: number,
  tickUpper: number,
): Position {
  return Position.fromAmounts({
    pool,
    tickLower,
    tickUpper,
    amount0,
    amount1,
    useFullPrecision: true,
  });
}
