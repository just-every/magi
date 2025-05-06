import * as esbuild from 'esbuild';

try {
  await esbuild.build({
    entryPoints: ['src/server/server.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    minify: true,
    packages: 'external',
    outfile: 'dist/server.js',
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    banner: {
      js: "import { createRequire } from 'module';\nconst require = createRequire(import.meta.url);"
    }
  });

  console.log('✅ Server production build complete!');

} catch (error) {
  console.error('Server build failed:', error);
  process.exit(1);
}