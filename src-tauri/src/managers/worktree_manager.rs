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
        fetch_first: bool,
    ) -> AppResult<(PathBuf, String)> {
        let repo = Repository::open(project_path)?;

        // Fetch all remotes if requested (to ensure remote branches are up to date)
        if fetch_first {
            Self::fetch_all(project_path)?;
        }

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

    /// List all branches in a repository
    pub fn list_branches(project_path: &Path, include_remote: bool) -> AppResult<Vec<String>> {
        let repo = Repository::open(project_path)?;
        let mut branches = Vec::new();

        // Get local branches
        for branch in repo.branches(Some(BranchType::Local))? {
            let (branch, _) = branch?;
            if let Some(name) = branch.name()? {
                branches.push(name.to_string());
            }
        }

        // Get remote branches if requested
        if include_remote {
            for branch in repo.branches(Some(BranchType::Remote))? {
                let (branch, _) = branch?;
                if let Some(name) = branch.name()? {
                    // Skip HEAD references like origin/HEAD -> origin/main
                    if !name.ends_with("/HEAD") {
                        branches.push(name.to_string());
                    }
                }
            }
        }

        // Sort branches alphabetically
        branches.sort();

        Ok(branches)
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

    /// Get the current branch name of a repository
    pub fn get_current_branch(project_path: &Path) -> AppResult<String> {
        let repo = Repository::open(project_path)?;
        let head = repo.head()?;

        if let Some(name) = head.shorthand() {
            Ok(name.to_string())
        } else {
            Err(AppError::Git("Could not determine current branch".to_string()))
        }
    }

    /// Fetch all remotes to ensure remote branches are up to date
    pub fn fetch_all(project_path: &Path) -> AppResult<()> {
        let repo = Repository::open(project_path)?;

        // Get all remotes
        let remotes = repo.remotes()?;
        let remote_names: Vec<&str> = remotes
            .iter()
            .flatten()
            .collect();

        if remote_names.is_empty() {
            return Ok(());
        }

        // Fetch each remote
        for remote_name in remote_names {
            let mut remote = repo.find_remote(remote_name)?;
            remote.fetch(&[] as &[&str], None, None)?;
        }

        Ok(())
    }

    /// Sync repository: fetch all remotes and return status message
    pub fn sync_repository(project_path: &Path) -> AppResult<String> {
        let repo = Repository::open(project_path)?;

        // Get all remotes
        let remotes = repo.remotes()?;
        let remote_names: Vec<&str> = remotes
            .iter()
            .flatten()
            .collect();

        if remote_names.is_empty() {
            return Ok("No remotes configured".to_string());
        }

        let mut fetched_remotes = Vec::new();

        // Fetch each remote
        for remote_name in remote_names {
            let mut remote = repo.find_remote(remote_name)?;
            remote.fetch(&[] as &[&str], None, None)?;
            fetched_remotes.push(remote_name);
        }

        Ok(format!("Synced: {}", fetched_remotes.join(", ")))
    }

    /// Get ahead/behind count compared to upstream
    pub fn get_ahead_behind(project_path: &Path) -> AppResult<(usize, usize)> {
        let repo = Repository::open(project_path)?;
        
        // Get current branch name
        let head = repo.head()?;
        let branch_name = match head.shorthand() {
            Some(name) => name.to_string(),
            None => return Ok((0, 0)),
        };
        
        // Get the branch
        let branch = match repo.find_branch(&branch_name, BranchType::Local) {
            Ok(branch) => branch,
            Err(_) => return Ok((0, 0)),
        };
        
        // Get upstream branch
        let upstream = match branch.upstream() {
            Ok(upstream) => upstream,
            Err(_) => return Ok((0, 0)), // No upstream configured
        };
        
        let head_commit = head.peel_to_commit()?;
        let upstream_commit = upstream.get().peel_to_commit()?;
        
        // Get ahead/behind count
        let (ahead, behind) = repo.graph_ahead_behind(head_commit.id(), upstream_commit.id())?;
        
        Ok((ahead, behind))
    }

    /// Pull from upstream (fast-forward only)
    pub fn pull_repository(project_path: &Path) -> AppResult<String> {
        let repo = Repository::open(project_path)?;
        
        // Get current branch
        let head = repo.head()?;
        let branch_name = head.shorthand()
            .ok_or_else(|| AppError::Git("Could not get branch name".to_string()))?;
        
        // Get the branch
        let branch = repo.find_branch(branch_name, BranchType::Local)
            .map_err(|_| AppError::Git("Not on a valid branch".to_string()))?;
        
        // Get upstream
        let upstream = branch.upstream()
            .map_err(|_| AppError::Git("No upstream configured".to_string()))?;
        let upstream_ref = upstream.get();
        let upstream_commit = upstream_ref.peel_to_commit()?;
        
        // Get current commit
        let head_commit = head.peel_to_commit()?;
        
        // Check if fast-forward is possible
        let (ahead, behind) = repo.graph_ahead_behind(head_commit.id(), upstream_commit.id())?;
        
        if ahead > 0 {
            return Err(AppError::Git(
                format!("Cannot fast-forward: {} local commits ahead", ahead)
            ));
        }
        
        if behind == 0 {
            return Ok("Already up to date".to_string());
        }
        
        // Fast-forward merge
        let mut head_ref = head.resolve()?;
        head_ref.set_target(upstream_commit.id(), "Fast-forward pull")?;
        
        // Checkout the new commit
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
        
        Ok(format!("Pulled {} commits", behind))
    }

    /// Push to upstream
    pub fn push_repository(project_path: &Path) -> AppResult<String> {
        let repo = Repository::open(project_path)?;
        
        // Get current branch
        let head = repo.head()?;
        let branch_name = head.shorthand()
            .ok_or_else(|| AppError::Git("Could not get branch name".to_string()))?;
        
        // Get the branch
        let branch = repo.find_branch(branch_name, BranchType::Local)
            .map_err(|_| AppError::Git("Not on a valid branch".to_string()))?;
        
        // Get upstream
        let upstream = branch.upstream()
            .map_err(|_| AppError::Git("No upstream configured".to_string()))?;
        let upstream_name = upstream.get().shorthand()
            .ok_or_else(|| AppError::Git("Could not get upstream name".to_string()))?;
        
        // Parse remote name from upstream (e.g., "origin/main" -> "origin")
        let remote_name = upstream_name.split('/').next()
            .ok_or_else(|| AppError::Git("Invalid upstream name".to_string()))?;
        
        // Get ahead count
        let head_commit = head.peel_to_commit()?;
        let upstream_commit = upstream.get().peel_to_commit()?;
        let (ahead, _) = repo.graph_ahead_behind(head_commit.id(), upstream_commit.id())?;
        
        if ahead == 0 {
            return Ok("Nothing to push".to_string());
        }
        
        // Push using remote callbacks
        let mut remote = repo.find_remote(remote_name)?;
        
        // Create push refspec
        let refspec = format!("refs/heads/{}:refs/heads/{}", branch_name, branch_name);
        
        // Push
        remote.push(&[&refspec], None)?;
        
        Ok(format!("Pushed {} commits", ahead))
    }
}
