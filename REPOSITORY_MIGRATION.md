# Repository Migration to just-every Organization

## Steps to Move Repository

### 1. Transfer Repository on GitHub

1. Go to https://github.com/has-context/magi-system/settings
2. Scroll to "Danger Zone" section
3. Click "Transfer" button
4. Enter new owner: `just-every`
5. Type repository name to confirm: `magi-system`
6. Click "I understand, transfer this repository"

### 2. Update Local Git Remote

After the transfer is complete:

```bash
cd /Users/zemaj/www/magi-system
git remote set-url origin https://github.com/just-every/magi-system.git
git remote -v  # Verify the change
```

### 3. Update Repository References

Files that need updating after migration:

1. **package.json** files - Update repository URLs
2. **README.md** - Update any links to the old repository
3. **Docker images** - If published to a registry, update references
4. **CI/CD** - Update any GitHub Actions that reference the repository

### 4. Update Dependencies in Other Projects

Any projects that depend on this repository via git URL need updating:

```json
// Old
"magi-system": "git+https://github.com/has-context/magi-system.git"

// New
"magi-system": "git+https://github.com/just-every/magi-system.git"
```

### 5. Redirect Setup (Automatic)

GitHub automatically sets up redirects from the old URL to the new one:
- `https://github.com/has-context/magi-system` → `https://github.com/just-every/magi-system`

This redirect remains active unless:
- A new repository with the same name is created under `has-context`
- The redirects are manually disabled

### 6. Update Documentation

Update any documentation that references the old repository URL:
- Installation instructions
- Clone commands
- Issue/PR links
- Badge URLs

## Post-Migration Checklist

- [ ] Repository successfully transferred
- [ ] Local remotes updated
- [ ] CI/CD workflows still functioning
- [ ] Docker builds working
- [ ] Team access verified
- [ ] Webhooks/integrations updated
- [ ] Documentation updated

## Benefits of Migration

1. **Unified Organization**: All three packages under one organization
   - https://github.com/just-every/ensemble
   - https://github.com/just-every/ecot
   - https://github.com/just-every/magi-system

2. **Consistent Branding**: Everything under the `just-every` namespace

3. **Easier Management**: Single organization for all related projects