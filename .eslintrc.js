module.exports = {
  parser: "babel-eslint",
  // extends: ["prettier"],
  extends: ["eslint:recommended", "plugin:react/recommended", "prettier"],
  plugins: ["react"],

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
