import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const startTime = performance.now();

try {
  await esbuild.build({
    entryPoints: ['src/client/index.tsx'],
    bundle: true,
    minify: true,
    sourcemap: 'external',
    outfile: 'public/static/bundle.js',
    define: {
      'process.env.NODE_ENV': '"production"'
    },
    plugins: [
      sassPlugin({
        type: 'style',
        filter: /\.s[ac]ss$/,
        quietDeps: true,
        cssImports: true,
        loadPaths: ['node_modules']
      })
    ],
    loader: {
      '.scss': 'css',
      '.sass': 'css',
      '.svg': 'file',
      '.png': 'file'
    },
    logLevel: 'info'
  });

  const buildTime = ((performance.now() - startTime) / 1000).toFixed(2);
  console.log(`✅ Production build completed in ${buildTime}s`);

} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}