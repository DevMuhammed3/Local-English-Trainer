use std::sync::Mutex;

use tauri::State as TauriState;

use crate::srs::Scheduler;
use crate::storage::{AppData, CreateWordRequest, FileStore, UpdateWordRequest, Word};

pub struct AppState {
    pub store: Mutex<FileStore>,
    pub scheduler: Scheduler,
}

impl AppState {
    pub fn new(store: FileStore) -> Self {
        Self {
            store: Mutex::new(store),
            scheduler: Scheduler::new(),
        }
    }
}

#[tauri::command]
pub fn get_data(state: TauriState<'_, AppState>) -> Result<AppData, String> {
    let store = state.store.lock().unwrap();
    Ok(store.get_data())
}

#[tauri::command]
pub fn add_word(state: TauriState<'_, AppState>, request: CreateWordRequest) -> Result<Word, String> {
    if request.word.trim().is_empty() {
        return Err("Word cannot be empty".to_string());
    }
    if request.meaning.trim().is_empty() {
        return Err("Meaning cannot be empty".to_string());
    }

    let word = Word::new(
        request.word.trim().to_string(),
        request.meaning.trim().to_string(),
        request.example.trim().to_string(),
    );

    let store = state.store.lock().unwrap();
    let mut data = store.get_data();
    data.words.push(word.clone());
    store.save_data(&data)?;

    Ok(word)
}

#[tauri::command]
pub fn update_word(state: TauriState<'_, AppState>, request: UpdateWordRequest) -> Result<Word, String> {
    if request.word.trim().is_empty() {
        return Err("Word cannot be empty".to_string());
    }
    if request.meaning.trim().is_empty() {
        return Err("Meaning cannot be empty".to_string());
    }

    let store = state.store.lock().unwrap();
    let mut data = store.get_data();

    if let Some(word) = data.words.iter_mut().find(|w| w.id == request.id) {
        word.word = request.word.trim().to_string();
        word.meaning = request.meaning.trim().to_string();
        word.example = request.example.trim().to_string();
        word.updated_at = chrono::Utc::now();

        let updated = word.clone();
        store.save_data(&data)?;
        Ok(updated)
    } else {
        Err(format!("Word with id '{}' not found", request.id))
    }
}

#[tauri::command]
pub fn delete_word(state: TauriState<'_, AppState>, id: String) -> Result<bool, String> {
    let store = state.store.lock().unwrap();
    let mut data = store.get_data();
    let initial_len = data.words.len();
    data.words.retain(|w| w.id != id);

    if data.words.len() == initial_len {
        return Err(format!("Word with id '{}' not found", id));
    }

    store.save_data(&data)?;
    Ok(true)
}

#[tauri::command]
pub fn search_words(state: TauriState<'_, AppState>, query: String) -> Vec<Word> {
    let store = state.store.lock().unwrap();
    let data = store.get_data();
    let query_lower = query.to_lowercase();

    if query_lower.is_empty() {
        return data.words;
    }

    data.words
        .into_iter()
        .filter(|w| {
            w.word.to_lowercase().contains(&query_lower)
                || w.meaning.to_lowercase().contains(&query_lower)
        })
        .collect()
}

#[tauri::command]
pub fn get_due_words(state: TauriState<'_, AppState>) -> Vec<Word> {
    let store = state.store.lock().unwrap();
    let data = store.get_data();

    data.words
        .into_iter()
        .filter(|w| state.scheduler.is_due(&w.srs))
        .collect()
}

#[tauri::command]
pub fn review_word(state: TauriState<'_, AppState>, word_id: String, remembered: bool) -> Result<Word, String> {
    let store = state.store.lock().unwrap();
    let mut data = store.get_data();

    if let Some(word) = data.words.iter_mut().find(|w| w.id == word_id) {
        if remembered {
            state.scheduler.schedule_remembered(&mut word.srs);
        } else {
            state.scheduler.schedule_forgotten(&mut word.srs);
        }

        word.updated_at = chrono::Utc::now();
        let updated = word.clone();
        store.save_data(&data)?;
        Ok(updated)
    } else {
        Err(format!("Word with id '{}' not found", word_id))
    }
}

#[tauri::command]
pub fn save_settings(state: TauriState<'_, AppState>, theme: String) -> Result<AppData, String> {
    let store = state.store.lock().unwrap();
    let mut data = store.get_data();
    data.settings.theme = theme;
    store.save_data(&data)?;
    Ok(data)
}
