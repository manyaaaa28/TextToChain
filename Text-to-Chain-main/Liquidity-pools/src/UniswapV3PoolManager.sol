// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./interfaces/IUniswapV3Interfaces.sol";
import "./TokenXYZ.sol";

/**
 * @title UniswapV3PoolManager
 * @dev Manages Uniswap V3 liquidity pool for TokenXYZ-WETH
 * @notice Handles pool creation, liquidity provision, and swaps via Uniswap V3
 */
contract UniswapV3PoolManager is Ownable {
    // Sepolia Uniswap V3 addresses
    address public constant UNISWAP_V3_FACTORY = 0x0227628f3F023bb0B980b67D528571c95c6DaC1c;
    address public constant POSITION_MANAGER = 0x1238536071E1c677A632429e3655c799b22cDA52;
    address public constant SWAP_ROUTER = 0x3bFA4769FB09eefC5a80d6E87c3B9C650f7Ae48E;
    address public constant WETH9 = 0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14;
    
    TokenXYZ public immutable tokenXYZ;
    IUniswapV3Pool public pool;
    INonfungiblePositionManager public immutable positionManager;
    ISwapRouter public immutable swapRouter;
    
    uint24 public constant POOL_FEE = 3000; // 0.3%
    int24 public constant TICK_SPACING = 60;
    
    uint256 public tokenId; // NFT position token ID
    address public entryPoint;
    
    event PoolCreated(address indexed pool, address token0, address token1, uint24 fee);
    event LiquidityAdded(uint256 indexed tokenId, uint128 liquidity, uint256 amount0, uint256 amount1);
    event LiquidityRemoved(uint256 indexed tokenId, uint256 amount0, uint256 amount1);
    event SwapExecuted(address indexed recipient, uint256 amountIn, uint256 amountOut, bool tokenToEth);
    
    constructor(address _tokenXYZ) Ownable(msg.sender) {
        require(_tokenXYZ != address(0), "UniswapV3PoolManager: zero address");
        tokenXYZ = TokenXYZ(_tokenXYZ);
        positionManager = INonfungiblePositionManager(POSITION_MANAGER);
        swapRouter = ISwapRouter(SWAP_ROUTER);
    }
    
    /**
     * @dev Set EntryPoint contract address
     */
    function setEntryPoint(address _entryPoint) external onlyOwner {
        require(_entryPoint != address(0), "UniswapV3PoolManager: zero address");
        entryPoint = _entryPoint;
    }
    
    /**
     * @dev Create Uniswap V3 pool for TokenXYZ-WETH
     */
    function createPool(uint160 sqrtPriceX96) external onlyOwner returns (address poolAddress) {
        require(address(pool) == address(0), "UniswapV3PoolManager: pool already exists");
        
        IUniswapV3Factory factory = IUniswapV3Factory(UNISWAP_V3_FACTORY);
        
        // Determine token order (token0 < token1)
        address token0 = address(tokenXYZ) < WETH9 ? address(tokenXYZ) : WETH9;
        address token1 = address(tokenXYZ) < WETH9 ? WETH9 : address(tokenXYZ);
        
        // Create pool
        poolAddress = factory.createPool(token0, token1, POOL_FEE);
        pool = IUniswapV3Pool(poolAddress);
        
        // Initialize pool with starting price
        pool.initialize(sqrtPriceX96);
        
        emit PoolCreated(poolAddress, token0, token1, POOL_FEE);
    }
    
    /**
     * @dev Add liquidity to the pool
     * @param amount0Desired Amount of token0 to add
     * @param amount1Desired Amount of token1 to add
     * @param tickLower Lower tick boundary
     * @param tickUpper Upper tick boundary
     */
    function addLiquidity(
        uint256 amount0Desired,
        uint256 amount1Desired,
        int24 tickLower,
        int24 tickUpper
    ) external onlyOwner returns (
        uint256 _tokenId,
        uint128 liquidity,
        uint256 amount0,
        uint256 amount1
    ) {
        require(address(pool) != address(0), "UniswapV3PoolManager: pool not created");
        
        // Approve position manager
        address token0 = pool.token0();
        address token1 = pool.token1();
        
        IERC20(token0).approve(address(positionManager), amount0Desired);
        IERC20(token1).approve(address(positionManager), amount1Desired);
        
        INonfungiblePositionManager.MintParams memory params = INonfungiblePositionManager.MintParams({
            token0: token0,
            token1: token1,
            fee: POOL_FEE,
            tickLower: tickLower,
            tickUpper: tickUpper,
            amount0Desired: amount0Desired,
            amount1Desired: amount1Desired,
            amount0Min: 0,
            amount1Min: 0,
            recipient: address(this),
            deadline: block.timestamp + 300
        });
        
        (_tokenId, liquidity, amount0, amount1) = positionManager.mint(params);
        
        if (tokenId == 0) {
            tokenId = _tokenId;
        }
        
        emit LiquidityAdded(_tokenId, liquidity, amount0, amount1);
    }
    
    /**
     * @dev Remove liquidity from the pool
     */
    function removeLiquidity(
        uint128 liquidity
    ) external onlyOwner returns (uint256 amount0, uint256 amount1) {
        require(tokenId != 0, "UniswapV3PoolManager: no position");
        
        INonfungiblePositionManager.DecreaseLiquidityParams memory params = 
            INonfungiblePositionManager.DecreaseLiquidityParams({
                tokenId: tokenId,
                liquidity: liquidity,
                amount0Min: 0,
                amount1Min: 0,
                deadline: block.timestamp + 300
            });
        
        (amount0, amount1) = positionManager.decreaseLiquidity(params);
        
        // Collect tokens
        INonfungiblePositionManager.CollectParams memory collectParams = 
            INonfungiblePositionManager.CollectParams({
                tokenId: tokenId,
                recipient: msg.sender,
                amount0Max: uint128(amount0),
                amount1Max: uint128(amount1)
            });
        
        positionManager.collect(collectParams);
        
        emit LiquidityRemoved(tokenId, amount0, amount1);
    }
    
    /**
     * @dev Swap TokenXYZ for ETH via Uniswap V3
     * @param tokenAmount Amount of TokenXYZ to swap
     * @param recipient Address to receive ETH
     */
    function swapTokenForEth(
        uint256 tokenAmount,
        address recipient,
        uint256 minAmountOut
    ) external returns (uint256 amountOut) {
        require(msg.sender == entryPoint || msg.sender == owner(), "UniswapV3PoolManager: unauthorized");
        require(address(pool) != address(0), "UniswapV3PoolManager: pool not created");
        
        // Transfer tokens from caller
        tokenXYZ.transferFrom(msg.sender, address(this), tokenAmount);
        
        // Approve router
        tokenXYZ.approve(address(swapRouter), tokenAmount);
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: address(tokenXYZ),
            tokenOut: WETH9,
            fee: POOL_FEE,
            recipient: recipient,
            deadline: block.timestamp + 300,
            amountIn: tokenAmount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        amountOut = swapRouter.exactInputSingle(params);
        
        emit SwapExecuted(recipient, tokenAmount, amountOut, true);
    }
    
    /**
     * @dev Swap ETH for TokenXYZ via Uniswap V3
     */
    function swapEthForToken(
        uint256 ethAmount,
        address recipient,
        uint256 minAmountOut
    ) external payable returns (uint256 amountOut) {
        require(msg.sender == entryPoint || msg.sender == owner(), "UniswapV3PoolManager: unauthorized");
        require(address(pool) != address(0), "UniswapV3PoolManager: pool not created");
        require(msg.value >= ethAmount, "UniswapV3PoolManager: insufficient ETH");
        
        ISwapRouter.ExactInputSingleParams memory params = ISwapRouter.ExactInputSingleParams({
            tokenIn: WETH9,
            tokenOut: address(tokenXYZ),
            fee: POOL_FEE,
            recipient: recipient,
            deadline: block.timestamp + 300,
            amountIn: ethAmount,
            amountOutMinimum: minAmountOut,
            sqrtPriceLimitX96: 0
        });
        
        amountOut = swapRouter.exactInputSingle{value: ethAmount}(params);
        
        // Refund excess ETH
        if (msg.value > ethAmount) {
            (bool success, ) = msg.sender.call{value: msg.value - ethAmount}("");
            require(success, "UniswapV3PoolManager: ETH refund failed");
        }
        
        emit SwapExecuted(recipient, ethAmount, amountOut, false);
    }
    
    /**
     * @dev Get pool address
     */
    function getPool() external view returns (address) {
        return address(pool);
    }
    
    /**
     * @dev Get current pool price (sqrtPriceX96)
     */
    function getCurrentPrice() external view returns (uint160 sqrtPriceX96) {
        require(address(pool) != address(0), "UniswapV3PoolManager: pool not created");
        (sqrtPriceX96, , , , , , ) = pool.slot0();
    }
    
    /**
     * @dev Get pool liquidity
     */
    function getPoolLiquidity() external view returns (uint128) {
        require(address(pool) != address(0), "UniswapV3PoolManager: pool not created");
        return pool.liquidity();
    }
    
    receive() external payable {}
}
