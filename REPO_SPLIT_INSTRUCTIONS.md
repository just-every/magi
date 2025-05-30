# Repository Split Instructions

The repositories have been prepared for splitting. Follow these manual steps:

## 1. Create GitHub Repositories

First, create these repositories on GitHub:
- https://github.com/just-every/ensemble
- https://github.com/just-every/ecot
- https://github.com/just-every/magi-system

## 2. Push Ensemble Repository ✅ COMPLETED

```bash
cd /Users/zemaj/www/magi-system/temp-ensemble
git branch -M main
git remote add origin https://github.com/just-every/ensemble.git
git push -u origin main
```

## 3. Push ECOT Repository ✅ COMPLETED

```bash
cd /Users/zemaj/www/magi-system/temp-ecot
git branch -M main
git remote add origin https://github.com/just-every/ecot.git
git push -u origin main
```

## 4. Publish to NPM

### For Ensemble:
```bash
cd /Users/zemaj/www/magi-system/temp-ensemble
npm login  # Login with your npm account
npm publish --access public --otp=<your-2fa-code>
```

### For ECOT:
```bash
cd /Users/zemaj/www/magi-system/temp-ecot
npm login  # Login with your npm account  
npm publish --access public --otp=<your-2fa-code>
```

**Note**: Replace `<your-2fa-code>` with the current code from your authenticator app.

## 5. Update magi-system Dependencies

After publishing, update the main magi-system to use the npm packages:

```bash
cd /Users/zemaj/www/magi-system

# Remove local ensemble and mech directories
rm -rf ensemble mech

# Update package.json dependencies
# Change from:
#   "@magi-system/ensemble": "file:./ensemble"
#   "@magi-system/mech": "file:./mech"
# To:
#   "@just-every/ensemble": "^1.0.0"
#   "@just-every/ecot": "^1.0.0"

# Install the published packages
npm install @just-every/ensemble@latest @just-every/ecot@latest

# Update all imports in the codebase
# Change from:
#   import { ... } from '@magi-system/ensemble'
#   import { ... } from '@magi-system/mech'
# To:
#   import { ... } from '@just-every/ensemble'
#   import { ... } from '@just-every/ecot'

# Commit the changes
git add -A
git commit -m "refactor: use published npm packages for ensemble and ecot"
git push
```

## 6. Clean Up

After everything is working:
```bash
rm -rf temp-ensemble temp-ecot
git branch -d ensemble-split mech-split
```

## Package Locations

- **Ensemble**: LLM provider abstraction layer
  - GitHub: https://github.com/just-every/ensemble
  - NPM: https://www.npmjs.com/package/@just-every/ensemble

- **ECOT**: Ensemble Chain-of-Thought - Advanced LLM orchestration
  - GitHub: https://github.com/just-every/ecot
  - NPM: https://www.npmjs.com/package/@just-every/ecot

- **MAGI System**: Main orchestration system
  - GitHub: https://github.com/just-every/magi-system