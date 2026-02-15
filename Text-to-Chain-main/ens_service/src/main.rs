mod ens;
mod register;
mod sms;

use ens::EnsMinter;
use ethers::prelude::*;
use ethers::signers::LocalWallet;
use std::collections::HashMap;
use std::convert::TryFrom;
use std::io::{self, Write};
use std::sync::Arc;

/// A simple in-memory address book that simulates ENS subdomain naming
/// In production, this would interact with actual ENS contracts
struct AddressBook {
    /// Maps friendly names to wallet addresses (e.g., "john" -> 0x123...)
    names: HashMap<String, Address>,
    /// The parent ENS domain (e.g., "ttc.eth")
    domain: String,
}

impl AddressBook {
    fn new(domain: &str) -> Self {
        Self {
            names: HashMap::new(),
            domain: domain.to_string(),
        }
    }

    /// Register a name for an address
    /// e.g., register("john", "0x1234...") creates "john.ttc.eth"
    fn register(&mut self, name: &str, address: Address) -> String {
        let full_ens_name = format!("{}.{}", name.to_lowercase(), self.domain);
        self.names.insert(name.to_lowercase(), address);
        full_ens_name
    }

    /// Resolve a name to its address
    fn resolve(&self, name: &str) -> Option<&Address> {
        self.names.get(&name.to_lowercase())
    }

    /// List all registered names
    fn list_all(&self) -> Vec<(String, Address)> {
        self.names
            .iter()
            .map(|(name, addr)| (format!("{}.{}", name, self.domain), *addr))
            .collect()
    }
}

fn print_menu() {
    println!("\n========================================");
    println!("       TTC ENS Address Book");
    println!("========================================");
    println!("1. Register a new name for an address");
    println!("2. Resolve a name to address");
    println!("3. List all registered names");
    println!("4. Verify address on-chain (mainnet)");
    println!("5. 🔗 Mint subdomain on-chain (Sepolia)");
    println!("6. 🆕 Register parent domain (Sepolia)");
    println!("7. Exit");
    println!("========================================");
    print!("Choose an option: ");
    io::stdout().flush().unwrap();
}

fn read_input(prompt: &str) -> String {
    print!("{}", prompt);
    io::stdout().flush().unwrap();
    let mut input = String::new();
    io::stdin().read_line(&mut input).unwrap();
    input.trim().to_string()
}

/// Load configuration from .env file
fn load_config() -> Option<(String, String, String)> {
    dotenv::dotenv().ok();
    
    let private_key = std::env::var("PRIVATE_KEY").ok()?;
    let rpc_url = std::env::var("RPC_URL").ok()?;
    let parent_domain = std::env::var("PARENT_DOMAIN").ok()?;
    
    Some((private_key, rpc_url, parent_domain))
}

#[tokio::main]
async fn main() -> eyre::Result<()> {
    // Load .env configuration
    let config = load_config();
    let on_chain_enabled = config.is_some();
    
    // Get parent domain from config or use default
    let parent_domain = config.as_ref()
        .map(|(_, _, d)| d.clone())
        .unwrap_or_else(|| "ttc.eth".to_string());
    
    // Initialize the address book with your domain
    let mut address_book = AddressBook::new(&parent_domain);

    // Provider for on-chain verification (mainnet - read only)
    let mainnet_rpc = "https://eth-mainnet.g.alchemy.com/v2/demo";
    let mainnet_provider = Provider::<Http>::try_from(mainnet_rpc)?;

    println!("\n🚀 Welcome to TTC ENS Address Book!");
    println!("Create friendly names for wallet addresses.");
    
    if on_chain_enabled {
        println!("✅ On-chain minting enabled (Sepolia)");
        println!("   Parent domain: {}", parent_domain);
    } else {
        println!("⚠️  On-chain minting disabled - .env not configured");
        println!("   Copy .env.example to .env and fill in your values");
    }

    loop {
        print_menu();

        let choice = read_input("");

        match choice.as_str() {
            "1" => {
                // Register a new name
                let address_str = read_input("\nEnter wallet address (0x...): ");
                
                // Parse and validate the address
                match address_str.parse::<Address>() {
                    Ok(address) => {
                        let name = read_input("Enter a friendly name (e.g., john, mom, alice): ");
                        
                        if name.is_empty() {
                            println!("❌ Name cannot be empty!");
                            continue;
                        }

                        // Check if name already exists
                        if address_book.resolve(&name).is_some() {
                            println!("⚠️  Name '{}' is already registered!", name);
                            let overwrite = read_input("Overwrite? (y/n): ");
                            if overwrite.to_lowercase() != "y" {
                                continue;
                            }
                        }

                        let ens_name = address_book.register(&name, address);
                        println!("\n✅ Success! Registered locally:");
                        println!("   Name:    {}", ens_name);
                        println!("   Address: {:?}", address);
                        
                        if on_chain_enabled {
                            println!("\n💡 Tip: Use option 5 to mint this on-chain!");
                        }
                    }
                    Err(_) => {
                        println!("❌ Invalid address format! Must be a valid Ethereum address (0x...)");
                    }
                }
            }

            "2" => {
                // Resolve a name
                let name = read_input(&format!("\nEnter name to resolve (without .{}): ", parent_domain));
                
                match address_book.resolve(&name) {
                    Some(address) => {
                        println!("\n✅ Found!");
                        println!("   {}.{} → {:?}", name.to_lowercase(), parent_domain, address);
                    }
                    None => {
                        println!("\n❌ Name '{}' not found in your address book.", name);
                    }
                }
            }

            "3" => {
                // List all names
                let entries = address_book.list_all();
                
                if entries.is_empty() {
                    println!("\n📭 Your address book is empty.");
                } else {
                    println!("\n📖 Your Address Book:");
                    println!("   {:<25} {}", "ENS Name", "Address");
                    println!("   {}", "-".repeat(70));
                    for (name, addr) in entries {
                        println!("   {:<25} {:?}", name, addr);
                    }
                }
            }

            "4" => {
                // Verify an address on-chain
                let ens_name = read_input("\nEnter full ENS name to verify (e.g., vitalik.eth): ");
                
                println!("🔍 Looking up {} on mainnet...", ens_name);
                
                match mainnet_provider.resolve_name(&ens_name).await {
                    Ok(address) => {
                        println!("✅ Found on-chain: {} → {:?}", ens_name, address);
                    }
                    Err(e) => {
                        println!("❌ Not found on mainnet: {}", e);
                    }
                }
            }

            "5" => {
                // Mint subdomain on-chain (Sepolia)
                if !on_chain_enabled {
                    println!("\n❌ On-chain minting is not configured!");
                    println!("   1. Copy .env.example to .env");
                    println!("   2. Fill in your PRIVATE_KEY, RPC_URL, and PARENT_DOMAIN");
                    println!("   3. Restart the application");
                    continue;
                }
                
                let (private_key, rpc_url, parent_domain) = config.as_ref().unwrap().clone();
                
                println!("\n🔗 On-Chain Subdomain Minting (Sepolia Testnet)");
                println!("   Parent domain: {}", parent_domain);
                
                // Get target address
                let address_str = read_input("\nEnter target wallet address (0x...): ");
                let target_address: Address = match address_str.parse() {
                    Ok(addr) => addr,
                    Err(_) => {
                        println!("❌ Invalid address format!");
                        continue;
                    }
                };
                
                // Get subdomain label
                let label = read_input(&format!("Enter subdomain name (will become <name>.{}): ", parent_domain));
                if label.is_empty() {
                    println!("❌ Name cannot be empty!");
                    continue;
                }
                
                // Confirm before minting
                let full_name = format!("{}.{}", label.to_lowercase(), parent_domain);
                println!("\n⚠️  About to mint on Sepolia:");
                println!("   Subdomain: {}", full_name);
                println!("   Points to: {:?}", target_address);
                let confirm = read_input("Proceed? (y/n): ");
                
                if confirm.to_lowercase() != "y" {
                    println!("Cancelled.");
                    continue;
                }
                
                println!("\n🚀 Minting subdomain on Sepolia...\n");
                
                // Set up the signer
                let provider = Provider::<Http>::try_from(rpc_url.as_str())?;
                let chain_id = provider.get_chainid().await?.as_u64();
                
                let wallet: LocalWallet = private_key.parse::<LocalWallet>()?.with_chain_id(chain_id);
                let client = SignerMiddleware::new(provider, wallet.clone());
                let client = Arc::new(client);
                
                // Verify we own the parent domain
                let minter = EnsMinter::new(client.clone(), &parent_domain)?;
                let wallet_address = wallet.address();
                
                println!("🔍 Verifying ownership of {}...", parent_domain);
                match minter.verify_ownership(wallet_address).await {
                    Ok(true) => {
                        println!("   ✅ You own this domain!\n");
                    }
                    Ok(false) => {
                        println!("   ❌ You don't own {}!", parent_domain);
                        println!("   Your wallet: {:?}", wallet_address);
                        println!("   Register this domain first on app.ens.domains (Sepolia)");
                        continue;
                    }
                    Err(e) => {
                        println!("   ❌ Failed to verify ownership: {}", e);
                        continue;
                    }
                }
                
                // Mint the subdomain
                match minter.mint_subdomain(&label, target_address).await {
                    Ok(subdomain) => {
                        println!("\n🎉 SUCCESS! Subdomain minted on Sepolia!");
                        println!("   Name:    {}", subdomain);
                        println!("   Address: {:?}", target_address);
                        println!("\n   Verify at: https://app.ens.domains/{}?chainId=11155111", subdomain);
                        
                        // Also register locally
                        address_book.register(&label, target_address);
                    }
                    Err(e) => {
                        println!("\n❌ Failed to mint subdomain: {}", e);
                    }
                }
            }

            "6" => {
                // Register parent domain on Sepolia
                if !on_chain_enabled {
                    println!("\n❌ On-chain registration is not configured!");
                    println!("   1. Copy .env.example to .env");
                    println!("   2. Fill in your PRIVATE_KEY, RPC_URL, and PARENT_DOMAIN");
                    println!("   3. Restart the application");
                    continue;
                }
                
                let (private_key, rpc_url, _) = config.as_ref().unwrap().clone();
                
                println!("\n🆕 Register Parent Domain on Sepolia");
                println!("   This will register a .eth domain that you can then use for subdomains.\n");
                
                // Get domain name
                let name = read_input("Enter domain name to register (without .eth): ");
                if name.is_empty() {
                    println!("❌ Name cannot be empty!");
                    continue;
                }
                
                // Get registration duration
                let years_str = read_input("Registration duration in years (1-5): ");
                let years: u32 = match years_str.parse() {
                    Ok(y) if y >= 1 && y <= 5 => y,
                    _ => {
                        println!("❌ Invalid duration! Using 1 year.");
                        1
                    }
                };
                
                // Confirm before registering
                println!("\n⚠️  About to register on Sepolia:");
                println!("   Domain: {}.eth", name);
                println!("   Duration: {} year(s)", years);
                let confirm = read_input("Proceed? (y/n): ");
                
                if confirm.to_lowercase() != "y" {
                    println!("Cancelled.");
                    continue;
                }
                
                println!("\n🚀 Starting registration process...\n");
                
                // Set up the signer
                let provider = Provider::<Http>::try_from(rpc_url.as_str())?;
                let chain_id = provider.get_chainid().await?.as_u64();
                
                let wallet: LocalWallet = private_key.parse::<LocalWallet>()?.with_chain_id(chain_id);
                let client = SignerMiddleware::new(provider, wallet.clone());
                let client = Arc::new(client);
                
                // Create registrar and register domain
                let registrar = register::DomainRegistrar::new(client.clone())?;
                let wallet_address = wallet.address();
                
                match registrar.register_domain(&name, wallet_address, years).await {
                    Ok(domain) => {
                        println!("\n🎉 SUCCESS! Domain registered on Sepolia!");
                        println!("   Domain: {}", domain);
                        println!("\n   Now update your .env file:");
                        println!("   PARENT_DOMAIN={}", domain);
                        println!("\n   Then restart and use Option 5 to mint subdomains!");
                    }
                    Err(e) => {
                        println!("\n❌ Failed to register domain: {}", e);
                    }
                }
            }

            "7" => {
                println!("\n👋 Goodbye!");
                break;
            }

            _ => {
                println!("\n❌ Invalid option. Please choose 1-7.");
            }
        }
    }

    Ok(())
}