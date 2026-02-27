use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::models::SessionError;

#[derive(Error, Debug, Serialize, Deserialize)]
pub enum AppError {
    #[error("Git error: {0}")]
    Git(String),

    #[error("Session error: {0}")]
    Session(String),

    #[error("Provider error: {0}")]
    Provider(String),

    #[error("IO error: {0}")]
    Io(String),

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Invalid operation: {0}")]
    InvalidOperation(String),

    #[error("Internal error: {0}")]
    Internal(String),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Skill error: {0}")]
    Skill(String),
}

impl AppError {
    /// Convert to a structured SessionError with code and message.
    /// Parses nested error strings like "Provider error: session/new failed: Error { code: -32000, message: \"...\", data: None }"
    pub fn to_session_error(&self) -> SessionError {
        let full = format!("{}", self);
        let code = match self {
            AppError::Git(_) => "git_error",
            AppError::Session(_) => "session_error",
            AppError::Provider(_) => "provider_error",
            AppError::Io(_) => "io_error",
            AppError::NotFound(_) => "not_found",
            AppError::InvalidOperation(_) => "invalid_operation",
            AppError::Internal(_) => "internal_error",
            AppError::Database(_) => "database_error",
            AppError::Skill(_) => "skill_error",
        };

        // Try to extract a nested JSON-RPC style code and message
        // Pattern: "... Error { code: -32000: SomeLabel, message: \"...\", data: ... }"
        if let Some(msg_start) = full.find("message: \"") {
            let after = &full[msg_start + 10..];
            if let Some(msg_end) = after.find('"') {
                let nested_message = &after[..msg_end];
                // Try to extract the numeric/label code
                if let Some(code_start) = full.find("code: ") {
                    let after_code = &full[code_start + 6..];
                    if let Some(code_end) = after_code.find(',') {
                        let nested_code = after_code[..code_end].trim();
                        return SessionError {
                            code: nested_code.to_string(),
                            message: nested_message.to_string(),
                        };
                    }
                }
                return SessionError {
                    code: code.to_string(),
                    message: nested_message.to_string(),
                };
            }
        }

        // Fallback: use the variant name as code and inner string as message
        let message = match self {
            AppError::Git(m)
            | AppError::Session(m)
            | AppError::Provider(m)
            | AppError::Io(m)
            | AppError::NotFound(m)
            | AppError::InvalidOperation(m)
            | AppError::Internal(m)
            | AppError::Database(m)
            | AppError::Skill(m) => m.clone(),
        };

        SessionError {
            code: code.to_string(),
            message,
        }
    }
}

impl From<git2::Error> for AppError {
    fn from(err: git2::Error) -> Self {
        AppError::Git(err.message().to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(err: std::io::Error) -> Self {
        AppError::Io(err.to_string())
    }
}

impl From<rusqlite::Error> for AppError {
    fn from(err: rusqlite::Error) -> Self {
        AppError::Database(err.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
