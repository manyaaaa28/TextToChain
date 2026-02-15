mod admin;
mod admin_wallet;
mod commands;
mod config;
mod db;
mod routes;
mod sms;
mod wallet;
mod yellow_client;

use config::Config;
use commands::CommandProcessor;
use db::{create_pool, run_migrations, UserRepository, VoucherRepository, DepositRepository, AddressBookRepository};
use routes::{create_router, create_router_with_admin};
use sms::TwilioClient;
use wallet::create_shared_provider;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Initialize tracing
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "textchain=debug,tower_http=debug".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    // Load configuration
    let config = Config::from_env()?;
    
    tracing::info!(
        host = %config.server.host,
        port = %config.server.port,
        "Starting TextChain SMS backend"
    );

    // Get admin token from env (defaults to "admin123" for dev)
    let admin_token = std::env::var("ADMIN_TOKEN").unwrap_or_else(|_| "admin123".to_string());

    // Initialize database (optional - will work without if DATABASE_URL not set)
    let db_pool = if let Ok(database_url) = std::env::var("DATABASE_URL") {
        tracing::info!("Connecting to database...");
        let pool = create_pool(&database_url).await?;
        run_migrations(&pool).await?;
        Some(pool)
    } else {
        tracing::warn!("DATABASE_URL not set - running without database");
        None
    };

    // Initialize blockchain provider
    let provider = create_shared_provider();
    tracing::info!("Connected to Polygon Amoy testnet");

    // Initialize services
    let twilio = TwilioClient::new(&config.twilio);

    // Build router based on whether database is available
    let app = if let Some(ref pool) = db_pool {
        let user_repo = UserRepository::new(pool.clone());
        let voucher_repo = VoucherRepository::new(pool.clone());
        let deposit_repo = DepositRepository::new(pool.clone());
        let address_book_repo = AddressBookRepository::new(pool.clone());

        let command_processor = CommandProcessor::with_repos(
            Some(user_repo),
            Some(voucher_repo.clone()),
            Some(deposit_repo),
            Some(address_book_repo),
            provider,
        );

        tracing::info!("Admin routes enabled at /admin/*");
        create_router_with_admin(twilio, command_processor, voucher_repo, admin_token, pool.clone())
    } else {
        let command_processor = CommandProcessor::new(
            None, 
            provider,
        );
        create_router(twilio, command_processor)
    };

    // Start server
    let listener = tokio::net::TcpListener::bind(config.bind_addr()).await?;
    
    tracing::info!(
        addr = %config.bind_addr(),
        "Server listening"
    );

    axum::serve(listener, app).await?;

    Ok(())
}


