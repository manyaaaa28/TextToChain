//! ENS Domain Registration module
//! Handles registering .eth domains directly via ETHRegistrarController on Sepolia

use ethers::prelude::*;
use ethers::utils::keccak256;
use std::sync::Arc;

use crate::ens::{ETHRegistrarController, ETH_REGISTRAR_CONTROLLER_SEPOLIA, PUBLIC_RESOLVER_SEPOLIA};

/// Domain Registrar - handles registering .eth domains on Sepolia
pub struct DomainRegistrar {
    controller: ETHRegistrarController<SignerMiddleware<Provider<Http>, LocalWallet>>,
    resolver_address: Address,
}

impl DomainRegistrar {
    /// Create a new domain registrar
    pub fn new(
        client: Arc<SignerMiddleware<Provider<Http>, LocalWallet>>,
    ) -> eyre::Result<Self> {
        let controller_address: Address = ETH_REGISTRAR_CONTROLLER_SEPOLIA.parse()?;
        let resolver_address: Address = PUBLIC_RESOLVER_SEPOLIA.parse()?;
        
        let controller = ETHRegistrarController::new(controller_address, client);
        
        Ok(Self {
            controller,
            resolver_address,
        })
    }
    
    /// Check if a name is available for registration
    pub async fn is_available(&self, name: &str) -> eyre::Result<bool> {
        let available = self.controller.available(name.to_string()).call().await?;
        Ok(available)
    }
    
    /// Get the price to register a name for a given duration (in seconds)
    pub async fn get_price(&self, name: &str, duration_seconds: u64) -> eyre::Result<U256> {
        let (base, premium) = self.controller
            .rent_price(name.to_string(), U256::from(duration_seconds))
            .call()
            .await?;
        Ok(base + premium)
    }
    
    /// Generate a random secret for the commitment
    pub fn generate_secret() -> [u8; 32] {
        let mut secret = [0u8; 32];
        // Use timestamp + some entropy as a simple secret
        let timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let hash = keccak256(timestamp.to_le_bytes());
        secret.copy_from_slice(&hash);
        secret
    }
    
    /// Step 1: Make a commitment (to prevent front-running)
    pub async fn commit(
        &self,
        name: &str,
        owner: Address,
        duration_seconds: u64,
        secret: [u8; 32],
    ) -> eyre::Result<H256> {
        // Generate commitment hash
        let commitment = self.controller
            .make_commitment(
                name.to_string(),
                owner,
                U256::from(duration_seconds),
                secret,
                self.resolver_address,
                vec![],  // No additional data
                true,    // Set reverse record
                0,       // No fuses
            )
            .call()
            .await?;
        
        println!("📝 Commitment hash: {:?}", commitment);
        
        // Submit commitment
        let tx = self.controller.commit(commitment);
        let pending = tx.send().await?;
        let receipt = pending.await?;
        
        if let Some(receipt) = receipt {
            println!("   ✅ Commit tx confirmed: {:?}", receipt.transaction_hash);
            return Ok(receipt.transaction_hash);
        }
        
        Err(eyre::eyre!("Commit transaction failed"))
    }
    
    /// Get minimum commitment age (wait time between commit and register)
    pub async fn get_min_commitment_age(&self) -> eyre::Result<u64> {
        let age = self.controller.min_commitment_age().call().await?;
        Ok(age.as_u64())
    }
    
    /// Step 2: Register the domain (after waiting for commitment age)
    pub async fn register(
        &self,
        name: &str,
        owner: Address,
        duration_seconds: u64,
        secret: [u8; 32],
        value: U256,
    ) -> eyre::Result<H256> {
        let tx = self.controller
            .register(
                name.to_string(),
                owner,
                U256::from(duration_seconds),
                secret,
                self.resolver_address,
                vec![],  // No additional data
                true,    // Set reverse record
                0,       // No fuses
            )
            .value(value);
        
        let pending = tx.send().await?;
        let receipt = pending.await?;
        
        if let Some(receipt) = receipt {
            println!("   ✅ Register tx confirmed: {:?}", receipt.transaction_hash);
            return Ok(receipt.transaction_hash);
        }
        
        Err(eyre::eyre!("Register transaction failed"))
    }
    
    /// Full registration flow: commit, wait, register
    pub async fn register_domain(
        &self,
        name: &str,
        owner: Address,
        duration_years: u32,
    ) -> eyre::Result<String> {
        let duration_seconds = duration_years as u64 * 365 * 24 * 60 * 60;
        
        // Check availability
        println!("🔍 Checking if {}.eth is available...", name);
        if !self.is_available(name).await? {
            return Err(eyre::eyre!("Name {}.eth is not available", name));
        }
        println!("   ✅ Name is available!");
        
        // Get price
        println!("💰 Getting price...");
        let price = self.get_price(name, duration_seconds).await?;
        let price_with_buffer = price * 110 / 100; // Add 10% buffer for gas fluctuations
        println!("   Price: {} wei (+ 10% buffer)", price);
        
        // Generate secret
        let secret = Self::generate_secret();
        
        // Step 1: Commit
        println!("\n📝 Step 1/2: Submitting commitment...");
        self.commit(name, owner, duration_seconds, secret).await?;
        
        // Wait for minimum commitment age
        let wait_time = self.get_min_commitment_age().await?;
        println!("\n⏳ Waiting {} seconds for commitment to mature...", wait_time + 5);
        
        for i in (1..=(wait_time + 5)).rev() {
            print!("\r   {} seconds remaining...  ", i);
            std::io::Write::flush(&mut std::io::stdout()).unwrap();
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        }
        println!("\r   ✅ Wait complete!              ");
        
        // Step 2: Register
        println!("\n📝 Step 2/2: Registering domain...");
        self.register(name, owner, duration_seconds, secret, price_with_buffer).await?;
        
        let full_name = format!("{}.eth", name);
        println!("\n🎉 Successfully registered {}!", full_name);
        
        Ok(full_name)
    }
}
