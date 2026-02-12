pub mod acp_client_sdk;
pub mod adapter;
pub mod claude;
pub mod detector;
pub mod kimi;

pub use adapter::ProviderAdapter;
pub use claude::ClaudeAdapter;
pub use detector::ProviderDetector;
pub use kimi::KimiAdapter;
