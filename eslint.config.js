const js = require("@eslint/js");
const pyoshConfig = require("eslint-config-pyosh");
const pyoshPrettierConfig = require("eslint-config-pyosh/prettier");
const pyoshTsConfig = require("eslint-config-pyosh/typescript");
const globals = require("globals");

module.exports = [
  { ignores: ["build/**"] },
  js.configs.recommended,
  ...pyoshConfig,
  ...pyoshTsConfig,
  ...pyoshPrettierConfig,
  {
    languageOptions: {
      globals: { ...globals.node, ...globals.mocha },
    },
  },
];
