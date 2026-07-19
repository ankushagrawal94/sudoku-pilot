# Repository working agreement

## Always isolate implementation work

All code, content, configuration, documentation, and generated-file changes for this repository must be made in a dedicated Git worktree on a dedicated branch. Treat the primary checkout as a coordination checkout, not an implementation workspace.

This rule applies even when the requested change is small. If the current directory is already a dedicated worktree for the current task, continue there; do not create a nested or second worktree.

Before editing:

1. Inspect `git status --short --branch` and `git worktree list`.
2. Fetch the latest remote refs without modifying any checkout: `git fetch origin`.
3. Choose a short task slug and a unique branch named `codex/<slug>`.
4. Create the worktree outside the repository, based on the latest `origin/main`:

   ```sh
   mkdir -p /path/outside/the/repository/sudoku-app-worktrees
   git worktree add -b codex/<slug> \
     /path/outside/the/repository/sudoku-app-worktrees/<slug> origin/main
   ```

5. Perform all task work and verification in that worktree. Never copy uncommitted files from the primary checkout unless the user explicitly includes those changes in the task.

If the requested branch already exists, do not reuse, reset, delete, or overwrite it without first establishing that it belongs to the same task. Use a new unique slug when uncertain.

## Keep worktrees independently testable

- Install dependencies inside the worktree when needed. The ignored `node_modules/` directory is worktree-local.
- Use a distinct dev-server port when another worktree may already be running, for example `npm run dev -- --port 5174`.
- Run the verification appropriate to the change in the task worktree. The full standard suite is:

  ```sh
  npm run build
  npm test
  npm run catalog:verify
  ```

- Record which checks passed and which were not run. Generated changes produced by required build steps must be reviewed and committed with the source change when the repository tracks them.
- Before integration, ensure the task worktree is clean and all intended changes are committed.

## Rebase, integrate, and deploy safely

The canonical branch is `main`, not `master`.

1. In the task worktree, update refs and rebase the task branch onto the latest remote mainline:

   ```sh
   git fetch origin
   git rebase origin/main
   ```

2. Resolve conflicts and rerun the relevant verification after the rebase.
3. Push the task branch with `git push -u origin codex/<slug>`. If a previously pushed branch was rebased, use `git push --force-with-lease`, never `--force`.
4. Merge through the normal pull-request path when available. Do not merge into or deploy from a dirty primary checkout.
5. If local integration is explicitly requested, create a separate clean integration worktree for `main`, or first confirm that an existing `main` worktree is clean. Never discard, stash, or absorb unrelated primary-checkout changes automatically.
6. Deploy only the committed, verified integration result. After deploying, verify the live behavior when the task affects production.

## GitHub main is the production source of truth

- Never deploy an uncommitted working tree to Vercel.
- Never deploy a local commit that is absent from `origin/main`.
- Before a production deployment, require a clean working tree and verify that `HEAD` equals `git ls-remote origin refs/heads/main`.
- Deploy from that exact committed revision. After deployment, record and report the Git commit, remote-main commit, Vercel deployment ID, and canonical live verification.
- If production must be rolled back, restore service first, then reconcile `origin/main` so the remote branch again reproduces production.

Do not report a task as complete until local commit state, remote push/merge state, and production state (when applicable) are clearly distinguished.

## Clean up after completion

After the branch has been merged and any deployment has been verified:

```sh
git worktree remove /path/outside/the/repository/sudoku-app-worktrees/<slug>
git worktree prune
git branch -d codex/<slug>
```

Delete the remote task branch only after confirming it is merged and no longer needed:

```sh
git push origin --delete codex/<slug>
```

Never remove a worktree with uncommitted changes, use `git worktree remove --force`, or delete an unmerged branch unless the user explicitly authorizes losing that work.
