mod commands;
mod db;
mod error;
mod managers;
mod models;
mod providers;

use std::sync::Arc;

use managers::{McpManager, SessionManager, SettingsManager, SkillsManager, TerminalManager};
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

            // Session menu items
            let create_session = MenuItemBuilder::with_id("create_session", "Create Session")
                .accelerator("CmdOrCtrl+N")
                .build(app)?;
            let quick_create = MenuItemBuilder::with_id("quick_create", "Quick Create from This Session")
                .accelerator("CmdOrCtrl+Alt+N")
                .build(app)?;
            let rename_session = MenuItemBuilder::with_id("rename_session", "Rename This Session")
                .accelerator("CmdOrCtrl+Alt+R")
                .build(app)?;
            let delete_session = MenuItemBuilder::with_id("delete_session", "Delete This Session")
                .accelerator("CmdOrCtrl+Alt+Backspace")
                .build(app)?;

            // Tools menu items
            let mcps = MenuItemBuilder::with_id("mcps", "MCPs").build(app)?;
            let skills = MenuItemBuilder::with_id("skills", "Skills").build(app)?;

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

            let session_submenu = SubmenuBuilder::new(app, "Session")
                .item(&create_session)
                .item(&quick_create)
                .separator()
                .item(&rename_session)
                .item(&delete_session)
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

            let tools_submenu = SubmenuBuilder::new(app, "Tools")
                .item(&mcps)
                .item(&skills)
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
                .item(&session_submenu)
                .item(&edit_submenu)
                .item(&tools_submenu)
                .item(&view_submenu)
                .item(&window_submenu)
                .build()?;

            app.set_menu(menu)?;

            // Handle menu events
            app.on_menu_event(|app, event| {
                match event.id().as_ref() {
                    "preferences" => {
                        let _ = app.emit("menu:preferences", ());
                    }
                    "create_session" => {
                        let _ = app.emit("menu:create_session", ());
                    }
                    "quick_create" => {
                        let _ = app.emit("menu:quick_create", ());
                    }
                    "rename_session" => {
                        let _ = app.emit("menu:rename_session", ());
                    }
                    "delete_session" => {
                        let _ = app.emit("menu:delete_session", ());
                    }
                    "mcps" => {
                        let _ = app.emit("menu:mcps", ());
                    }
                    "skills" => {
                        let _ = app.emit("menu:skills", ());
                    }
                    _ => {}
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

            // Initialize MCP manager
            let mcp_manager = Arc::new(McpManager::new(settings_manager.clone()));
            let _ = mcp_manager.scan_all();
            app.manage(mcp_manager.clone());

            // Initialize Skills manager
            let skills_manager = Arc::new(SkillsManager::new(settings_manager.clone()));
            let _ = skills_manager.scan_all();
            app.manage(skills_manager.clone());

            // Initialize session manager with settings, database, MCP manager, and skills manager
            let session_manager =
                SessionManager::new(app.handle().clone(), settings_manager, database, mcp_manager, skills_manager);
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
            commands::set_session_mode,
            commands::set_session_config_option,
            commands::cancel_generation,
            commands::git_sync,
            commands::git_pull,
            commands::git_push,
            commands::git_status,
            commands::get_settings,
            commands::get_settings_json,
            commands::get_settings_path,
            commands::update_settings_json,
            commands::update_settings,
            commands::update_provider_settings,
            commands::get_ui_settings,
            commands::update_ui_settings,
            commands::create_terminal,
            commands::close_terminal,
            commands::send_terminal_input,
            commands::resize_terminal,
            commands::list_directory,
            commands::read_file,
            commands::create_file,
            commands::create_directory,
            commands::delete_item,
            commands::rename_item,
            commands::move_item,
            commands::write_file,
            commands::list_mcp_servers,
            commands::scan_mcp_servers,
            commands::add_mcp_server,
            commands::update_mcp_server,
            commands::delete_mcp_server,
            commands::toggle_mcp_server,
            commands::list_skills,
            commands::scan_skills,
            commands::toggle_skill,
            commands::install_skill,
            commands::remove_skill,
            commands::update_skills,
            commands::create_skill,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
