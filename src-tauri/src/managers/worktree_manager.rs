use std::path::{Path, PathBuf};

use git2::{BranchType, Repository, RepositoryState, StatusOptions};

use crate::error::{AppError, AppResult};
use crate::models::session::{
    ConflictContent, GitFileStatus, GitFileStatusKind, GitScmStatus, MergeRebaseResult,
};

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

    // ========== SCM Operations ==========

    /// Get SCM status for a repository path
    pub fn get_scm_status(repo_path: &Path) -> AppResult<GitScmStatus> {
        let repo = Repository::open(repo_path)?;

        let branch_name = match repo.head() {
            Ok(head) => head.shorthand().unwrap_or("HEAD").to_string(),
            Err(_) => "HEAD".to_string(),
        };

        let merge_in_progress = matches!(
            repo.state(),
            RepositoryState::Merge
        );
        let rebase_in_progress = matches!(
            repo.state(),
            RepositoryState::Rebase
                | RepositoryState::RebaseInteractive
                | RepositoryState::RebaseMerge
        );

        let mut opts = StatusOptions::new();
        opts.include_untracked(true);
        opts.recurse_untracked_dirs(true);
        opts.include_ignored(false);
        opts.renames_head_to_index(true);
        opts.renames_index_to_workdir(true);

        let statuses = repo.statuses(Some(&mut opts))?;

        let mut staged = Vec::new();
        let mut unstaged = Vec::new();
        let mut untracked = Vec::new();
        let mut conflicts = Vec::new();

        for entry in statuses.iter() {
            let path = entry.path().unwrap_or("").to_string();
            let status = entry.status();

            // Check for conflicts first
            if status.is_conflicted() {
                conflicts.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Conflicted,
                    old_path: None,
                });
                continue;
            }

            // Staged changes (index)
            if status.is_index_new() {
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Added,
                    old_path: None,
                });
            } else if status.is_index_modified() {
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Modified,
                    old_path: None,
                });
            } else if status.is_index_deleted() {
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Deleted,
                    old_path: None,
                });
            } else if status.is_index_renamed() {
                let old_path = entry
                    .head_to_index()
                    .and_then(|d| d.old_file().path().map(|p| p.to_string_lossy().to_string()));
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Renamed,
                    old_path,
                });
            } else if status.is_index_typechange() {
                staged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Modified,
                    old_path: None,
                });
            }

            // Unstaged changes (workdir)
            if status.is_wt_modified() {
                unstaged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Modified,
                    old_path: None,
                });
            } else if status.is_wt_deleted() {
                unstaged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Deleted,
                    old_path: None,
                });
            } else if status.is_wt_renamed() {
                let old_path = entry
                    .index_to_workdir()
                    .and_then(|d| d.old_file().path().map(|p| p.to_string_lossy().to_string()));
                unstaged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Renamed,
                    old_path,
                });
            } else if status.is_wt_typechange() {
                unstaged.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Modified,
                    old_path: None,
                });
            }

            // Untracked
            if status.is_wt_new() {
                untracked.push(GitFileStatus {
                    path: path.clone(),
                    status: GitFileStatusKind::Untracked,
                    old_path: None,
                });
            }
        }

        Ok(GitScmStatus {
            staged,
            unstaged,
            untracked,
            conflicts,
            merge_in_progress,
            rebase_in_progress,
            branch_name,
        })
    }

    /// Get unified diff for a file
    pub fn get_file_diff(
        repo_path: &Path,
        file_path: &str,
        staged: bool,
    ) -> AppResult<String> {
        let repo = Repository::open(repo_path)?;
        let mut diff_output = String::new();

        if staged {
            // Diff between HEAD and index
            let head_tree = match repo.head() {
                Ok(head) => Some(head.peel_to_tree()?),
                Err(_) => None,
            };
            let diff = repo.diff_tree_to_index(
                head_tree.as_ref(),
                None,
                Some(git2::DiffOptions::new().pathspec(file_path)),
            )?;
            diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
                let origin = line.origin();
                if origin == '+' || origin == '-' || origin == ' ' {
                    diff_output.push(origin);
                }
                diff_output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
                true
            })?;
        } else {
            // Diff between index and workdir
            let diff = repo.diff_index_to_workdir(
                None,
                Some(git2::DiffOptions::new().pathspec(file_path)),
            )?;
            diff.print(git2::DiffFormat::Patch, |_delta, _hunk, line| {
                let origin = line.origin();
                if origin == '+' || origin == '-' || origin == ' ' {
                    diff_output.push(origin);
                }
                diff_output.push_str(std::str::from_utf8(line.content()).unwrap_or(""));
                true
            })?;
        }

        Ok(diff_output)
    }

    /// Stage a single file
    pub fn stage_file(repo_path: &Path, file_path: &str) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;
        let mut index = repo.index()?;

        let path = Path::new(file_path);
        let full_path = repo_path.join(path);

        if full_path.exists() {
            index.add_path(path)?;
        } else {
            // File was deleted
            index.remove_path(path)?;
        }
        index.write()?;
        Ok(())
    }

    /// Unstage a single file
    pub fn unstage_file(repo_path: &Path, file_path: &str) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;

        match repo.head() {
            Ok(head) => {
                let obj = head.peel(git2::ObjectType::Commit)?;
                repo.reset_default(Some(&obj), [file_path])?;
            }
            Err(_) => {
                // No HEAD yet (initial commit), just remove from index
                let mut index = repo.index()?;
                index.remove_path(Path::new(file_path))?;
                index.write()?;
            }
        }
        Ok(())
    }

    /// Stage all files
    pub fn stage_all(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;
        let mut index = repo.index()?;
        index.add_all(["*"], git2::IndexAddOption::DEFAULT, None)?;
        // Also handle deleted files
        index.update_all(["*"], None)?;
        index.write()?;
        Ok(())
    }

    /// Unstage all files
    pub fn unstage_all(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;

        match repo.head() {
            Ok(head) => {
                let obj = head.peel(git2::ObjectType::Commit)?;
                repo.reset_default(Some(&obj), ["*"])?;
            }
            Err(_) => {
                let mut index = repo.index()?;
                index.clear()?;
                index.write()?;
            }
        }
        Ok(())
    }

    /// Create a commit from the current index
    pub fn commit(repo_path: &Path, message: &str) -> AppResult<String> {
        let repo = Repository::open(repo_path)?;

        // Check for conflicts
        let index = repo.index()?;
        if index.has_conflicts() {
            return Err(AppError::Git(
                "Cannot commit: unresolved conflicts exist".to_string(),
            ));
        }

        let signature = repo.signature()?;
        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let parents = if let Ok(head) = repo.head() {
            vec![head.peel_to_commit()?]
        } else {
            vec![]
        };

        let parent_refs: Vec<&git2::Commit> = parents.iter().collect();

        let oid = repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parent_refs,
        )?;

        Ok(oid.to_string())
    }

    /// Discard changes to a file (checkout from HEAD)
    pub fn discard_file(repo_path: &Path, file_path: &str) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;

        let mut checkout_builder = git2::build::CheckoutBuilder::new();
        checkout_builder.path(file_path);
        checkout_builder.force();

        repo.checkout_head(Some(&mut checkout_builder))?;
        Ok(())
    }

    /// Merge a source branch into the current branch (Update from)
    pub fn merge_from(repo_path: &Path, source_branch: &str) -> AppResult<MergeRebaseResult> {
        let repo = Repository::open(repo_path)?;

        // Find the source branch (local or remote)
        let source = repo
            .find_branch(source_branch, BranchType::Local)
            .or_else(|_| repo.find_branch(source_branch, BranchType::Remote))
            .map_err(|_| AppError::Git(format!("Branch '{}' not found", source_branch)))?;

        let source_commit = source.get().peel_to_commit()?;
        let annotated_commit = repo.find_annotated_commit(source_commit.id())?;

        let (merge_analysis, _) = repo.merge_analysis(&[&annotated_commit])?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeRebaseResult::UpToDate);
        }

        if merge_analysis.is_fast_forward() {
            let head_ref = repo.head()?;
            let resolved = head_ref.resolve()?;
            let mut target_ref = repo.find_reference(resolved.name().ok_or_else(|| {
                AppError::Git("Failed to get HEAD reference name".to_string())
            })?)?;
            target_ref.set_target(source_commit.id(), "Fast-forward merge")?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
            return Ok(MergeRebaseResult::Success);
        }

        if merge_analysis.is_normal() {
            // Perform merge
            repo.merge(&[&annotated_commit], None, Some(
                git2::build::CheckoutBuilder::new()
                    .allow_conflicts(true)
                    .conflict_style_merge(true),
            ))?;

            // Check for conflicts
            let index = repo.index()?;
            if index.has_conflicts() {
                let conflict_paths: Vec<String> = index
                    .conflicts()?
                    .filter_map(|c| c.ok())
                    .filter_map(|c| {
                        c.our
                            .as_ref()
                            .or(c.their.as_ref())
                            .and_then(|e| String::from_utf8(e.path.clone()).ok())
                    })
                    .collect();
                return Ok(MergeRebaseResult::Conflicts(conflict_paths));
            }

            // No conflicts — create merge commit
            let signature = repo.signature()?;
            let mut index = repo.index()?;
            let tree_id = index.write_tree()?;
            let tree = repo.find_tree(tree_id)?;
            let head_commit = repo.head()?.peel_to_commit()?;

            repo.commit(
                Some("HEAD"),
                &signature,
                &signature,
                &format!("Merge branch '{}' into {}", source_branch, repo.head()?.shorthand().unwrap_or("HEAD")),
                &tree,
                &[&head_commit, &source_commit],
            )?;

            repo.cleanup_state()?;
            return Ok(MergeRebaseResult::Success);
        }

        Err(AppError::Git("Merge analysis returned unexpected result".to_string()))
    }

    /// Rebase current branch onto a target branch (Update from)
    pub fn rebase_onto(repo_path: &Path, onto_branch: &str) -> AppResult<MergeRebaseResult> {
        let repo = Repository::open(repo_path)?;

        let onto = repo
            .find_branch(onto_branch, BranchType::Local)
            .or_else(|_| repo.find_branch(onto_branch, BranchType::Remote))
            .map_err(|_| AppError::Git(format!("Branch '{}' not found", onto_branch)))?;

        let onto_commit = onto.get().peel_to_commit()?;
        let onto_annotated = repo.find_annotated_commit(onto_commit.id())?;

        // Check if up-to-date
        let head_commit = repo.head()?.peel_to_commit()?;
        if repo.merge_base(head_commit.id(), onto_commit.id())? == onto_commit.id() {
            return Ok(MergeRebaseResult::UpToDate);
        }

        let mut checkout_opts = git2::build::CheckoutBuilder::new();
        checkout_opts.allow_conflicts(true);
        checkout_opts.conflict_style_merge(true);

        let mut rebase = repo.rebase(
            None,
            Some(&onto_annotated),
            None,
            Some(git2::RebaseOptions::new().checkout_options(checkout_opts)),
        )?;

        let signature = repo.signature()?;

        while let Some(op) = rebase.next() {
            let _op = op?;

            // Check for conflicts
            let index = repo.index()?;
            if index.has_conflicts() {
                let conflict_paths: Vec<String> = index
                    .conflicts()?
                    .filter_map(|c| c.ok())
                    .filter_map(|c| {
                        c.our
                            .as_ref()
                            .or(c.their.as_ref())
                            .and_then(|e| String::from_utf8(e.path.clone()).ok())
                    })
                    .collect();
                return Ok(MergeRebaseResult::Conflicts(conflict_paths));
            }

            rebase.commit(None, &signature, None)?;
        }

        rebase.finish(Some(&signature))?;

        Ok(MergeRebaseResult::Success)
    }

    /// Enhanced merge_to_branch that returns MergeRebaseResult
    pub fn merge_to_branch_with_result(
        project_path: &Path,
        session_id: &str,
        target_branch: &str,
    ) -> AppResult<MergeRebaseResult> {
        let repo = Repository::open(project_path)?;
        let branch_name = format!("forkestra/session-{}", session_id);

        // Get the session branch
        let session_branch = repo.find_branch(&branch_name, BranchType::Local)?;
        let session_commit = session_branch.get().peel_to_commit()?;

        // Checkout target branch
        let target = repo.find_branch(target_branch, BranchType::Local)?;
        let target_ref_name = target.get().name().ok_or_else(|| {
            AppError::Git("Failed to get target branch reference".to_string())
        })?.to_string();

        repo.set_head(&target_ref_name)?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;

        // Get annotated commit for merge
        let annotated_commit = repo.find_annotated_commit(session_commit.id())?;

        // Perform merge analysis
        let (merge_analysis, _) = repo.merge_analysis(&[&annotated_commit])?;

        if merge_analysis.is_up_to_date() {
            return Ok(MergeRebaseResult::UpToDate);
        }

        if merge_analysis.is_fast_forward() {
            let mut target_ref = repo.find_reference(&target_ref_name)?;
            target_ref.set_target(session_commit.id(), "Fast-forward merge")?;
            repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
            return Ok(MergeRebaseResult::Success);
        }

        if merge_analysis.is_normal() {
            // Normal merge
            repo.merge(&[&annotated_commit], None, Some(
                git2::build::CheckoutBuilder::new()
                    .allow_conflicts(true)
                    .conflict_style_merge(true),
            ))?;

            // Check for conflicts
            let index = repo.index()?;
            if index.has_conflicts() {
                let conflict_paths: Vec<String> = index
                    .conflicts()?
                    .filter_map(|c| c.ok())
                    .filter_map(|c| {
                        c.our
                            .as_ref()
                            .or(c.their.as_ref())
                            .and_then(|e| String::from_utf8(e.path.clone()).ok())
                    })
                    .collect();
                return Ok(MergeRebaseResult::Conflicts(conflict_paths));
            }

            // Create merge commit
            let signature = repo.signature()?;
            let mut index = repo.index()?;
            let tree_id = index.write_tree()?;
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
            return Ok(MergeRebaseResult::Success);
        }

        Err(AppError::Git("Merge analysis returned unexpected result".to_string()))
    }

    /// Abort an in-progress merge
    pub fn abort_merge(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;
        repo.cleanup_state()?;
        repo.checkout_head(Some(git2::build::CheckoutBuilder::new().force()))?;
        Ok(())
    }

    /// Abort an in-progress rebase
    pub fn abort_rebase(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;
        let mut rebase = repo.open_rebase(None)?;
        rebase.abort()?;
        Ok(())
    }

    /// Continue an in-progress merge (create merge commit)
    pub fn continue_merge(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;

        // Ensure no conflicts remain
        let index = repo.index()?;
        if index.has_conflicts() {
            return Err(AppError::Git(
                "Cannot continue merge: unresolved conflicts remain".to_string(),
            ));
        }

        let signature = repo.signature()?;
        let mut index = repo.index()?;
        let tree_id = index.write_tree()?;
        let tree = repo.find_tree(tree_id)?;

        let head_commit = repo.head()?.peel_to_commit()?;

        // Get MERGE_HEAD
        let merge_head_path = repo.path().join("MERGE_HEAD");
        let merge_head_content = std::fs::read_to_string(&merge_head_path)
            .map_err(|_| AppError::Git("MERGE_HEAD not found".to_string()))?;
        let merge_oid = git2::Oid::from_str(merge_head_content.trim())
            .map_err(|e| AppError::Git(format!("Invalid MERGE_HEAD: {}", e)))?;
        let merge_commit = repo.find_commit(merge_oid)?;

        // Read MERGE_MSG if available
        let merge_msg_path = repo.path().join("MERGE_MSG");
        let message = std::fs::read_to_string(&merge_msg_path)
            .unwrap_or_else(|_| "Merge commit".to_string());

        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            &message,
            &tree,
            &[&head_commit, &merge_commit],
        )?;

        repo.cleanup_state()?;
        Ok(())
    }

    /// Continue an in-progress rebase
    pub fn continue_rebase(repo_path: &Path) -> AppResult<()> {
        let repo = Repository::open(repo_path)?;

        // Ensure no conflicts remain
        let index = repo.index()?;
        if index.has_conflicts() {
            return Err(AppError::Git(
                "Cannot continue rebase: unresolved conflicts remain".to_string(),
            ));
        }

        let signature = repo.signature()?;
        let mut rebase = repo.open_rebase(None)?;

        // Commit the current step
        rebase.commit(None, &signature, None)?;

        // Continue remaining steps
        while let Some(op) = rebase.next() {
            let _op = op?;

            let index = repo.index()?;
            if index.has_conflicts() {
                return Err(AppError::Git(
                    "Conflicts encountered during rebase continue".to_string(),
                ));
            }

            rebase.commit(None, &signature, None)?;
        }

        rebase.finish(Some(&signature))?;
        Ok(())
    }

    /// Get conflict content for a file (ours, theirs, base, working copy)
    pub fn get_conflict_content(
        repo_path: &Path,
        file_path: &str,
    ) -> AppResult<ConflictContent> {
        let repo = Repository::open(repo_path)?;
        let index = repo.index()?;

        let mut ours_content = None;
        let mut theirs_content = None;
        let mut base_content = None;

        // Find the conflict entry
        for conflict in index.conflicts()? {
            let conflict = conflict?;

            let conflict_path = conflict
                .our
                .as_ref()
                .or(conflict.their.as_ref())
                .and_then(|e| String::from_utf8(e.path.clone()).ok());

            if conflict_path.as_deref() != Some(file_path) {
                continue;
            }

            // Read blobs
            if let Some(ref entry) = conflict.ancestor {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    base_content = Some(String::from_utf8_lossy(blob.content()).to_string());
                }
            }
            if let Some(ref entry) = conflict.our {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    ours_content = Some(String::from_utf8_lossy(blob.content()).to_string());
                }
            }
            if let Some(ref entry) = conflict.their {
                if let Ok(blob) = repo.find_blob(entry.id) {
                    theirs_content = Some(String::from_utf8_lossy(blob.content()).to_string());
                }
            }
            break;
        }

        // Read working copy
        let working_path = repo_path.join(file_path);
        let working = std::fs::read_to_string(&working_path)
            .unwrap_or_default();

        Ok(ConflictContent {
            path: file_path.to_string(),
            ours: ours_content,
            theirs: theirs_content,
            base: base_content,
            working,
        })
    }

    /// Resolve a conflict by writing content and staging the file
    pub fn resolve_conflict(
        repo_path: &Path,
        file_path: &str,
        content: &str,
    ) -> AppResult<()> {
        // Write content to the file
        let full_path = repo_path.join(file_path);
        std::fs::write(&full_path, content)?;

        // Stage the file (this removes the conflict entry)
        let repo = Repository::open(repo_path)?;
        let mut index = repo.index()?;
        index.add_path(Path::new(file_path))?;
        index.write()?;

        Ok(())
    }
}
