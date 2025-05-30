# NPM Publish Commands

The packages are ready to publish. Run these commands with your current 2FA codes:

## 1. Publish Ensemble
```bash
cd /Users/zemaj/www/magi-system/temp-ensemble
npm publish --access public --otp=<your-2fa-code>
```

## 2. Publish ECOT
```bash
cd /Users/zemaj/www/magi-system/temp-ecot
npm publish --access public --otp=<your-2fa-code>
```

## 3. After Both Are Published Successfully
```bash
cd /Users/zemaj/www/magi-system
npm install
npm run build
```

## 4. Test the Changes
```bash
cd /Users/zemaj/www/magi-system
npm run build:docker
# Test that everything still works
```

## 5. Commit the Changes
```bash
git add -A
git commit -m "refactor: use published npm packages @just-every/ensemble and @just-every/ecot

- Remove local ensemble and mech directories
- Update package.json dependencies to use published packages
- Update all import statements
- Remove ensemble and mech from workspaces

🤖 Generated with [Claude Code](https://claude.ai/code)

Co-Authored-By: Claude <noreply@anthropic.com>"
git push
```

## 6. Clean Up
```bash
rm -rf temp-ensemble temp-ecot
git branch -d ensemble-split mech-split
```

## Package URLs
- **Ensemble**: https://www.npmjs.com/package/@just-every/ensemble
- **ECOT**: https://www.npmjs.com/package/@just-every/ecot