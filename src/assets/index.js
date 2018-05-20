const requireAssets = require.context('./assets', true, /.*/);

const RE = /^[\\./\\]+/;

const exp = {};
requireAssets.keys().forEach((key) => {
    exp[key.replace(RE, '')] = requireAssets(key);
});

module.exports = exp;
