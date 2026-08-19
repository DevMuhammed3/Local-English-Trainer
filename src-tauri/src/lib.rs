mod commands;
mod srs;
mod storage;

use commands::AppState;
use storage::FileStore;
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let app_dir = app
                .handle()
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");

            std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");

            let data_path = app_dir.join("data.json");
            log::info!("Data path: {:?}", data_path);

            let store = FileStore::new(data_path);
            let state = AppState::new(store);

            app.manage(state);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_data,
            commands::add_word,
            commands::update_word,
            commands::delete_word,
            commands::search_words,
            commands::get_due_words,
            commands::review_word,
            commands::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
