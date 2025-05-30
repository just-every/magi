# GitHub Actions Setup for Automated NPM Publishing

## Prerequisites

1. **Generate an NPM Token**:
   - Go to https://www.npmjs.com/settings/zemaj/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type
   - Copy the token (starts with `npm_`)

2. **Add Token to GitHub Secrets**:
   
   For each repository (ensemble and ecot):
   - Go to Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: Your npm token

## How It Works

### 1. Automated Publishing Workflow (`publish.yml`)
- **Triggers**:
  - When you create a GitHub Release
  - Manual trigger with version input
- **Actions**:
  - Builds the package
  - Runs tests
  - Publishes to npm using the NPM_TOKEN

### 2. Release Creation Workflow (`release.yml`)
- **Triggers**: Manual workflow dispatch
- **Options**:
  - Version bump type (patch/minor/major)
  - Pre-release identifier (optional)
- **Actions**:
  - Bumps version in package.json
  - Creates a CHANGELOG entry
  - Opens a PR with the changes

## Release Process

### Option 1: Quick Release (Manual)
```bash
# In the GitHub UI:
1. Go to Actions → "Publish to NPM"
2. Click "Run workflow"
3. Enter version (e.g., "1.0.1")
4. Click "Run workflow"
```

### Option 2: Full Release Process
```bash
# In the GitHub UI:
1. Go to Actions → "Create Release"
2. Select version bump type
3. Review and merge the created PR
4. Create a GitHub release with the same version
5. NPM publish happens automatically
```

## Testing the Workflows

Before using in production, test with a pre-release:

```bash
# 1. Create a beta release
Actions → Create Release → major → beta

# 2. This creates version like "2.0.0-beta.0"
# 3. Merge the PR
# 4. Create GitHub release marked as "pre-release"
# 5. Check npm: npm view @just-every/ensemble@beta
```

## Version Management

The workflows support:
- **Regular versions**: 1.0.1, 1.1.0, 2.0.0
- **Pre-releases**: 1.0.0-beta.0, 1.0.0-rc.1
- **Tags**: latest (default), beta, next

## Rollback Process

If something goes wrong:
```bash
# Unpublish a specific version (within 72 hours)
npm unpublish @just-every/ensemble@1.0.1

# Deprecate a version (recommended)
npm deprecate @just-every/ensemble@1.0.1 "Contains critical bug, use 1.0.2"
```

## Benefits

1. **No manual 2FA**: Automation tokens bypass 2FA requirements
2. **Consistent releases**: Same process every time
3. **Version tracking**: Git tags match npm versions
4. **Changelog automation**: Template created automatically
5. **PR-based workflow**: Review changes before publishing

## Security Notes

- NPM tokens are "Automation" type (read-only + publish)
- Tokens are stored encrypted in GitHub Secrets
- Only repository admins can trigger workflows
- All publishes are logged in GitHub Actions

## Next Steps

1. Add the NPM_TOKEN to both repositories
2. Commit and push the workflow files:
   ```bash
   cd temp-ensemble
   git add .github
   git commit -m "ci: add automated npm publishing workflows"
   git push

   cd ../temp-ecot
   git add .github
   git commit -m "ci: add automated npm publishing workflows"
   git push
   ```

3. Test with a patch release to ensure everything works