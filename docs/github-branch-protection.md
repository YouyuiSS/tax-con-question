# GitHub Branch Protection Checklist

Recommended target branch: `main`

## Branch Protection

Open:

`GitHub -> Settings -> Branches -> Add branch protection rule`

Use branch pattern:

`main`

Turn on these settings:

- Require a pull request before merging
- Require approvals: `1`
- Dismiss stale pull request approvals when new commits are pushed
- Require approval of the most recent reviewable push
- Require conversation resolution before merging
- Require status checks to pass before merging
- Require branches to be up to date before merging
- Do not allow bypassing the above settings
- Restrict force pushes
- Do not allow deletions

Recommended required status checks:

- `gitleaks`

Optional if your team already uses signed commits:

- Require signed commits

Optional if you want a cleaner history:

- Require linear history

## Merge Settings

Open:

`GitHub -> Settings -> General -> Pull Requests`

Recommended:

- Allow squash merging: on
- Allow rebase merging: on
- Allow merge commits: off
- Automatically delete head branches: on

## Security Settings

Open:

`GitHub -> Settings -> Security -> Advanced Security`

Recommended:

- Secret scanning: on
- Push protection: on if available at the repository level

For public repositories on personal accounts, GitHub user push protection is enabled by default for pushes to public repositories.
