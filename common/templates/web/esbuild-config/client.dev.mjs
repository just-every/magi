import * as esbuild from 'esbuild';
import { sassPlugin } from 'esbuild-sass-plugin';

const DEV_PORT = 3001;

let ctx;

try {
	ctx = await esbuild.context({
		entryPoints: ['src/client/index.tsx'],
		bundle: true,
		minify: false,
		sourcemap: 'linked',
		outfile: 'public/static/bundle.js',
		plugins: [
			sassPlugin({
				type: 'style',
				filter: /\.s[ac]ss$/,
				quietDeps: true,
				cssImports: true
			})
		],
		define: {
			'process.env.NODE_ENV': '"development"',
			'global': 'window'
		},
		loader: {
			'.scss': 'css',
			'.sass': 'css'
		},
		logLevel: 'info'
	});

	await ctx.watch();
	console.log('👀 Watching client files...');

	const { hosts, port } = await ctx.serve({
		servedir: 'public',
		port: DEV_PORT,
		fallback: 'public/index.html',
		onRequest: ({ method, path, status, timeInMS }) => {
			console.log(`[${status}] ${method} ${path} (${timeInMS}ms)`);
		}
	});

	console.info(`🚀 Client dev server: http://${hosts[0]}:${port}`);

} catch (error) {
	console.error('💥 Client build failed:', error);
	process.exit(1);
}