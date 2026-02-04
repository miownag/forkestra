use std::path::{Path, PathBuf};

use git2::{BranchType, Repository};

use crate::error::{AppError, AppResult};

pub struct WorktreeManager;

impl WorktreeManager {
    /// Create a new worktree for a session
    pub fn create_worktree(
        project_path: &Path,
        session_id: &str,
        base_branch: Option<&str>,
    ) -> AppResult<(PathBuf, String)> {
        let repo = Repository::open(project_path)?;

        // Determine base branch
        let base = base_branch.unwrap_or("main");

        // Create branch name for the session
        let branch_name = format!("forkestra/session-{}", session_id);

        // Get the base commit
        let base_commit = {
            let base_ref = repo
                .find_branch(base, BranchType::Local)
                .or_else(|_| repo.find_branch(base, BranchType::Remote))
                .map_err(|_| AppError::Git(format!("Base branch '{}' not found", base)))?;

            base_ref.get().peel_to_commit()?
        };

        // Create the new branch
        let branch = repo.branch(&branch_name, &base_commit, false)?;

        // Determine worktree path
        let worktree_base = Self::get_worktree_base_path(project_path)?;
        let worktree_path = worktree_base.join(session_id);

        // Create the worktree with the branch reference
        let branch_ref = branch.into_reference();
        repo.worktree(
            session_id,
            &worktree_path,
            Some(git2::WorktreeAddOptions::new().reference(Some(&branch_ref))),
        )?;

        Ok((worktree_path, branch_name))
    }

    /// List all worktrees for a project
    pub fn list_worktrees(project_path: &Path) -> AppResult<Vec<String>> {
        let repo = Repository::open(project_path)?;
        let worktrees = repo.worktrees()?;

        Ok(worktrees
            .iter()
            .flatten()
            .map(|s| s.to_string())
            .collect())
    }

    /// Remove a worktree
    pub fn remove_worktree(project_path: &Path, session_id: &str) -> AppResult<()> {
        let repo = Repository::open(project_path)?;

        // Find and prune the worktree
        if let Ok(worktree) = repo.find_worktree(session_id) {
            // Check if worktree is valid and prune if needed
            if worktree.validate().is_err() {
                worktree.prune(Some(
                    git2::WorktreePruneOptions::new()
                        .valid(true)
                        .working_tree(true),
                ))?;
            } else {
                // Remove the worktree directory first
                let worktree_base = Self::get_worktree_base_path(project_path)?;
                let worktree_path = worktree_base.join(session_id);
                if worktree_path.exists() {
                    std::fs::remove_dir_all(&worktree_path)?;
                }

                // Then prune
                worktree.prune(Some(
                    git2::WorktreePruneOptions::new()
                        .valid(true)
                        .working_tree(true),
                ))?;
            }
        }

        // Also delete the branch
        let branch_name = format!("forkestra/session-{}", session_id);
        if let Ok(mut branch) = repo.find_branch(&branch_name, BranchType::Local) {
            branch.delete()?;
        }

        Ok(())
    }

    /// Merge worktree changes to a target branch
    pub fn merge_to_branch(
        project_path: &Path,
        session_id: &str,
        target_branch: &str,
    ) -> AppResult<()> {
        let repo = Repository::open(project_path)?;
        let branch_name = format!("forkestra/session-{}", session_id);

        // Get the session branch
        let session_branch = repo.find_branch(&branch_name, BranchType::Local)?;
        let session_commit = session_branch.get().peel_to_commit()?;

        // Checkout target branch
        let target = repo.find_branch(target_branch, BranchType::Local)?;
        let target_ref = target.get().name().ok_or_else(|| {
            AppError::Git("Failed to get target branch reference".to_string())
        })?;

        repo.set_head(target_ref)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;

        // Get annotated commit for merge
        let annotated_commit = repo.find_annotated_commit(session_commit.id())?;

        // Perform merge
        let (merge_analysis, _) = repo.merge_analysis(&[&annotated_commit])?;

        if merge_analysis.is_fast_forward() {
            // Fast-forward merge
            let mut target_ref = repo.find_reference(target_ref)?;
            target_ref.set_target(session_commit.id(), "Fast-forward merge")?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
        } else if merge_analysis.is_normal() {
            // Normal merge
            repo.merge(&[&annotated_commit], None, None)?;

            // Create merge commit
            let signature = repo.signature()?;
            let tree_id = repo.index()?.write_tree()?;
            let tree = repo.find_tree(tree_id)?;
            let parent_commit = repo
                .find_branch(target_branch, BranchType::Local)?
                .get()
                .peel_to_commit()?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}' into {}", branch_name, target_branch),
                &tree,
                &[&parent_commit, &session_commit],
            )?;

            repo.cleanup_state()?;
        }

        Ok(())
    }

    /// Get the base path for worktrees
    fn get_worktree_base_path(project_path: &Path) -> AppResult<PathBuf> {
        // Store worktrees in .forkestra directory within the project
        let worktree_base = project_path.join(".forkestra").join("worktrees");
        if !worktree_base.exists() {
            std::fs::create_dir_all(&worktree_base)?;
        }
        Ok(worktree_base)
    }

    /// Check if a path is a git repository
    pub fn is_git_repo(path: &Path) -> bool {
        Repository::open(path).is_ok()
    }

    /// Get the default branch name of a repository
    pub fn get_default_branch(project_path: &Path) -> AppResult<String> {
        let repo = Repository::open(project_path)?;

        // Try common default branch names
        for name in &["main", "master"] {
            if repo.find_branch(name, BranchType::Local).is_ok() {
                return Ok(name.to_string());
            }
        }

        // Fall back to HEAD
        let head = repo.head()?;
        if let Some(name) = head.shorthand() {
            return Ok(name.to_string());
        }

        Err(AppError::Git("Could not determine default branch".to_string()))
    }
}
