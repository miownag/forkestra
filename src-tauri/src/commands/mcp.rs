use std::sync::Arc;
use tauri::State;

use crate::managers::McpManager;
use crate::models::mcp::McpServerConfig;

#[tauri::command]
pub async fn list_mcp_servers(
    manager: State<'_, Arc<McpManager>>,
) -> Result<Vec<McpServerConfig>, String> {
    Ok(manager.list_all_servers())
}

#[tauri::command]
pub async fn scan_mcp_servers(
    manager: State<'_, Arc<McpManager>>,
) -> Result<Vec<McpServerConfig>, String> {
    manager.scan_all().map_err(|e| e.to_string())?;
    Ok(manager.list_all_servers())
}

#[tauri::command]
pub async fn add_mcp_server(
    manager: State<'_, Arc<McpManager>>,
    config: McpServerConfig,
) -> Result<McpServerConfig, String> {
    manager.add_server(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_mcp_server(
    manager: State<'_, Arc<McpManager>>,
    config: McpServerConfig,
) -> Result<McpServerConfig, String> {
    manager.update_server(config).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_mcp_server(
    manager: State<'_, Arc<McpManager>>,
    server_id: String,
) -> Result<(), String> {
    manager.delete_server(&server_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn toggle_mcp_server(
    manager: State<'_, Arc<McpManager>>,
    server_id: String,
    enabled: bool,
) -> Result<(), String> {
    manager
        .toggle_server(&server_id, enabled)
        .map_err(|e| e.to_string())
}
