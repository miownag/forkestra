mod commands;
mod error;
mod managers;
mod models;
mod providers;

use managers::SessionManager;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let session_manager = SessionManager::new(app.handle().clone());
            app.manage(session_manager);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_providers,
            commands::create_session,
            commands::list_sessions,
            commands::get_session,
            commands::send_message,
            commands::terminate_session,
            commands::merge_session,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
