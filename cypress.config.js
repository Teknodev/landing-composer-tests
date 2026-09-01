const { defineConfig } = require("cypress");
const path = require("path");
const webpackPreprocessor = require("@cypress/webpack-preprocessor");

module.exports = defineConfig({
  e2e: {
    setupNodeEvents(on, config) {
      // Wire absolute imports via webpack-preprocessor aliases.
      // Aliases mirror jsconfig.json:
      //   @support    -> cypress/support
      //   @pages-po   -> cypress/support/pages
      //   @fixtures   -> cypress/fixtures
      const options = {
        webpackOptions: {
          resolve: {
            extensions: [".js", ".ts", ".json"],
            alias: {
              "@support": path.resolve(__dirname, "cypress/support"),
              "@pages-po": path.resolve(__dirname, "cypress/support/pages"),
              "@fixtures": path.resolve(__dirname, "cypress/fixtures"),
            },
          },
          module: {
            rules: [
              {
                test: /\.m?js$/,
                exclude: /node_modules/,
                use: {
                  loader: "babel-loader",
                  options: {
                    presets: [
                      ["@babel/preset-env", { targets: { esmodules: true } }],
                    ],
                  },
                },
              },
            ],
          },
        },
        watchOptions: {},
      };
      on("file:preprocessor", webpackPreprocessor(options));
      return config;
    },
    baseUrl: "http://localhost:3000",
    experimentalRunAllSpecs: true,
    env: {
      // Canonical E2E credentials — single source of truth for all auth-required specs.
      // Override via CYPRESS_AUTH_USERNAME / CYPRESS_AUTH_PASSWORD env vars at runtime if needed.
      AUTH_USERNAME: "blinkpage1@hotmail.com",
      AUTH_PASSWORD: "Deneme123",
      // Spica API base URL used by cy.login() to POST /fn-execute/v1/auth/login.
      // Must match the editor's VITE_API_URL (see landing-composer/.env.local).
      API_URL: "http://localhost:4501/api",
    },
  },
});
