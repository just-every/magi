import * as esbuild from 'esbuild';

let ctx;

try {
  ctx = await esbuild.context({
    entryPoints: ['src/server/server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    sourcemap: 'linked',
    packages: 'external',
    outfile: 'dist/server.js',
    define: {
      'process.env.NODE_ENV': '"development"'
    },
    banner: {
      js: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);"
    }
  });

  await ctx.watch();
  console.log('🔍 Watching server files...');

} catch (error) {
  console.error('Server build error:', error);
  process.exit(1);
}