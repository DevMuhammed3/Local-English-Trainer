use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use crate::storage::schema::AppData;

pub struct FileStore {
    path: PathBuf,
    data: Mutex<AppData>,
}

impl FileStore {
    pub fn new(path: PathBuf) -> Self {
        let data = Self::read_from_file(&path);
        Self {
            path,
            data: Mutex::new(data),
        }
    }

    fn read_from_file(path: &PathBuf) -> AppData {
        match fs::read_to_string(path) {
            Ok(content) => match serde_json::from_str::<AppData>(&content) {
                Ok(data) => {
                    log::info!("Loaded app data from {:?}", path);
                    data
                }
                Err(e) => {
                    log::warn!("Invalid JSON in {:?}: {}. Using default data.", path, e);
                    AppData::default()
                }
            },
            Err(e) => {
                log::info!("No existing data file at {:?}: {}. Creating new.", path, e);
                AppData::default()
            }
        }
    }

    pub fn get_data(&self) -> AppData {
        self.data.lock().unwrap().clone()
    }

    pub fn save_data(&self, data: &AppData) -> Result<(), String> {
        let json = serde_json::to_string_pretty(data)
            .map_err(|e| format!("Failed to serialize data: {}", e))?;

        let temp_path = self.path.with_extension("json.tmp");
        fs::write(&temp_path, json)
            .map_err(|e| format!("Failed to write temp file: {}", e))?;

        fs::rename(&temp_path, &self.path)
            .map_err(|e| format!("Failed to rename temp file: {}", e))?;

        let mut current = self.data.lock().unwrap();
        *current = data.clone();
        Ok(())
    }

    #[cfg(test)]
    pub fn get_path(&self) -> &PathBuf {
        &self.path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    fn create_test_store() -> (tempfile::TempDir, FileStore) {
        let dir = tempdir().unwrap();
        let path = dir.path().join("test_data.json");
        let store = FileStore::new(path);
        (dir, store)
    }

    #[test]
    fn test_new_store_creates_default_data() {
        let (_dir, store) = create_test_store();
        let data = store.get_data();
        assert_eq!(data.version, 1);
        assert!(data.words.is_empty());
    }

    #[test]
    fn test_save_and_load_data() {
        let (_dir, store) = create_test_store();
        let mut data = store.get_data();
        data.settings.theme = "dark".to_string();
        store.save_data(&data).unwrap();

        let loaded = store.get_data();
        assert_eq!(loaded.settings.theme, "dark");
    }

    #[test]
    fn test_invalid_json_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("bad_data.json");
        fs::write(&path, "not valid json {").unwrap();

        let store = FileStore::new(path);
        let data = store.get_data();
        assert_eq!(data.version, 1);
        assert!(data.words.is_empty());
    }

    #[test]
    fn test_missing_file_returns_default() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("nonexistent.json");

        let store = FileStore::new(path);
        let data = store.get_data();
        assert_eq!(data.version, 1);
    }

    #[test]
    fn test_atomic_write() {
        let (_dir, store) = create_test_store();
        let mut data = store.get_data();
        data.settings.theme = "light".to_string();
        store.save_data(&data).unwrap();

        let temp_path = store.get_path().with_extension("json.tmp");
        assert!(!temp_path.exists());
    }
}
