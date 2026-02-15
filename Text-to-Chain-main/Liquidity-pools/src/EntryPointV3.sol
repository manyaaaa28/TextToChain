// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TokenXYZ.sol";
import "./VoucherManager.sol";
import "./UniswapV3PoolManager.sol";

/**
 * @title EntryPointV3
 * @dev Main contract for backend SMS service interactions with Uniswap V3
 * @notice Central hub for all user operations: voucher redemption, swaps via Uniswap V3
 */
contract EntryPointV3 is Ownable, ReentrancyGuard {
    
    TokenXYZ public immutable tokenXYZ;
    VoucherManager public immutable voucherManager;
    UniswapV3PoolManager public immutable poolManager;
    
    mapping(address => bool) public authorizedBackends;
    
    uint256 public constant GAS_RESERVE_PERCENT = 10; // 10% of redeemed value for gas
    
    event VoucherRedeemed(address indexed user, uint256 tokenAmount, uint256 ethAmount, uint256 gasReserve);
    event TokensSwapped(address indexed user, uint256 amountIn, uint256 amountOut, bool isTokenToEth);
    event BackendAuthorized(address indexed backend, bool status);
    event EmergencyWithdraw(address indexed token, uint256 amount);
    
    modifier onlyAuthorized() {
        require(authorizedBackends[msg.sender] || msg.sender == owner(), "EntryPointV3: not authorized");
        _;
    }
    
    constructor(
        address _tokenXYZ,
        address _voucherManager,
        address payable _poolManager
    ) Ownable(msg.sender) {
        require(_tokenXYZ != address(0), "EntryPointV3: zero token address");
        require(_voucherManager != address(0), "EntryPointV3: zero voucher address");
        require(_poolManager != address(0), "EntryPointV3: zero pool address");
        
        tokenXYZ = TokenXYZ(_tokenXYZ);
        voucherManager = VoucherManager(_voucherManager);
        poolManager = UniswapV3PoolManager(_poolManager);
        
        authorizedBackends[msg.sender] = true;
    }
    
    /**
     * @dev Authorize/deauthorize backend service
     */
    function setBackendAuthorization(address backend, bool status) external onlyOwner {
        require(backend != address(0), "EntryPointV3: zero address");
        authorizedBackends[backend] = status;
        emit BackendAuthorized(backend, status);
    }
    
    /**
     * @dev Redeem voucher and auto-swap to ETH via Uniswap V3
     * @param code Voucher code
     * @param user User redeeming the voucher
     * @param swapToEth Whether to auto-swap tokens to ETH
     */
    function redeemVoucher(
        string memory code,
        address user,
        bool swapToEth
    ) external onlyAuthorized nonReentrant returns (uint256 tokenAmount, uint256 ethAmount) {
        require(user != address(0), "EntryPointV3: zero address");
        
        tokenAmount = voucherManager.redeemVoucher(code, user);
        
        if (swapToEth && tokenAmount > 0) {
            uint256 gasReserve = (tokenAmount * GAS_RESERVE_PERCENT) / 100;
            uint256 swapAmount = tokenAmount - gasReserve;
            
            // Transfer tokens from user to this contract
            tokenXYZ.transferFrom(user, address(this), swapAmount);
            
            // Approve pool manager
            tokenXYZ.approve(address(poolManager), swapAmount);
            
            // Execute swap via Uniswap V3
            ethAmount = poolManager.swapTokenForEth(swapAmount, user, 0);
            
            emit VoucherRedeemed(user, tokenAmount, ethAmount, gasReserve);
        } else {
            emit VoucherRedeemed(user, tokenAmount, 0, 0);
        }
    }
    
    /**
     * @dev Swap tokens for ETH via Uniswap V3
     * @param user User performing the swap (recipient of ETH)
     * @param tokenAmount Amount of tokens to swap (must be in this contract)
     * @param minEthOut Minimum ETH to receive (slippage protection)
     * @notice Backend must transfer tokens to this contract before calling
     */
    function swapTokenForEth(
        address user,
        uint256 tokenAmount,
        uint256 minEthOut
    ) external onlyAuthorized nonReentrant returns (uint256 ethOut) {
        require(user != address(0), "EntryPointV3: zero address");
        require(tokenAmount > 0, "EntryPointV3: zero amount");
        
        // Verify this contract has the tokens (backend should transfer first)
        require(tokenXYZ.balanceOf(address(this)) >= tokenAmount, "EntryPointV3: insufficient balance");
        
        // Approve pool manager
        tokenXYZ.approve(address(poolManager), tokenAmount);
        
        // Execute swap
        ethOut = poolManager.swapTokenForEth(tokenAmount, user, minEthOut);
        
        emit TokensSwapped(user, tokenAmount, ethOut, true);
    }
    
    /**
     * @dev Swap ETH for tokens via Uniswap V3
     * @param user User performing the swap
     * @param minTokenOut Minimum tokens to receive (slippage protection)
     */
    function swapEthForToken(
        address user,
        uint256 minTokenOut
    ) external payable onlyAuthorized nonReentrant returns (uint256 tokenOut) {
        require(user != address(0), "EntryPointV3: zero address");
        require(msg.value > 0, "EntryPointV3: zero amount");
        
        // Execute swap
        tokenOut = poolManager.swapEthForToken{value: msg.value}(msg.value, user, minTokenOut);
        
        emit TokensSwapped(user, msg.value, tokenOut, false);
    }
    
    /**
     * @dev Get current pool price
     */
    function getCurrentPrice() external view returns (uint160 sqrtPriceX96) {
        return poolManager.getCurrentPrice();
    }
    
    /**
     * @dev Get pool liquidity
     */
    function getPoolLiquidity() external view returns (uint128) {
        return poolManager.getPoolLiquidity();
    }
    
    /**
     * @dev Get pool address
     */
    function getPool() external view returns (address) {
        return poolManager.getPool();
    }
    
    /**
     * @dev Emergency withdraw (owner only)
     */
    function emergencyWithdraw(address token, uint256 amount) external onlyOwner {
        if (token == address(0)) {
            (bool success, ) = owner().call{value: amount}("");
            require(success, "EntryPointV3: ETH transfer failed");
        } else {
            tokenXYZ.transfer(owner(), amount);
        }
        emit EmergencyWithdraw(token, amount);
    }
    
    receive() external payable {}
}
