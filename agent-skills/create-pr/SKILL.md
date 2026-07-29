---
name: create-pr
description: Creates a pull request by analyzing the diff between the current branch and origin/main (or master). If a PR template exists, follows it. Asks for language preference first, presents a draft for approval, and only pushes/creates PR after user confirmation. Use when the user says "create PR", "make a pull request", "submit PR", or similar.
---

# Create Pull Request

Creates a pull request by analyzing the diff between the current branch and origin/main (or master). If a PR template exists, follows it. Asks for language preference first, presents a draft for approval, and only pushes/creates PR after user confirmation.

## Execution Steps

### 1. Ask for PR Description Language

Use AskUserQuestion to ask the user which language they want for the PR description:
- Japanese (日本語)
- English
- Other (allow custom input)

### 2. Gather Git Information

Run the following git commands in parallel:
- `git branch --show-current` - Get current branch name
- `git remote show origin | grep 'HEAD branch'` - Determine base branch (main or master)
- `git status` - Check working tree status

### 3. Verify Branch State

Check:
- Current branch is not the base branch (main/master)
- Working tree is clean (no uncommitted changes)
- If there are uncommitted changes, warn the user and ask if they want to proceed

### 4. Analyze Changes

Run the following commands:
- `git log origin/[base-branch]..HEAD` - Get all commits that will be included
- `git diff origin/[base-branch]...HEAD` - Get the full diff
- Analyze both the commits and the code changes to understand what this PR does

### 5. Check for PR Template

Look for PR template files in the following locations:
- `.github/PULL_REQUEST_TEMPLATE.md`
- `.github/pull_request_template.md`
- `.github/PULL_REQUEST_TEMPLATE/*.md`
- `docs/PULL_REQUEST_TEMPLATE.md`

If found, read the template and use it as structure for the PR description.

### 6. Generate PR Draft

Based on the analyzed changes and template (if exists), generate:
- **PR Title**: Concise, clear summary of changes
- **PR Description**: Following the template structure or standard format:
  - Summary of changes
  - Motivation/Context
  - Test plan (if applicable)
  - Screenshots (if UI changes)
  - Checklist items (if in template)

Use the language specified by the user in step 1.

### 7. Present Draft and Get Approval

Display the draft PR to the user, including:
- PR title
- PR description
- Base branch and current branch
- Number of commits
- Files changed summary

Ask the user:
- If they want to make any changes to the title or description
- If they approve to proceed with push and PR creation

Use AskUserQuestion with options:
- "Approve and create PR"
- "Request changes" (allow text input for feedback)

### 8. Handle Feedback Loop

If user requests changes:
- Apply the feedback to the PR draft
- Present the updated draft again
- Repeat until approved

### 9. Push and Create PR

ONLY after approval:
1. Check if remote branch exists: `git ls-remote --heads origin [current-branch]`
2. Push the branch:
   - If remote doesn't exist: `git push -u origin [current-branch]`
   - If remote exists: `git push origin [current-branch]`
3. Create PR using gh CLI:
   ```bash
   gh pr create --title "[title]" --body "[description]" --base [base-branch]
   ```
   Use HEREDOC for the body to ensure correct formatting

### 10. Confirm Success

After PR creation:
- Display the PR URL
- Confirm that the PR was created successfully

## Important Notes

- **Never push or create PR without explicit user approval**
- Do not proceed if working tree is dirty (unless user confirms)
- Always check both main and master as possible base branches
- If gh CLI is not installed or not authenticated, provide clear instructions
- Preserve markdown formatting in PR description
- Include all commits in the analysis, not just the latest one
- If PR template has required fields, ensure they are all addressed

## Examples

**Example 1:**
- User says: "PRを作って"
- Skill behavior:
  1. Asks language preference (likely Japanese)
  2. Analyzes diff between current branch and origin/main
  3. Checks for .github/PULL_REQUEST_TEMPLATE.md
  4. Generates Japanese PR description following template
  5. Shows draft and waits for approval
  6. After approval, pushes and creates PR

**Example 2:**
- User says: "create pr"
- Skill behavior:
  1. Asks language preference (likely English)
  2. Analyzes changes and generates English PR description
  3. Presents draft for review
  4. Creates PR only after user approves

**Example 3:**
- User says: "submit a pull request for this feature"
- Skill behavior: Same as above, tailoring PR description to focus on the feature

## Tool Usage

This Skill uses the following tools:
- **Bash**: For git commands (status, diff, log, push) and gh CLI (pr create)
- **Read**: For reading PR template files
- **AskUserQuestion**: For language selection and approval workflow
- **Glob**: For finding PR template files

## References

- GitHub CLI documentation: https://cli.github.com/manual/gh_pr_create
- PR template locations: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests/creating-a-pull-request-template-for-your-repository
