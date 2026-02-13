use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String, // relative path from project root
    pub is_dir: bool,
    pub is_file: bool,
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
