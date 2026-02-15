//! SMS Handler for ENS naming via text messages
//! Provides a simple interface for Twilio integration

use crate::ens::EnsMinter;
use ethers::prelude::*;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

/// Conversation states for SMS flow
#[derive(Clone, Debug)]
pub enum ConversationState {
    /// Show menu, waiting for choice (1, 2, or 3)
    Menu,
    /// User chose "1", waiting for wallet address
    WaitingForAddress,
    /// Got address, waiting for name
    WaitingForName(Address),
    /// User chose "2", waiting for name to lookup
    WaitingForLookup,
}

/// Stores conversation state and registered names per phone number
pub struct SmsHandler {
    /// Conversation state per phone number
    states: HashMap<String, ConversationState>,
    /// Registered names per phone number (name -> address)
    names: HashMap<String, HashMap<String, Address>>,
    /// ENS minter for on-chain operations
    minter: Option<Arc<EnsMinter>>,
    /// Parent domain for display
    parent_domain: String,
}

impl SmsHandler {
    /// Create a new SMS handler
    pub fn new(parent_domain: &str) -> Self {
        Self {
            states: HashMap::new(),
            names: HashMap::new(),
            minter: None,
            parent_domain: parent_domain.to_string(),
        }
    }

    /// Set the ENS minter for on-chain operations
    pub fn set_minter(&mut self, minter: Arc<EnsMinter>) {
        self.minter = Some(minter);
    }

    /// Get the menu text
    fn menu_text(&self) -> String {
        "🌟 Welcome to Lumina ENS!\n\n\
         1️⃣ Name a wallet address\n\
         2️⃣ Lookup a name\n\
         3️⃣ List your names\n\n\
         Reply with 1, 2, or 3".to_string()
    }

    /// Handle an incoming SMS message
    /// Returns the reply to send back
    pub async fn handle_sms(&mut self, phone: &str, message: &str) -> String {
        let message = message.trim().to_lowercase();
        
        // Get current state (default to Menu)
        let state = self.states.get(phone).cloned().unwrap_or(ConversationState::Menu);

        match state {
            ConversationState::Menu => {
                self.handle_menu_choice(phone, &message).await
            }
            ConversationState::WaitingForAddress => {
                self.handle_address_input(phone, &message).await
            }
            ConversationState::WaitingForName(address) => {
                self.handle_name_input(phone, &message, address).await
            }
            ConversationState::WaitingForLookup => {
                self.handle_lookup_input(phone, &message).await
            }
        }
    }

    /// Handle menu choice (1, 2, or 3)
    async fn handle_menu_choice(&mut self, phone: &str, choice: &str) -> String {
        match choice {
            "1" => {
                self.states.insert(phone.to_string(), ConversationState::WaitingForAddress);
                "📝 Send the wallet address (0x...)".to_string()
            }
            "2" => {
                self.states.insert(phone.to_string(), ConversationState::WaitingForLookup);
                "🔍 Send the name to lookup".to_string()
            }
            "3" => {
                let reply = self.list_names(phone);
                self.states.insert(phone.to_string(), ConversationState::Menu);
                format!("{}\n\n{}", reply, self.menu_text())
            }
            "menu" | "start" | "hi" | "hello" => {
                self.states.insert(phone.to_string(), ConversationState::Menu);
                self.menu_text()
            }
            _ => {
                self.menu_text()
            }
        }
    }

    /// Handle wallet address input
    async fn handle_address_input(&mut self, phone: &str, address_str: &str) -> String {
        // Handle cancel
        if address_str == "cancel" || address_str == "0" {
            self.states.insert(phone.to_string(), ConversationState::Menu);
            return format!("❌ Cancelled\n\n{}", self.menu_text());
        }

        // Parse address
        match address_str.parse::<Address>() {
            Ok(address) => {
                self.states.insert(phone.to_string(), ConversationState::WaitingForName(address));
                format!("✅ Got it!\n\nNow send a friendly name for:\n{:?}", address)
            }
            Err(_) => {
                "❌ Invalid address!\n\nSend a valid wallet address (0x...) or 'cancel'".to_string()
            }
        }
    }

    /// Handle name input for registration
    async fn handle_name_input(&mut self, phone: &str, name: &str, address: Address) -> String {
        // Handle cancel
        if name == "cancel" || name == "0" {
            self.states.insert(phone.to_string(), ConversationState::Menu);
            return format!("❌ Cancelled\n\n{}", self.menu_text());
        }

        // Validate name (alphanumeric only)
        if !name.chars().all(|c| c.is_alphanumeric()) {
            return "❌ Name must be alphanumeric only!\n\nTry again or send 'cancel'".to_string();
        }

        if name.is_empty() || name.len() > 20 {
            return "❌ Name must be 1-20 characters!\n\nTry again or send 'cancel'".to_string();
        }

        // Register locally
        let user_names = self.names.entry(phone.to_string()).or_insert_with(HashMap::new);
        user_names.insert(name.to_string(), address);

        // Try on-chain minting if minter is available
        let onchain_status = if let Some(minter) = &self.minter {
            match minter.mint_subdomain(name, address).await {
                Ok(_) => "✅ Saved on-chain!".to_string(),
                Err(e) => format!("⚠️ Local only (chain error: {})", e),
            }
        } else {
            "📝 Saved locally".to_string()
        };

        self.states.insert(phone.to_string(), ConversationState::Menu);
        
        format!(
            "🎉 Done!\n\n\
             {}.eth → {:?}\n\n\
             {}\n\n\
             {}",
            name,
            address,
            onchain_status,
            self.menu_text()
        )
    }

    /// Handle name lookup input
    async fn handle_lookup_input(&mut self, phone: &str, name: &str) -> String {
        // Handle cancel
        if name == "cancel" || name == "0" {
            self.states.insert(phone.to_string(), ConversationState::Menu);
            return format!("❌ Cancelled\n\n{}", self.menu_text());
        }

        let name = name.to_lowercase();
        
        // Look up in user's names
        if let Some(user_names) = self.names.get(phone) {
            if let Some(address) = user_names.get(&name) {
                self.states.insert(phone.to_string(), ConversationState::Menu);
                return format!(
                    "✅ Found!\n\n{}.eth → {:?}\n\n{}",
                    name,
                    address,
                    self.menu_text()
                );
            }
        }

        self.states.insert(phone.to_string(), ConversationState::Menu);
        format!("❌ '{}' not found\n\n{}", name, self.menu_text())
    }

    /// List all names for a phone number
    fn list_names(&self, phone: &str) -> String {
        if let Some(user_names) = self.names.get(phone) {
            if user_names.is_empty() {
                return "📭 You haven't named any addresses yet".to_string();
            }
            
            let mut list = "📖 Your Names:\n".to_string();
            for (name, addr) in user_names {
                list.push_str(&format!("\n• {}.eth → {:?}", name, addr));
            }
            list
        } else {
            "📭 You haven't named any addresses yet".to_string()
        }
    }

    /// Reset a user's conversation state
    pub fn reset(&mut self, phone: &str) {
        self.states.insert(phone.to_string(), ConversationState::Menu);
    }
}

/// Thread-safe wrapper for use with async web frameworks
pub type SharedSmsHandler = Arc<Mutex<SmsHandler>>;

/// Create a shared SMS handler
pub fn create_shared_handler(parent_domain: &str) -> SharedSmsHandler {
    Arc::new(Mutex::new(SmsHandler::new(parent_domain)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn test_menu_flow() {
        let mut handler = SmsHandler::new("test.eth");
        
        // First message shows menu
        let reply = handler.handle_sms("+1234", "hi").await;
        assert!(reply.contains("Welcome"));
        
        // Choose option 1
        let reply = handler.handle_sms("+1234", "1").await;
        assert!(reply.contains("wallet address"));
    }

    #[tokio::test]
    async fn test_registration_flow() {
        let mut handler = SmsHandler::new("test.eth");
        
        // Start flow
        handler.handle_sms("+1234", "1").await;
        
        // Send address
        let reply = handler.handle_sms("+1234", "0x742d35Cc6634C0532925a3b844Bc9e7595f8fE8f").await;
        assert!(reply.contains("Got it"));
        
        // Send name
        let reply = handler.handle_sms("+1234", "alice").await;
        assert!(reply.contains("Done"));
        assert!(reply.contains("alice.eth"));
    }
}
