use serde::{Deserialize, Serialize};
use reqwest::Client;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenChannelResponse {
    pub success: bool,
    pub channelId: Option<String>,
    pub txHash: Option<String>,
    pub status: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SendResponse {
    pub success: bool,
    pub message: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloseResponse {
    pub success: bool,
    pub txHash: Option<String>,
    pub status: Option<String>,
    pub error: Option<String>,
}


#[derive(Clone)]
pub struct YellowClient {
    client: Client,
    base_url: String,
}

impl YellowClient {
    pub fn new(base_url: String) -> Self {
        Self {
            client: Client::new(),
            base_url,
        }
    }

    /// Open a new state channel
    pub async fn open_channel(&self, amount: String) -> Result<String, String> {
        let url = format!("{}/channel/open", self.base_url);
        let payload = serde_json::json!({
            "amount": amount
        });

        let res = self.client.post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let body: OpenChannelResponse = res.json().await.map_err(|e| e.to_string())?;
        
        if body.success {
            Ok(body.channelId.unwrap_or_default())
        } else {
            Err(body.error.unwrap_or("Unknown error".to_string()))
        }
    }

    /// Send update within channel
    pub async fn send_update(&self, channel_id: String, amount: String) -> Result<String, String> {
        let url = format!("{}/channel/send", self.base_url);
        let payload = serde_json::json!({
            "channelId": channel_id,
            "amount": amount
        });

        let res = self.client.post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        
        let body: SendResponse = res.json().await.map_err(|e| e.to_string())?;

        if body.success {
            Ok(body.message.unwrap_or("Sent".to_string()))
        } else {
            Err(body.error.unwrap_or("Failed to send".to_string()))
        }
    }

    /// Close the channel
    pub async fn close_channel(&self, channel_id: Option<String>) -> Result<String, String> {
        let url = format!("{}/channel/close", self.base_url);
        let payload = serde_json::json!({
            "channelId": channel_id
        });

        let res = self.client.post(&url)
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;
            
        let body: CloseResponse = res.json().await.map_err(|e| e.to_string())?;

        if body.success {
            Ok(format!("Channel Closed. Tx: {}", body.txHash.unwrap_or_default()))
        } else {
            Err(body.error.unwrap_or("Failed to close".to_string()))
        }
    }
}
