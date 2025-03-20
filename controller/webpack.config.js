const path = require('path');

module.exports = {
  mode: 'development',
  entry: './src/client/client.ts',
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
      '@types': path.resolve(__dirname, 'src/types/shared-types')
    }
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
    watchFiles: ['src/client/**/*.ts', 'src/client/**/*.html', 'src/client/**/*.css'],
  },
};
