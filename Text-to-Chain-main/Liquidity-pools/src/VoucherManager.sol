// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./TokenXYZ.sol";

/**
 * @title VoucherManager
 * @dev Manages voucher generation, redemption, and shop registration
 * @notice Shops stake liquidity to generate vouchers that users redeem for TokenXYZ
 */
contract VoucherManager is Ownable, ReentrancyGuard {
    
    TokenXYZ public immutable tokenXYZ;
    
    struct Shop {
        address shopAddress;
        string name;
        string location;
        uint256 stakedAmount;
        uint256 availableBalance;
        uint256 totalCommission;
        uint256 vouchersSold;
        uint256 vouchersRedeemed;
        bool isActive;
        uint256 registeredAt;
    }
    
    struct Voucher {
        bytes32 codeHash;
        address shopAddress;
        uint256 tokenAmount;
        bool isRedeemed;
        address redeemedBy;
        uint256 createdAt;
        uint256 redeemedAt;
    }
    
    mapping(address => Shop) public shops;
    mapping(bytes32 => Voucher) public vouchers;
    
    address[] public shopList;
    
    uint256 public constant MIN_STAKE = 1 ether;
    uint256 public constant COMMISSION_RATE = 200; // 2% in basis points
    uint256 public constant BASIS_POINTS = 10000;
    
    uint256 public tokenPriceInWei = 0.0001 ether; // 1 TXTC = 0.0001 ETH
    
    event ShopRegistered(address indexed shopAddress, string name, uint256 stakedAmount);
    event ShopStakeIncreased(address indexed shopAddress, uint256 amount);
    event ShopDeactivated(address indexed shopAddress);
    event VoucherGenerated(bytes32 indexed codeHash, address indexed shopAddress, uint256 tokenAmount);
    event VoucherRedeemed(bytes32 indexed codeHash, address indexed user, uint256 tokenAmount);
    event CommissionPaid(address indexed shopAddress, uint256 amount);
    event TokenPriceUpdated(uint256 newPrice);
    
    modifier onlyActiveShop() {
        require(shops[msg.sender].isActive, "VoucherManager: shop not active");
        _;
    }
    
    constructor(address _tokenXYZ) Ownable(msg.sender) {
        require(_tokenXYZ != address(0), "VoucherManager: zero address");
        tokenXYZ = TokenXYZ(_tokenXYZ);
    }
    
    /**
     * @dev Register a new shop with staked liquidity
     * @param name Shop name
     * @param location Shop location
     */
    function registerShop(string memory name, string memory location) external payable {
        require(msg.value >= MIN_STAKE, "VoucherManager: insufficient stake");
        require(!shops[msg.sender].isActive, "VoucherManager: shop already registered");
        require(bytes(name).length > 0, "VoucherManager: empty name");
        
        shops[msg.sender] = Shop({
            shopAddress: msg.sender,
            name: name,
            location: location,
            stakedAmount: msg.value,
            availableBalance: msg.value,
            totalCommission: 0,
            vouchersSold: 0,
            vouchersRedeemed: 0,
            isActive: true,
            registeredAt: block.timestamp
        });
        
        shopList.push(msg.sender);
        
        emit ShopRegistered(msg.sender, name, msg.value);
    }
    
    /**
     * @dev Increase shop stake
     */
    function increaseStake() external payable onlyActiveShop {
        require(msg.value > 0, "VoucherManager: zero value");
        
        shops[msg.sender].stakedAmount += msg.value;
        shops[msg.sender].availableBalance += msg.value;
        
        emit ShopStakeIncreased(msg.sender, msg.value);
    }
    
    /**
     * @dev Generate voucher codes (can be called by anyone, including backend)
     * @param codeHash Hash of the voucher code
     * @param tokenAmount Amount of tokens for this voucher
     * @notice If caller is not a shop, voucher is created without balance deduction
     */
    function generateVoucher(bytes32 codeHash, uint256 tokenAmount) external {
        require(codeHash != bytes32(0), "VoucherManager: invalid code hash");
        require(tokenAmount > 0, "VoucherManager: zero amount");
        require(vouchers[codeHash].codeHash == bytes32(0), "VoucherManager: voucher exists");
        
        address shopAddress = msg.sender;
        
        // If caller is an active shop, deduct from their balance
        if (shops[msg.sender].isActive) {
            uint256 requiredEth = (tokenAmount * tokenPriceInWei) / 1e18;
            require(shops[msg.sender].availableBalance >= requiredEth, "VoucherManager: insufficient balance");
            
            shops[msg.sender].availableBalance -= requiredEth;
            shops[msg.sender].vouchersSold++;
        }
        // Otherwise, allow voucher creation without balance requirement (for backend/owner)
        
        vouchers[codeHash] = Voucher({
            codeHash: codeHash,
            shopAddress: shopAddress,
            tokenAmount: tokenAmount,
            isRedeemed: false,
            redeemedBy: address(0),
            createdAt: block.timestamp,
            redeemedAt: 0
        });
        
        emit VoucherGenerated(codeHash, shopAddress, tokenAmount);
    }
    
    /**
     * @dev Redeem a voucher (called by EntryPoint contract)
     * @param code Plain text voucher code
     * @param user User redeeming the voucher
     */
    function redeemVoucher(string memory code, address user) external nonReentrant returns (uint256) {
        require(user != address(0), "VoucherManager: zero address");
        
        bytes32 codeHash = keccak256(abi.encodePacked(code));
        Voucher storage voucher = vouchers[codeHash];
        
        require(voucher.codeHash != bytes32(0), "VoucherManager: voucher not found");
        require(!voucher.isRedeemed, "VoucherManager: already redeemed");
        
        voucher.isRedeemed = true;
        voucher.redeemedBy = user;
        voucher.redeemedAt = block.timestamp;
        
        Shop storage shop = shops[voucher.shopAddress];
        shop.vouchersRedeemed++;
        
        uint256 commission = (voucher.tokenAmount * COMMISSION_RATE) / BASIS_POINTS;
        shop.totalCommission += commission;
        
        tokenXYZ.mint(user, voucher.tokenAmount);
        
        emit VoucherRedeemed(codeHash, user, voucher.tokenAmount);
        emit CommissionPaid(voucher.shopAddress, commission);
        
        return voucher.tokenAmount;
    }
    
    /**
     * @dev Deactivate shop and withdraw stake
     */
    function deactivateShop() external onlyActiveShop nonReentrant {
        Shop storage shop = shops[msg.sender];
        
        require(shop.availableBalance > 0, "VoucherManager: no balance");
        
        uint256 withdrawAmount = shop.availableBalance;
        shop.availableBalance = 0;
        shop.isActive = false;
        
        (bool success, ) = msg.sender.call{value: withdrawAmount}("");
        require(success, "VoucherManager: transfer failed");
        
        emit ShopDeactivated(msg.sender);
    }
    
    /**
     * @dev Update token price (owner only)
     * @param newPriceInWei New price in wei
     */
    function updateTokenPrice(uint256 newPriceInWei) external onlyOwner {
        require(newPriceInWei > 0, "VoucherManager: zero price");
        tokenPriceInWei = newPriceInWei;
        emit TokenPriceUpdated(newPriceInWei);
    }
    
    /**
     * @dev Get shop details
     * @param shopAddress Shop address
     */
    function getShop(address shopAddress) external view returns (Shop memory) {
        return shops[shopAddress];
    }
    
    /**
     * @dev Get voucher details
     * @param code Voucher code
     */
    function getVoucher(string memory code) external view returns (Voucher memory) {
        bytes32 codeHash = keccak256(abi.encodePacked(code));
        return vouchers[codeHash];
    }
    
    /**
     * @dev Get all shops
     */
    function getAllShops() external view returns (address[] memory) {
        return shopList;
    }
    
    /**
     * @dev Get total number of shops
     */
    function getShopCount() external view returns (uint256) {
        return shopList.length;
    }
}
