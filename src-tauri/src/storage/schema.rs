use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum SRSState {
    New,
    Learning,
    Review,
    Relearning,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SRSData {
    pub interval_days: f64,
    pub ease_factor: f64,
    pub due_date: DateTime<Utc>,
    pub review_count: u32,
    pub lapse_count: u32,
    pub state: SRSState,
}

impl SRSData {
    pub fn new() -> Self {
        Self {
            interval_days: 0.0,
            ease_factor: 2.5,
            due_date: Utc::now(),
            review_count: 0,
            lapse_count: 0,
            state: SRSState::New,
        }
    }
}

impl Default for SRSData {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Word {
    pub id: String,
    pub word: String,
    pub meaning: String,
    pub example: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub srs: SRSData,
}

impl Word {
    pub fn new(word: String, meaning: String, example: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            word,
            meaning,
            example,
            created_at: now,
            updated_at: now,
            srs: SRSData::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "system".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppData {
    pub version: u32,
    pub words: Vec<Word>,
    pub settings: Settings,
}

impl Default for AppData {
    fn default() -> Self {
        Self {
            version: 1,
            words: Vec::new(),
            settings: Settings::default(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateWordRequest {
    pub word: String,
    pub meaning: String,
    pub example: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateWordRequest {
    pub id: String,
    pub word: String,
    pub meaning: String,
    pub example: String,
}
