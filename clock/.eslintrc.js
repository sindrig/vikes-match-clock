module.exports = {
  parser: "@babel/eslint-parser",
  // extends: ["prettier"],
  extends: ["eslint:recommended", "plugin:react/recommended", "prettier"],
  plugins: ["react"],
  parserOptions: {
    requireConfigFile: false,
    babelOptions: {
      presets: ["@babel/preset-react"],
    },
  },
  overrides: [
    {
      files: ["**/*.spec.js", "**/*.spec.jsx"],
      env: {
        jest: true,
      },
    },
  ],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  globals: {
    document: true,
    window: true,
    gapi: true,
    fetch: true,
    context: true,
    jest: true,
    cy: true,
  },
};
