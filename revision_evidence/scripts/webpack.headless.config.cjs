const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: path.resolve(__dirname, 'headless_task_alt_eval.js'),
  output: {
    path: path.resolve(__dirname, '..', '.tmp'),
    filename: 'headless_task_alt_eval.cjs',
    clean: false,
  },
  resolve: {
    extensions: ['.js'],
  },
  optimization: {
    minimize: false,
  },
  stats: 'errors-warnings',
};
