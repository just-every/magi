const path = require('path');

module.exports = {
  mode: 'development',
  entry: './controller/client/client.ts',
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@types': path.resolve(__dirname, 'controller/shared/types')
    }
  },
  output: {
    filename: 'client.js',
    path: path.resolve(__dirname, 'dist/controller'),
  },
  watchOptions: {
    ignored: /node_modules/,
    aggregateTimeout: 300,
    poll: 1000,
  },
  devServer: {
    hot: true,
    watchFiles: ['controller/client/**/*.ts', 'controller/client/**/*.html', 'controller/client/**/*.css'],
  },
};
