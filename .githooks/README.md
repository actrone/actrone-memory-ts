# Git hooks

`pre-commit` runs before every commit in this repository:

- **gitleaks** scans the staged changes for anything that looks like a secret.
- **TruffleHog** checks the staged changes for credentials that are live: one it verifies with its issuer
  stops the commit. One it cannot verify (a placeholder such as `user:pass@host`) is listed as a warning, so
  check each is not a real credential.
- A staged file over 5 MB, or a leftover merge conflict marker, stops the commit.

If a scanner is missing, the commit stops instead of going ahead unscanned.

## Turn it on

Run once in each clone:

```sh
git config core.hooksPath .githooks
```

Both scanners must be on `PATH`: gitleaks 8.30 or later and trufflehog 3.99 or later. Install them from
[gitleaks](https://github.com/gitleaks/gitleaks#installing) and
[TruffleHog](https://github.com/trufflesecurity/trufflehog#floppy_disk-installation).

## When it stops a commit

- **A real secret:** remove it from the change and rotate it. Treat it as exposed if it was ever committed
  or pushed anywhere.
- **A false positive** (a test fixture or a documented placeholder): review it, then add the fingerprint
  gitleaks prints to `.gitleaksignore`, with a comment saying why it is not a secret. Never list a real
  credential there.

Never skip the hook with `--no-verify`.
