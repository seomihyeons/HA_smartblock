const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const dotenv = require('dotenv');

dotenv.config();
console.log('[dotenv]', process.cwd());
console.log('[dotenv] HA_BASE_URL=', process.env.HA_BASE_URL, 'HA_TOKEN=', !!process.env.HA_TOKEN);

const config = {
  entry: './src/index.js',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  devServer: {
    static: './build',
  },
  module: {
    rules: [
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: 'src/index.html',
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    config.output.path = path.resolve(__dirname, 'build');

    config.devtool = 'eval-cheap-module-source-map';

    config.devServer = {
      host: '0.0.0.0',
      port: 8080,
      hot: true,
      historyApiFallback: true,

      proxy: {
        '/ha/api': {
          target: process.env.HA_BASE_URL,
          changeOrigin: true,
          secure: false,
          ws: true,
          pathRewrite: { '^/ha': '' },
          onProxyReq: (proxyReq) => {
            const token = process.env.HA_TOKEN;
            if (token) {
              proxyReq.setHeader('Authorization', `Bearer ${token}`);
            }
          },
        },

        '/analyze': {
          target: 'http://localhost:8787',
          changeOrigin: true,
          secure: false,
        },
      },
    };

    config.module.rules.push({
      test: /(blockly\/.*\.js)$/,
      use: [require.resolve('source-map-loader')],
      enforce: 'pre',
    });

    config.ignoreWarnings = [/Failed to parse source map/];
  }
  return config;
};
