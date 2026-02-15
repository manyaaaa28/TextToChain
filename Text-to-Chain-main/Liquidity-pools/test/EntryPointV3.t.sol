// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TokenXYZ.sol";
import "../src/VoucherManager.sol";
import "../src/UniswapV3PoolManager.sol";
import "../src/EntryPointV3.sol";

contract EntryPointV3Test is Test {
    TokenXYZ public token;
    VoucherManager public voucherMgr;
    UniswapV3PoolManager public poolMgr;
    EntryPointV3 public entryPoint;

    address public owner;
    address public backend;
    address public user1;
    address public user2;
    address public unauthorized;

    event VoucherRedeemed(address indexed user, uint256 tokenAmount, uint256 ethAmount, uint256 gasReserve);
    event BackendAuthorized(address indexed backend, bool status);
    event EmergencyWithdraw(address indexed token, uint256 amount);

    function setUp() public {
        owner = address(this);
        backend = makeAddr("backend");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        unauthorized = makeAddr("unauthorized");

        token = new TokenXYZ();
        voucherMgr = new VoucherManager(address(token));
        poolMgr = new UniswapV3PoolManager(address(token));
        entryPoint = new EntryPointV3(
            address(token),
            address(voucherMgr),
            payable(address(poolMgr))
        );

        // Grant minting rights to VoucherManager
        token.addMinter(address(voucherMgr));
    }

    // ========================================================================
    // Deployment
    // ========================================================================

    function test_deployment() public view {
        assertEq(address(entryPoint.tokenXYZ()), address(token));
        assertEq(address(entryPoint.voucherManager()), address(voucherMgr));
        assertEq(address(entryPoint.poolManager()), address(poolMgr));
        assertEq(entryPoint.owner(), owner);
        assertEq(entryPoint.GAS_RESERVE_PERCENT(), 10);
    }

    function test_deployment_ownerIsAuthorized() public view {
        assertTrue(entryPoint.authorizedBackends(owner));
    }

    function test_deployment_revertZeroTokenAddress() public {
        vm.expectRevert("EntryPointV3: zero token address");
        new EntryPointV3(address(0), address(voucherMgr), payable(address(poolMgr)));
    }

    function test_deployment_revertZeroVoucherAddress() public {
        vm.expectRevert("EntryPointV3: zero voucher address");
        new EntryPointV3(address(token), address(0), payable(address(poolMgr)));
    }

    function test_deployment_revertZeroPoolAddress() public {
        vm.expectRevert("EntryPointV3: zero pool address");
        new EntryPointV3(address(token), address(voucherMgr), payable(address(0)));
    }

    // ========================================================================
    // Backend Authorization
    // ========================================================================

    function test_setBackendAuthorization() public {
        vm.expectEmit(true, false, false, true);
        emit BackendAuthorized(backend, true);

        entryPoint.setBackendAuthorization(backend, true);
        assertTrue(entryPoint.authorizedBackends(backend));
    }

    function test_revokeBackendAuthorization() public {
        entryPoint.setBackendAuthorization(backend, true);
        entryPoint.setBackendAuthorization(backend, false);
        assertFalse(entryPoint.authorizedBackends(backend));
    }

    function test_setBackendAuthorization_revertZeroAddress() public {
        vm.expectRevert("EntryPointV3: zero address");
        entryPoint.setBackendAuthorization(address(0), true);
    }

    function test_setBackendAuthorization_revertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        entryPoint.setBackendAuthorization(backend, true);
    }

    // ========================================================================
    // Voucher Redemption (without swap)
    // ========================================================================

    function test_redeemVoucher_noSwap() public {
        // Generate voucher
        bytes32 codeHash = keccak256(abi.encodePacked("TEST100"));
        uint256 tokenAmount = 100 * 10 ** 18;
        voucherMgr.generateVoucher(codeHash, tokenAmount);

        vm.expectEmit(true, false, false, true);
        emit VoucherRedeemed(user1, tokenAmount, 0, 0);

        (uint256 redeemed, uint256 ethAmt) = entryPoint.redeemVoucher("TEST100", user1, false);

        assertEq(redeemed, tokenAmount);
        assertEq(ethAmt, 0);
        assertEq(token.balanceOf(user1), tokenAmount);
    }

    function test_redeemVoucher_revertUnauthorized() public {
        bytes32 codeHash = keccak256(abi.encodePacked("UNAUTH"));
        voucherMgr.generateVoucher(codeHash, 100 * 10 ** 18);

        vm.prank(unauthorized);
        vm.expectRevert("EntryPointV3: not authorized");
        entryPoint.redeemVoucher("UNAUTH", user1, false);
    }

    function test_redeemVoucher_revertZeroAddress() public {
        bytes32 codeHash = keccak256(abi.encodePacked("ZERO"));
        voucherMgr.generateVoucher(codeHash, 100 * 10 ** 18);

        vm.expectRevert("EntryPointV3: zero address");
        entryPoint.redeemVoucher("ZERO", address(0), false);
    }

    function test_redeemVoucher_authorizedBackend() public {
        entryPoint.setBackendAuthorization(backend, true);

        bytes32 codeHash = keccak256(abi.encodePacked("BACK1"));
        voucherMgr.generateVoucher(codeHash, 50 * 10 ** 18);

        vm.prank(backend);
        (uint256 redeemed,) = entryPoint.redeemVoucher("BACK1", user1, false);
        assertEq(redeemed, 50 * 10 ** 18);
    }

    // ========================================================================
    // Swap Token for ETH (unit test — no Uniswap pool)
    // ========================================================================

    function test_swapTokenForEth_revertUnauthorized() public {
        vm.prank(unauthorized);
        vm.expectRevert("EntryPointV3: not authorized");
        entryPoint.swapTokenForEth(user1, 100, 0);
    }

    function test_swapTokenForEth_revertZeroAddress() public {
        vm.expectRevert("EntryPointV3: zero address");
        entryPoint.swapTokenForEth(address(0), 100, 0);
    }

    function test_swapTokenForEth_revertZeroAmount() public {
        vm.expectRevert("EntryPointV3: zero amount");
        entryPoint.swapTokenForEth(user1, 0, 0);
    }

    function test_swapTokenForEth_revertInsufficientBalance() public {
        vm.expectRevert("EntryPointV3: insufficient balance");
        entryPoint.swapTokenForEth(user1, 100 * 10 ** 18, 0);
    }

    // ========================================================================
    // Swap ETH for Token (unit test — no Uniswap pool)
    // ========================================================================

    function test_swapEthForToken_revertUnauthorized() public {
        vm.deal(unauthorized, 1 ether);
        vm.prank(unauthorized);
        vm.expectRevert("EntryPointV3: not authorized");
        entryPoint.swapEthForToken{value: 1 ether}(user1, 0);
    }

    function test_swapEthForToken_revertZeroAddress() public {
        vm.expectRevert("EntryPointV3: zero address");
        entryPoint.swapEthForToken{value: 1 ether}(address(0), 0);
    }

    function test_swapEthForToken_revertZeroAmount() public {
        vm.expectRevert("EntryPointV3: zero amount");
        entryPoint.swapEthForToken(user1, 0);
    }

    // ========================================================================
    // View Functions
    // ========================================================================

    function test_getPool_noPool() public view {
        assertEq(entryPoint.getPool(), address(0));
    }

    function test_getCurrentPrice_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        entryPoint.getCurrentPrice();
    }

    function test_getPoolLiquidity_revertNoPool() public {
        vm.expectRevert("UniswapV3PoolManager: pool not created");
        entryPoint.getPoolLiquidity();
    }

    // ========================================================================
    // Emergency Withdraw
    // ========================================================================

    function test_emergencyWithdraw_ETH() public {
        // Send ETH to entryPoint
        vm.deal(address(entryPoint), 5 ether);

        // owner is this contract which needs receive() — use balance check
        uint256 ownerBalBefore = address(this).balance;

        entryPoint.emergencyWithdraw(address(0), 3 ether);
        assertEq(address(this).balance, ownerBalBefore + 3 ether);
        assertEq(address(entryPoint).balance, 2 ether);
    }

    receive() external payable {}

    function test_emergencyWithdraw_tokens() public {
        // Mint tokens to entryPoint
        token.mint(address(entryPoint), 1000 * 10 ** 18);

        entryPoint.emergencyWithdraw(address(token), 500 * 10 ** 18);
        assertEq(token.balanceOf(owner), 500 * 10 ** 18);
        assertEq(token.balanceOf(address(entryPoint)), 500 * 10 ** 18);
    }

    function test_emergencyWithdraw_revertNotOwner() public {
        vm.deal(address(entryPoint), 1 ether);

        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        entryPoint.emergencyWithdraw(address(0), 1 ether);
    }

    // ========================================================================
    // Receive ETH
    // ========================================================================

    function test_receiveETH() public {
        vm.deal(user1, 1 ether);
        vm.prank(user1);
        (bool success,) = address(entryPoint).call{value: 1 ether}("");
        assertTrue(success);
        assertEq(address(entryPoint).balance, 1 ether);
    }

    // ========================================================================
    // Multi-voucher Flow
    // ========================================================================

    function test_multipleVoucherRedemptions() public {
        entryPoint.setBackendAuthorization(backend, true);

        // Generate 3 vouchers
        for (uint256 i = 1; i <= 3; i++) {
            string memory code = string(abi.encodePacked("MULTI", vm.toString(i)));
            bytes32 codeHash = keccak256(abi.encodePacked(code));
            voucherMgr.generateVoucher(codeHash, i * 100 * 10 ** 18);
        }

        // Redeem all 3 as backend
        vm.startPrank(backend);
        entryPoint.redeemVoucher("MULTI1", user1, false);
        entryPoint.redeemVoucher("MULTI2", user1, false);
        entryPoint.redeemVoucher("MULTI3", user2, false);
        vm.stopPrank();

        // user1 gets 100 + 200 = 300 tokens
        assertEq(token.balanceOf(user1), 300 * 10 ** 18);
        // user2 gets 300 tokens
        assertEq(token.balanceOf(user2), 300 * 10 ** 18);
    }
}
