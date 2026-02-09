const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

dotenv.config();
console.log('[dotenv]', process.cwd());
console.log('[dotenv] HA_BASE_URL=', process.env.HA_BASE_URL, 'HA_TOKEN=', !!process.env.HA_TOKEN);

// Base config that applies to either development or production mode.
const config = {
  entry: './src/index.js',
  output: {
    // Compile the source files into a bundle.
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist'),
    clean: true,
  },
  // Enable webpack-dev-server to get hot refresh of the app.
  devServer: {
    static: './build',
    proxy: {
      '/ha': {
        target: process.env.HA_BASE_URL,   // http://192.168.0.129:8123
        changeOrigin: true,
        secure: false,
        ws: true,
        pathRewrite: { '^/ha': '' },
      },
    },
  },
  module: {
    rules: [
      {
        // Load CSS files. They can be imported into JS files.
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  plugins: [
    // Generate the HTML index page based on our template.
    // This will output the same index page with the bundle we
    // created above added in a script tag.
    new HtmlWebpackPlugin({
      template: 'src/index.html',
    }),
    new webpack.DefinePlugin({
      __HA_BASE_URL__: JSON.stringify(process.env.HA_BASE_URL),
      __HA_TOKEN__: JSON.stringify(process.env.HA_TOKEN),
    }),
  ],
};

module.exports = (env, argv) => {
  if (argv.mode === 'development') {
    // Set the output path to the `build` directory
    // so we don't clobber production builds.
    config.output.path = path.resolve(__dirname, 'build');

    // Generate source maps for our code for easier debugging.
    // Not suitable for production builds. If you want source maps in
    // production, choose a different one from https://webpack.js.org/configuration/devtool
    config.devtool = 'eval-cheap-module-source-map';


    // ✅ devServer를 development에서 "완전 정의"
    config.devServer = {
      host: '0.0.0.0',
      port: 8080,
      hot: true,
      historyApiFallback: true,

      // ✅ HtmlWebpackPlugin이 index.html을 메모리에서 서빙하므로 static 없어도 됨
      // static: { directory: path.resolve(__dirname, 'public') },

      proxy: {
        '/ha/api': {
          target: process.env.HA_BASE_URL,   // http://192.168.0.129:8123
          changeOrigin: true,
          secure: false,
          ws: true,
          pathRewrite: { '^/ha': '' },       // /ha/api/... -> /api/...
        },
      },
    };

    // Include the source maps for Blockly for easier debugging Blockly code.
    config.module.rules.push({
      test: /(blockly\/.*\.js)$/,
      use: [require.resolve('source-map-loader')],
      enforce: 'pre',
    });

    // Ignore spurious warnings from source-map-loader
    // It can't find source maps for some Closure modules and that is expected
    config.ignoreWarnings = [/Failed to parse source map/];
  }
  return config;
};