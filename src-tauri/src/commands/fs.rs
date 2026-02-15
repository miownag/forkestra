use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String, // relative path from project root
    pub is_dir: bool,
    pub is_file: bool,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileOperation {
    pub project_path: String,
    pub relative_path: String,
    pub content: Option<String>, // for create_file
}

#[derive(Debug, Serialize, Deserialize)]
pub struct RenameOperation {
    pub project_path: String,
    pub old_path: String,
    pub new_name: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct MoveOperation {
    pub project_path: String,
    pub source_path: String,
    pub destination_path: String, // folder path
}

#[tauri::command]
pub async fn list_directory(
    project_path: String,
    relative_path: Option<String>,
) -> Result<Vec<FileEntry>, String> {
    let project = PathBuf::from(&project_path);
    let target_dir = match &relative_path {
        Some(rel) => project.join(rel),
        None => project.clone(),
    };

    if !target_dir.is_dir() {
        return Err(format!("Not a directory: {}", target_dir.display()));
    }

    // Try to open git repo for .gitignore filtering
    let repo = git2::Repository::open(&project).ok();

    let read_dir = tokio::task::spawn_blocking(move || -> Result<Vec<FileEntry>, String> {
        let mut result = Vec::new();

        let dir_entries = std::fs::read_dir(&target_dir)
            .map_err(|e| format!("Failed to read directory: {}", e))?;

        for entry in dir_entries {
            let entry = match entry {
                Ok(e) => e,
                Err(_) => continue,
            };

            let file_name = entry.file_name().to_string_lossy().to_string();

            // Skip hidden files/directories (starting with ".")
            if file_name.starts_with('.') {
                continue;
            }

            let full_path = entry.path();
            let rel_path = full_path
                .strip_prefix(&project)
                .unwrap_or(&full_path)
                .to_string_lossy()
                .to_string();

            // Check if git should ignore this path
            if let Some(ref repo) = repo {
                if repo.status_should_ignore(std::path::Path::new(&rel_path)).unwrap_or(false) {
                    continue;
                }
            }

            let metadata = match entry.metadata() {
                Ok(m) => m,
                Err(_) => continue,
            };

            result.push(FileEntry {
                name: file_name,
                path: rel_path,
                is_dir: metadata.is_dir(),
                is_file: metadata.is_file(),
            });
        }

        // Sort: directories first, then files, alphabetically within each group
        result.sort_by(|a, b| {
            match (a.is_dir, b.is_dir) {
                (true, false) => std::cmp::Ordering::Less,
                (false, true) => std::cmp::Ordering::Greater,
                _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
            }
        });

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task join error: {}", e))?;

    let entries = read_dir?;
    Ok(entries)
}

#[tauri::command]
pub async fn read_file(
    project_path: String,
    relative_path: String,
) -> Result<String, String> {
    let project = PathBuf::from(&project_path);
    let full_path = project.join(&relative_path);

    // Security: ensure path is within project directory
    if !full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if file exists and is actually a file
    if !full_path.exists() {
        return Err(format!("File not found: {}", relative_path));
    }

    if !full_path.is_file() {
        return Err(format!("Not a file: {}", relative_path));
    }

    match tokio::fs::read_to_string(&full_path).await {
        Ok(content) => Ok(content),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[tauri::command]
pub async fn write_file(
    project_path: String,
    relative_path: String,
    content: String,
) -> Result<(), String> {
    let project = PathBuf::from(&project_path);
    let full_path = project.join(&relative_path);

    // Security: ensure path is within project directory
    if !full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if file exists and is actually a file
    if !full_path.exists() {
        return Err(format!("File not found: {}", relative_path));
    }

    if !full_path.is_file() {
        return Err(format!("Not a file: {}", relative_path));
    }

    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

// Helper function to validate file names
fn validate_file_name(name: &str) -> Result<(), String> {
    if name.is_empty() {
        return Err("File name cannot be empty".to_string());
    }

    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    for ch in invalid_chars.iter() {
        if name.contains(*ch) {
            return Err(format!("File name contains invalid character: {}", ch));
        }
    }

    // Check for Windows reserved names
    let reserved = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4",
                    "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2",
                    "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];

    let name_upper = name.to_uppercase();
    for reserved_name in reserved.iter() {
        if name_upper == *reserved_name || name_upper.starts_with(&format!("{}.", reserved_name)) {
            return Err(format!("File name is reserved: {}", reserved_name));
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn create_file(operation: FileOperation) -> Result<String, String> {
    let project = PathBuf::from(&operation.project_path);
    let full_path = project.join(&operation.relative_path);

    // Security: ensure path is within project directory
    if !full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Validate file name
    if let Some(file_name) = full_path.file_name() {
        validate_file_name(&file_name.to_string_lossy())?;
    }

    // Check if file already exists
    if full_path.exists() {
        return Err(format!("File already exists: {}", operation.relative_path));
    }

    // Create parent directories if they don't exist
    if let Some(parent) = full_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create parent directories: {}", e))?;
    }

    // Create the file with optional content
    let content = operation.content.unwrap_or_default();
    tokio::fs::write(&full_path, content)
        .await
        .map_err(|e| format!("Failed to create file: {}", e))?;

    Ok(operation.relative_path)
}

#[tauri::command]
pub async fn create_directory(operation: FileOperation) -> Result<String, String> {
    let project = PathBuf::from(&operation.project_path);
    let full_path = project.join(&operation.relative_path);

    // Security: ensure path is within project directory
    if !full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Validate directory name
    if let Some(dir_name) = full_path.file_name() {
        validate_file_name(&dir_name.to_string_lossy())?;
    }

    // Check if directory already exists
    if full_path.exists() {
        return Err(format!("Directory already exists: {}", operation.relative_path));
    }

    // Create the directory
    tokio::fs::create_dir_all(&full_path)
        .await
        .map_err(|e| format!("Failed to create directory: {}", e))?;

    Ok(operation.relative_path)
}

#[tauri::command]
pub async fn delete_item(operation: FileOperation) -> Result<(), String> {
    let project = PathBuf::from(&operation.project_path);
    let full_path = project.join(&operation.relative_path);

    // Security: ensure path is within project directory
    if !full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if item exists
    if !full_path.exists() {
        return Err(format!("Item not found: {}", operation.relative_path));
    }

    // Delete file or directory
    if full_path.is_dir() {
        tokio::fs::remove_dir_all(&full_path)
            .await
            .map_err(|e| format!("Failed to delete directory: {}", e))?;
    } else {
        tokio::fs::remove_file(&full_path)
            .await
            .map_err(|e| format!("Failed to delete file: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn rename_item(operation: RenameOperation) -> Result<String, String> {
    let project = PathBuf::from(&operation.project_path);
    let old_full_path = project.join(&operation.old_path);

    // Security: ensure path is within project directory
    if !old_full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Validate new name
    validate_file_name(&operation.new_name)?;

    // Check if old path exists
    if !old_full_path.exists() {
        return Err(format!("Item not found: {}", operation.old_path));
    }

    // Construct new path (same parent directory, new name)
    let new_full_path = if let Some(parent) = old_full_path.parent() {
        parent.join(&operation.new_name)
    } else {
        project.join(&operation.new_name)
    };

    // Security: ensure new path is within project directory
    if !new_full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if new path already exists
    if new_full_path.exists() {
        return Err(format!("Item already exists: {}", operation.new_name));
    }

    // Rename the item
    tokio::fs::rename(&old_full_path, &new_full_path)
        .await
        .map_err(|e| format!("Failed to rename item: {}", e))?;

    // Return new relative path
    let new_relative_path = new_full_path
        .strip_prefix(&project)
        .unwrap_or(&new_full_path)
        .to_string_lossy()
        .to_string();

    Ok(new_relative_path)
}

#[tauri::command]
pub async fn move_item(operation: MoveOperation) -> Result<String, String> {
    let project = PathBuf::from(&operation.project_path);
    let source_full_path = project.join(&operation.source_path);
    let dest_dir_full_path = project.join(&operation.destination_path);

    // Security: ensure paths are within project directory
    if !source_full_path.starts_with(&project) || !dest_dir_full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if source exists
    if !source_full_path.exists() {
        return Err(format!("Source not found: {}", operation.source_path));
    }

    // Check if destination directory exists
    if !dest_dir_full_path.exists() || !dest_dir_full_path.is_dir() {
        return Err(format!("Destination directory not found: {}", operation.destination_path));
    }

    // Get source file/folder name
    let source_name = source_full_path
        .file_name()
        .ok_or_else(|| "Invalid source path".to_string())?;

    // Construct destination path
    let dest_full_path = dest_dir_full_path.join(source_name);

    // Security: ensure destination path is within project directory
    if !dest_full_path.starts_with(&project) {
        return Err("Invalid path: outside project directory".to_string());
    }

    // Check if source and destination are the same
    if source_full_path == dest_full_path {
        return Err("Source and destination are the same".to_string());
    }

    // Check if trying to move directory into itself
    if source_full_path.is_dir() && dest_full_path.starts_with(&source_full_path) {
        return Err("Cannot move directory into itself".to_string());
    }

    // Check if destination already exists
    if dest_full_path.exists() {
        return Err(format!("Item already exists at destination: {}", source_name.to_string_lossy()));
    }

    // Move the item
    tokio::fs::rename(&source_full_path, &dest_full_path)
        .await
        .map_err(|e| format!("Failed to move item: {}", e))?;

    // Return new relative path
    let new_relative_path = dest_full_path
        .strip_prefix(&project)
        .unwrap_or(&dest_full_path)
        .to_string_lossy()
        .to_string();

    Ok(new_relative_path)
}
