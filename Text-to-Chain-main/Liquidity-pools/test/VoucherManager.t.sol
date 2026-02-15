// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/TokenXYZ.sol";
import "../src/VoucherManager.sol";

contract VoucherManagerTest is Test {
    TokenXYZ public token;
    VoucherManager public voucher;
    address public owner;
    address public shop1;
    address public shop2;
    address public user1;
    address public user2;
    address public backend;

    event ShopRegistered(address indexed shopAddress, string name, uint256 stakedAmount);
    event ShopStakeIncreased(address indexed shopAddress, uint256 amount);
    event ShopDeactivated(address indexed shopAddress);
    event VoucherGenerated(bytes32 indexed codeHash, address indexed shopAddress, uint256 tokenAmount);
    event VoucherRedeemed(bytes32 indexed codeHash, address indexed user, uint256 tokenAmount);
    event CommissionPaid(address indexed shopAddress, uint256 amount);
    event TokenPriceUpdated(uint256 newPrice);

    function setUp() public {
        owner = address(this);
        shop1 = makeAddr("shop1");
        shop2 = makeAddr("shop2");
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        backend = makeAddr("backend");

        token = new TokenXYZ();
        voucher = new VoucherManager(address(token));

        // Grant VoucherManager minting rights
        token.addMinter(address(voucher));

        // Fund shops with ETH
        vm.deal(shop1, 10 ether);
        vm.deal(shop2, 10 ether);
    }

    // ========================================================================
    // Deployment
    // ========================================================================

    function test_deployment() public view {
        assertEq(address(voucher.tokenXYZ()), address(token));
        assertEq(voucher.owner(), owner);
        assertEq(voucher.MIN_STAKE(), 1 ether);
        assertEq(voucher.COMMISSION_RATE(), 200);
        assertEq(voucher.BASIS_POINTS(), 10000);
        assertEq(voucher.tokenPriceInWei(), 0.0001 ether);
        assertEq(voucher.getShopCount(), 0);
    }

    function test_deployment_revertZeroAddress() public {
        vm.expectRevert("VoucherManager: zero address");
        new VoucherManager(address(0));
    }

    // ========================================================================
    // Shop Registration
    // ========================================================================

    function test_registerShop() public {
        vm.expectEmit(true, false, false, true);
        emit ShopRegistered(shop1, "Coffee Shop", 2 ether);

        vm.prank(shop1);
        voucher.registerShop{value: 2 ether}("Coffee Shop", "NYC");

        VoucherManager.Shop memory s = voucher.getShop(shop1);
        assertEq(s.shopAddress, shop1);
        assertEq(s.name, "Coffee Shop");
        assertEq(s.location, "NYC");
        assertEq(s.stakedAmount, 2 ether);
        assertEq(s.availableBalance, 2 ether);
        assertTrue(s.isActive);
        assertEq(s.vouchersSold, 0);
        assertEq(s.vouchersRedeemed, 0);
        assertEq(voucher.getShopCount(), 1);
    }

    function test_registerShop_revertInsufficientStake() public {
        vm.prank(shop1);
        vm.expectRevert("VoucherManager: insufficient stake");
        voucher.registerShop{value: 0.5 ether}("Shop", "Loc");
    }

    function test_registerShop_revertAlreadyRegistered() public {
        vm.prank(shop1);
        voucher.registerShop{value: 1 ether}("Shop", "Loc");

        vm.prank(shop1);
        vm.expectRevert("VoucherManager: shop already registered");
        voucher.registerShop{value: 1 ether}("Shop2", "Loc2");
    }

    function test_registerShop_revertEmptyName() public {
        vm.prank(shop1);
        vm.expectRevert("VoucherManager: empty name");
        voucher.registerShop{value: 1 ether}("", "Loc");
    }

    function test_registerMultipleShops() public {
        vm.prank(shop1);
        voucher.registerShop{value: 1 ether}("Shop1", "Loc1");

        vm.prank(shop2);
        voucher.registerShop{value: 2 ether}("Shop2", "Loc2");

        assertEq(voucher.getShopCount(), 2);
        address[] memory allShops = voucher.getAllShops();
        assertEq(allShops[0], shop1);
        assertEq(allShops[1], shop2);
    }

    // ========================================================================
    // Increase Stake
    // ========================================================================

    function test_increaseStake() public {
        vm.prank(shop1);
        voucher.registerShop{value: 1 ether}("Shop", "Loc");

        vm.expectEmit(true, false, false, true);
        emit ShopStakeIncreased(shop1, 2 ether);

        vm.prank(shop1);
        voucher.increaseStake{value: 2 ether}();

        VoucherManager.Shop memory s = voucher.getShop(shop1);
        assertEq(s.stakedAmount, 3 ether);
        assertEq(s.availableBalance, 3 ether);
    }

    function test_increaseStake_revertNotActive() public {
        vm.prank(shop1);
        vm.expectRevert("VoucherManager: shop not active");
        voucher.increaseStake{value: 1 ether}();
    }

    function test_increaseStake_revertZeroValue() public {
        vm.prank(shop1);
        voucher.registerShop{value: 1 ether}("Shop", "Loc");

        vm.prank(shop1);
        vm.expectRevert("VoucherManager: zero value");
        voucher.increaseStake{value: 0}();
    }

    // ========================================================================
    // Voucher Generation
    // ========================================================================

    function test_generateVoucher_byShop() public {
        vm.prank(shop1);
        voucher.registerShop{value: 5 ether}("Shop", "Loc");

        bytes32 codeHash = keccak256(abi.encodePacked("VOUCHER1"));
        uint256 tokenAmount = 100 * 10 ** 18;

        vm.expectEmit(true, true, false, true);
        emit VoucherGenerated(codeHash, shop1, tokenAmount);

        vm.prank(shop1);
        voucher.generateVoucher(codeHash, tokenAmount);

        VoucherManager.Voucher memory v = voucher.getVoucher("VOUCHER1");
        assertEq(v.codeHash, codeHash);
        assertEq(v.shopAddress, shop1);
        assertEq(v.tokenAmount, tokenAmount);
        assertFalse(v.isRedeemed);
        assertEq(v.redeemedBy, address(0));

        // Check shop balance deducted
        VoucherManager.Shop memory s = voucher.getShop(shop1);
        // 100 tokens * 0.0001 ETH = 0.01 ETH deducted
        assertEq(s.availableBalance, 5 ether - 0.01 ether);
        assertEq(s.vouchersSold, 1);
    }

    function test_generateVoucher_byBackend() public {
        // Non-shop can generate vouchers without balance deduction
        bytes32 codeHash = keccak256(abi.encodePacked("BACKEND_VOUCHER"));
        uint256 tokenAmount = 500 * 10 ** 18;

        vm.prank(backend);
        voucher.generateVoucher(codeHash, tokenAmount);

        VoucherManager.Voucher memory v = voucher.getVoucher("BACKEND_VOUCHER");
        assertEq(v.tokenAmount, tokenAmount);
        assertEq(v.shopAddress, backend);
    }

    function test_generateVoucher_revertInvalidHash() public {
        vm.expectRevert("VoucherManager: invalid code hash");
        voucher.generateVoucher(bytes32(0), 100);
    }

    function test_generateVoucher_revertZeroAmount() public {
        bytes32 codeHash = keccak256(abi.encodePacked("V1"));
        vm.expectRevert("VoucherManager: zero amount");
        voucher.generateVoucher(codeHash, 0);
    }

    function test_generateVoucher_revertDuplicate() public {
        bytes32 codeHash = keccak256(abi.encodePacked("V1"));
        voucher.generateVoucher(codeHash, 100 * 10 ** 18);

        vm.expectRevert("VoucherManager: voucher exists");
        voucher.generateVoucher(codeHash, 200 * 10 ** 18);
    }

    function test_generateVoucher_revertInsufficientBalance() public {
        vm.prank(shop1);
        voucher.registerShop{value: 1 ether}("Shop", "Loc");

        bytes32 codeHash = keccak256(abi.encodePacked("BIG"));
        // 20_000_000 tokens * 0.0001 ETH = 2000 ETH needed, but only 1 ETH staked
        uint256 hugeAmount = 20_000_000 * 10 ** 18;

        vm.prank(shop1);
        vm.expectRevert("VoucherManager: insufficient balance");
        voucher.generateVoucher(codeHash, hugeAmount);
    }

    // ========================================================================
    // Voucher Redemption
    // ========================================================================

    function test_redeemVoucher() public {
        // Generate voucher (as backend/owner)
        bytes32 codeHash = keccak256(abi.encodePacked("REDEEM1"));
        uint256 tokenAmount = 100 * 10 ** 18;
        voucher.generateVoucher(codeHash, tokenAmount);

        vm.expectEmit(true, true, false, true);
        emit VoucherRedeemed(codeHash, user1, tokenAmount);

        uint256 redeemed = voucher.redeemVoucher("REDEEM1", user1);

        assertEq(redeemed, tokenAmount);
        assertEq(token.balanceOf(user1), tokenAmount);

        // Voucher marked as redeemed
        VoucherManager.Voucher memory v = voucher.getVoucher("REDEEM1");
        assertTrue(v.isRedeemed);
        assertEq(v.redeemedBy, user1);
        assertTrue(v.redeemedAt > 0);
    }

    function test_redeemVoucher_commission() public {
        vm.prank(shop1);
        voucher.registerShop{value: 5 ether}("Shop", "Loc");

        bytes32 codeHash = keccak256(abi.encodePacked("COMM1"));
        uint256 tokenAmount = 1000 * 10 ** 18;

        vm.prank(shop1);
        voucher.generateVoucher(codeHash, tokenAmount);

        voucher.redeemVoucher("COMM1", user1);

        VoucherManager.Shop memory s = voucher.getShop(shop1);
        // Commission = 1000 * 200 / 10000 = 20 tokens (2%)
        assertEq(s.totalCommission, 20 * 10 ** 18);
        assertEq(s.vouchersRedeemed, 1);
    }

    function test_redeemVoucher_revertNotFound() public {
        vm.expectRevert("VoucherManager: voucher not found");
        voucher.redeemVoucher("NONEXISTENT", user1);
    }

    function test_redeemVoucher_revertAlreadyRedeemed() public {
        bytes32 codeHash = keccak256(abi.encodePacked("ONCE"));
        voucher.generateVoucher(codeHash, 100 * 10 ** 18);

        voucher.redeemVoucher("ONCE", user1);

        vm.expectRevert("VoucherManager: already redeemed");
        voucher.redeemVoucher("ONCE", user2);
    }

    function test_redeemVoucher_revertZeroAddress() public {
        bytes32 codeHash = keccak256(abi.encodePacked("ZERO"));
        voucher.generateVoucher(codeHash, 100 * 10 ** 18);

        vm.expectRevert("VoucherManager: zero address");
        voucher.redeemVoucher("ZERO", address(0));
    }

    // ========================================================================
    // Shop Deactivation
    // ========================================================================

    function test_deactivateShop() public {
        vm.prank(shop1);
        voucher.registerShop{value: 3 ether}("Shop", "Loc");

        uint256 balBefore = shop1.balance;

        vm.expectEmit(true, false, false, false);
        emit ShopDeactivated(shop1);

        vm.prank(shop1);
        voucher.deactivateShop();

        VoucherManager.Shop memory s = voucher.getShop(shop1);
        assertFalse(s.isActive);
        assertEq(s.availableBalance, 0);
        assertEq(shop1.balance, balBefore + 3 ether);
    }

    function test_deactivateShop_revertNotActive() public {
        vm.prank(shop1);
        vm.expectRevert("VoucherManager: shop not active");
        voucher.deactivateShop();
    }

    function test_deactivateShop_partialBalance() public {
        vm.prank(shop1);
        voucher.registerShop{value: 5 ether}("Shop", "Loc");

        // Generate a voucher to reduce available balance
        bytes32 codeHash = keccak256(abi.encodePacked("V1"));
        vm.prank(shop1);
        voucher.generateVoucher(codeHash, 10000 * 10 ** 18); // costs 1 ETH

        uint256 balBefore = shop1.balance;

        vm.prank(shop1);
        voucher.deactivateShop();

        // Should get back 4 ETH (5 - 1 used for voucher)
        assertEq(shop1.balance, balBefore + 4 ether);
    }

    // ========================================================================
    // Token Price
    // ========================================================================

    function test_updateTokenPrice() public {
        uint256 newPrice = 0.001 ether;

        vm.expectEmit(false, false, false, true);
        emit TokenPriceUpdated(newPrice);

        voucher.updateTokenPrice(newPrice);
        assertEq(voucher.tokenPriceInWei(), newPrice);
    }

    function test_updateTokenPrice_revertZero() public {
        vm.expectRevert("VoucherManager: zero price");
        voucher.updateTokenPrice(0);
    }

    function test_updateTokenPrice_revertNotOwner() public {
        vm.prank(user1);
        vm.expectRevert(abi.encodeWithSignature("OwnableUnauthorizedAccount(address)", user1));
        voucher.updateTokenPrice(0.001 ether);
    }

    // ========================================================================
    // Full Flow
    // ========================================================================

    function test_fullFlow_shopRegister_generateVoucher_redeem() public {
        // 1. Shop registers
        vm.prank(shop1);
        voucher.registerShop{value: 5 ether}("TextChain Shop", "India");

        // 2. Shop generates voucher
        bytes32 codeHash = keccak256(abi.encodePacked("TXTC100"));
        vm.prank(shop1);
        voucher.generateVoucher(codeHash, 100 * 10 ** 18);

        // 3. User redeems
        uint256 redeemed = voucher.redeemVoucher("TXTC100", user1);
        assertEq(redeemed, 100 * 10 ** 18);
        assertEq(token.balanceOf(user1), 100 * 10 ** 18);

        // 4. Verify shop state
        VoucherManager.Shop memory s = voucher.getShop(shop1);
        assertEq(s.vouchersSold, 1);
        assertEq(s.vouchersRedeemed, 1);
        assertEq(s.totalCommission, 2 * 10 ** 18); // 2% of 100
    }

    // ========================================================================
    // Fuzz Tests
    // ========================================================================

    function testFuzz_registerShop(uint256 stake) public {
        stake = bound(stake, 1 ether, 100 ether);
        vm.deal(shop1, stake);

        vm.prank(shop1);
        voucher.registerShop{value: stake}("FuzzShop", "FuzzLoc");

        VoucherManager.Shop memory s = voucher.getShop(shop1);
        assertEq(s.stakedAmount, stake);
        assertTrue(s.isActive);
    }

    function testFuzz_redeemVoucher(uint256 amount) public {
        amount = bound(amount, 1, 1_000_000 * 10 ** 18);

        bytes32 codeHash = keccak256(abi.encodePacked("FUZZ", amount));
        voucher.generateVoucher(codeHash, amount);

        // We need to use the exact same string to redeem
        // Since we can't reconstruct, generate with a fixed code
        bytes32 fixedHash = keccak256(abi.encodePacked("FUZZCODE"));
        // Skip if already exists
        if (voucher.getVoucher("FUZZCODE").codeHash == bytes32(0)) {
            voucher.generateVoucher(fixedHash, amount);
            uint256 redeemed = voucher.redeemVoucher("FUZZCODE", user1);
            assertEq(redeemed, amount);
        }
    }
}
