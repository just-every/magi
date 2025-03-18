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
      '@types': path.resolve(__dirname, 'controller/types')
    }
  },
  output: {
    filename: 'client.js',
    path: path.resolve(__dirname, 'dist/controller'),
  },
};
