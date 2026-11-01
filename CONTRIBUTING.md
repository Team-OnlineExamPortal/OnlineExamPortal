# Contributing: the GitHub workflow for this repo

Repo: `Team-OnlineExamPortal/OnlineExamPortal` (default branch `main`).
Backlog board: GitHub Project "OEP-2026-13 Backlog" (columns Todo / In Progress / Done).

This is the exact process used for the Authentication module (FR-001, SEC-001, SEC-004, FR-002, SEC-002, SEC-006). Follow it for every issue.

## The rule in one line

**One issue = one branch = one pull request = one `Closes #N`.** Merge it, the issue closes, then start the next issue from a fresh `main`.

## Issue numbers

Issues are numbered in backlog order, so the number is predictable:

| Prefix | Numbers |
|---|---|
| FR-001 to FR-015 | #1 to #15 (FR-00N is #N) |
| NFR-001 to NFR-006 | #16 to #21 |
| SEC-001 to SEC-006 | #22 to #27 |

Always confirm the number on the issue page before writing `Closes #N`. A wrong number closes the wrong issue.

## Step by step

### 1. Start the issue
- On the board, move your issue to **In Progress** (or leave it if your team does not use that column).
- Update `main` and branch from it:

```bash
git checkout main
git pull
git checkout -b feat/fr-003-question-bank
```

Branch names: `feat/<issue-id>-<short-description>`, lower case, hyphens. Examples used so far: `feat/sec-001-bcrypt`, `feat/sec-004-jwt-expiry`, `feat/fr-002-admin-access`. Use `fix/...` for bug fixes and `docs/...` for documentation.

Only branch from another feature branch when your issue truly needs code that is not on `main` yet, and say so in the PR. Otherwise wait for the earlier PR to merge. A branch cut from `main` before a dependency merges will include (or miss) that code and mix issues together.

### 2. Make the change
- Replace or edit **whole files**, never paste fragments into the middle of an existing file (that breaks syntax and duplicates declarations).
- Do not commit secrets: `.env`, `node_modules/`, `logs/` and `coverage/` are git-ignored. Put new settings in `server/.env.example` with placeholder values only.
- Shared files (`server/src/models.js`, `server/src/app.js`, `server/.env.example`) are edited by several people. Add your part, do not rewrite other people's parts.

### 3. Test before you commit
```bash
cd server
npm test            # must pass; the User model is mocked, no MongoDB needed
cd ..
git status          # only the files you meant to change should be listed
```

### 4. Commit
One commit per issue, Conventional Commit style, with the requirement ID in the subject and the closing keyword in the body:

```
feat(<scope>): <what it does> (<ISSUE-ID>)

<one short paragraph: what changed and why>

Closes #<N>
```

On Windows PowerShell there is no `<<EOF` heredoc. Use several `-m` flags (each one is a paragraph):

```powershell
git add <the specific files>
git commit -m "feat(questions): create, edit, disable and categorize MCQs (FR-003)" -m "Adds the Question model and admin-only CRUD routes. Options are validated and the correct answer is never returned to students." -m "Closes #3"
```

Add files by name. Do not use `git add .` or `git add -A`.

### 5. Push
```bash
git push -u origin feat/fr-003-question-bank
```
The output prints a link to open the pull request.

### 6. Open the pull request (base: `main`)
Title: same as the commit subject. Description:

```
## Summary
- what changed, in one to three bullets

## Test plan
- [x] npm test (N tests passed)

Closes #3
```

`Closes #N` must be in the PR description (or a commit that reaches `main`). Accepted keywords: `Closes`, `Fixes`, `Resolves`. One keyword per issue (`Closes #3, closes #4`).

With the GitHub CLI: `gh pr create --base main --title "<title>" --body-file <file>`.

### 7. Get it approved
`main` is protected. A PR needs **at least 1 approving review** from someone with write access, and CI (once added) must be green. You cannot approve your own PR, so ask a teammate.

To review someone else's PR:
1. Open the PR, go to **Files changed**.
2. Read the diff. Optionally run it: `git fetch origin`, `git checkout <their-branch>`, `cd server && npm test`.
3. Click **Review changes**, choose **Approve** (or **Request changes** with comments), then **Submit review**.

CLI: `gh pr review <number> --approve`.

**Do not tick "Merge without waiting for requirements to be met (bypass rules)".** That checkbox only appears for admins. It skips the review rule and is visible in the PR history. If a new commit is pushed after an approval, the approval may need to be repeated.

### 8. Merge
Use **Create a merge commit** (the default). Do not squash: the issue-by-issue commit history and any dependent branches rely on it. After the merge:

- Issue #N closes automatically because of `Closes #N`. Open the issue and check it says **Closed**.
- Check the board: the card should be in **Done**. If it is not, move it by hand.
- Delete the branch on GitHub (the button on the merged PR) if you like.

If an issue did not close, close it with a comment that links the PR: `gh issue close <N> --comment "Done in #<PR number>"`, or use **Close issue** on the issue page.

### 9. Get ready for the next issue
```bash
git checkout main
git pull
git log --oneline -3     # the top commit should be your "Merge pull request" commit
git checkout -b feat/<next-issue>
```

## Things that went wrong before (so they do not happen again)

| Problem | What to do |
|---|---|
| Branch was cut from `main` before the previous PR merged, so the diff contains two issues | Do not push. Reset the branch onto the right base, then restore your files from the old commit: `git checkout <right-base-branch>`, `git checkout -B <your-branch>`, `git checkout <old-commit-sha> -- <your files>`, test, commit. |
| `git rebase` stops with conflicts in several files | `git rebase --abort`, then use the reset-and-restore steps above. |
| Git says "diverged" after you reset a branch you already pushed | Do not `git pull`. Push with `git push --force-with-lease origin <your-branch>`. Only ever force-push your own feature branch, never `main`. |
| Merge conflict in `models.js`, `app.js` or `.env.example` | Keep both sides: your addition and the other person's. Re-run `npm test`, then `git add` the file and continue. |
| Heredoc (`<<'EOF'`) errors on Windows | Use multiple `-m` flags as shown above. |
| `curl` behaves strangely on Windows PowerShell | Use `curl.exe` or `Invoke-RestMethod`. |
| Pasted a snippet into a file and the server crashed | Replace the whole file with the full version. |
| Committed or pushed a secret | Tell the team immediately. The secret must be rotated; deleting the file is not enough. |

## Checklist per issue

- [ ] Branch created from up-to-date `main` (`feat/<id>-<name>`)
- [ ] `npm test` passes, `git status` shows only intended files
- [ ] One commit, subject ends with the issue ID, body has `Closes #N`
- [ ] PR into `main`, description has `Closes #N` and a test plan
- [ ] At least one teammate approved (no bypass)
- [ ] Merged with a merge commit; issue is Closed; board card is Done
- [ ] `git checkout main && git pull` before the next branch
