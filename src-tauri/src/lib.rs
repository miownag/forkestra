mod commands;
mod db;
mod error;
mod managers;
mod models;
mod providers;

use std::sync::Arc;

use managers::{SessionManager, SettingsManager, TerminalManager};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            // Build the application menu with Preferences
            let preferences = MenuItemBuilder::with_id("preferences", "Settings...")
                .accelerator("CmdOrCtrl+,")
                .build(app)?;

            let app_submenu = SubmenuBuilder::new(app, "Forkestra")
                .about(None)
                .separator()
                .item(&preferences)
                .separator()
                .services()
                .separator()
                .hide()
                .hide_others()
                .show_all()
                .separator()
                .quit()
                .build()?;

            let edit_submenu = SubmenuBuilder::new(app, "Edit")
                .undo()
                .redo()
                .separator()
                .cut()
                .copy()
                .paste()
                .select_all()
                .build()?;

            let view_submenu = SubmenuBuilder::new(app, "View")
                .fullscreen()
                .build()?;

            let window_submenu = SubmenuBuilder::new(app, "Window")
                .minimize()
                .close_window()
                .build()?;

            let menu = MenuBuilder::new(app)
                .item(&app_submenu)
                .item(&edit_submenu)
                .item(&view_submenu)
                .item(&window_submenu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(|app, event| {
                if event.id().as_ref() == "preferences" {
                    // Emit event to frontend to navigate to settings
                    let _ = app.emit("menu:preferences", ());
                }
            });

            // Initialize settings manager first
            let settings_manager = Arc::new(
                SettingsManager::new(app.handle())
                    .expect("Failed to initialize settings manager"),
            );
            app.manage(settings_manager.clone());

            // Initialize database
            let database = Arc::new(
                db::Database::new(app.handle())
                    .expect("Failed to initialize database"),
            );

            // Initialize session manager with settings and database
            let session_manager =
                SessionManager::new(app.handle().clone(), settings_manager, database);
            app.manage(session_manager);

            // Initialize terminal manager
            let terminal_manager = TerminalManager::new(app.handle().clone());
            app.manage(terminal_manager);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::detect_providers,
            commands::create_session,
            commands::list_sessions,
            commands::get_session,
            commands::send_message,
            commands::terminate_session,
            commands::resume_session,
            commands::send_interaction_response,
            commands::merge_session,
            commands::list_branches,
            commands::rename_session,
            commands::get_session_messages,
            commands::save_message,
            commands::set_session_model,
            commands::get_settings,
            commands::update_settings,
            commands::update_provider_settings,
            commands::create_terminal,
            commands::close_terminal,
            commands::send_terminal_input,
            commands::resize_terminal,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
