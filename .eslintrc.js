module.exports = {
    "parser": "babel-eslint",
    "extends": [
        "airbnb",
        "plugin:jest/recommended",
    ],
    "plugins": [
        "react"
    ],
    "rules": {
        "strict": 0,
        "indent": ["error", 4],
        "react/jsx-indent": ["error", 4],
        "react/jsx-indent-props": ["error", 4],
        "react/no-unescaped-entities": [0],
        "react/jsx-filename-extension": [1, { "extensions": [".js", ".jsx"] }],
        "no-console": 0,
        "import/no-extraneous-dependencies": ["error", {"devDependencies": true}],
    },
    "globals": {
        "document": true,
        "window": true,
        "fetch": true
    }
};