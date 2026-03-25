# Security Policy

## Supported Versions

This project currently supports the latest code on the `main` branch.

## Reporting A Vulnerability

Please do not open a public issue for a suspected secret leak or security problem.

Instead, contact the maintainer privately and include:

- A short description of the issue
- Affected file paths or URLs
- Reproduction steps, if relevant
- Whether any credential may already be exposed

If a credential is exposed, rotate or revoke it first, then clean up the repository history if needed.

## Secret Handling

- Never commit real `.env`, deploy, or SSH key files
- Keep production deploy settings in ignored local files such as `deploy/deploy.env`
- Keep production-only frontend route overrides in ignored local files such as `apps/web/.env.production.local`
- Use placeholder values in example config files

## Repository Guardrails

This repository includes a GitHub Actions secret scan workflow at `.github/workflows/secret-scan.yml`.

Recommended GitHub settings:

- Enable GitHub secret scanning in the repository Security settings
- Keep user push protection enabled for public repositories
- Protect the `main` branch with required pull requests and required status checks

## If A Secret Leaks

1. Rotate the secret immediately.
2. Remove the secret from the working tree.
3. Rewrite Git history if the secret reached Git.
4. Force-push the cleaned history if necessary.
5. Verify that GitHub secret scanning alerts are resolved.
