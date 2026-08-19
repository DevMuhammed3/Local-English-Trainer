use chrono::{Duration, Utc};

use crate::storage::schema::{SRSData, SRSState};

pub struct Scheduler;

impl Scheduler {
    pub fn new() -> Self {
        Self
    }

    pub fn schedule_remembered(&self, srs: &mut SRSData) {
        match srs.state {
            SRSState::New => {
                srs.interval_days = 1.0;
                srs.state = SRSState::Learning;
            }
            SRSState::Learning => {
                srs.interval_days = 3.0;
                srs.state = SRSState::Review;
            }
            SRSState::Review => {
                srs.interval_days = (srs.interval_days * srs.ease_factor).max(1.0);
                srs.ease_factor = (srs.ease_factor + 0.1).min(3.0);
                srs.state = SRSState::Review;
            }
            SRSState::Relearning => {
                srs.interval_days = 1.0;
                srs.state = SRSState::Learning;
            }
        }

        srs.review_count += 1;
        srs.due_date = Utc::now() + Duration::days(srs.interval_days as i64);
    }

    pub fn schedule_forgotten(&self, srs: &mut SRSData) {
        srs.lapse_count += 1;
        srs.ease_factor = (srs.ease_factor - 0.2).max(1.3);
        srs.interval_days = 1.0;
        srs.due_date = Utc::now() + Duration::days(1);
        srs.review_count += 1;

        match srs.state {
            SRSState::New | SRSState::Learning | SRSState::Relearning => {
                srs.state = SRSState::Relearning;
            }
            SRSState::Review => {
                srs.state = SRSState::Relearning;
            }
        }
    }

    pub fn is_due(&self, srs: &SRSData) -> bool {
        Utc::now() >= srs.due_date
    }
}

impl Default for Scheduler {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn create_test_srs(state: SRSState, interval: f64) -> SRSData {
        SRSData {
            interval_days: interval,
            ease_factor: 2.5,
            due_date: Utc::now() - Duration::hours(1),
            review_count: 0,
            lapse_count: 0,
            state,
        }
    }

    #[test]
    fn test_new_word_scheduling() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::New, 0.0);

        scheduler.schedule_remembered(&mut srs);

        assert_eq!(srs.interval_days, 1.0);
        assert_eq!(srs.state, SRSState::Learning);
        assert_eq!(srs.review_count, 1);
        assert!(srs.due_date > Utc::now());
    }

    #[test]
    fn test_learning_to_review() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Learning, 1.0);

        scheduler.schedule_remembered(&mut srs);

        assert_eq!(srs.interval_days, 3.0);
        assert_eq!(srs.state, SRSState::Review);
    }

    #[test]
    fn test_review_interval_increases() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Review, 10.0);

        scheduler.schedule_remembered(&mut srs);

        assert_eq!(srs.interval_days, 25.0);
        assert_eq!(srs.ease_factor, 2.6);
    }

    #[test]
    fn test_forgotten_word_resets() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Review, 10.0);

        scheduler.schedule_forgotten(&mut srs);

        assert_eq!(srs.interval_days, 1.0);
        assert_eq!(srs.state, SRSState::Relearning);
        assert_eq!(srs.lapse_count, 1);
        assert_eq!(srs.ease_factor, 2.3);
    }

    #[test]
    fn test_ease_factor_minimum() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Review, 1.0);
        srs.ease_factor = 1.3;

        scheduler.schedule_forgotten(&mut srs);

        assert_eq!(srs.ease_factor, 1.3);
    }

    #[test]
    fn test_ease_factor_maximum() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Review, 1.0);
        srs.ease_factor = 3.0;

        scheduler.schedule_remembered(&mut srs);

        assert_eq!(srs.ease_factor, 3.0);
    }

    #[test]
    fn test_is_due() {
        let scheduler = Scheduler::new();
        let past_srs = create_test_srs(SRSState::New, 0.0);
        assert!(scheduler.is_due(&past_srs));

        let future_srs = SRSData {
            due_date: Utc::now() + Duration::days(1),
            ..past_srs
        };
        assert!(!scheduler.is_due(&future_srs));
    }

    #[test]
    fn test_relearning_to_learning() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Relearning, 1.0);

        scheduler.schedule_remembered(&mut srs);

        assert_eq!(srs.interval_days, 1.0);
        assert_eq!(srs.state, SRSState::Learning);
    }

    #[test]
    fn test_interval_minimum_one_day() {
        let scheduler = Scheduler::new();
        let mut srs = create_test_srs(SRSState::Review, 0.1);
        srs.ease_factor = 1.0;

        scheduler.schedule_remembered(&mut srs);

        assert!(srs.interval_days >= 1.0);
    }
}
