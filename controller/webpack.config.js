const path = require('path');

module.exports = {
    mode: 'development',
    entry: './src/client/client.tsx',
    devtool: 'source-map',
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.scss$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js', '.jsx', '.scss', '.css'],
        alias: {
            '@types/shared-types': path.resolve(__dirname, 'src/types'),
            '@components': path.resolve(__dirname, 'src/client/js/components'),
            '@hooks': path.resolve(__dirname, 'src/client/js/hooks'),
            '@context': path.resolve(__dirname, 'src/client/js/context'),
        },
    },
    output: {
        filename: 'client.js',
        path: path.resolve(__dirname, 'dist'),
    },
    watchOptions: {
        ignored: /node_modules/,
        aggregateTimeout: 300,
        poll: 1000,
    },
    devServer: {
        hot: true,
        watchFiles: [
            'src/client/**/*.ts',
            'src/client/**/*.tsx',
            'src/client/**/*.html',
            'src/client/**/*.css',
            'src/client/**/*.scss',
        ],
    },
};
