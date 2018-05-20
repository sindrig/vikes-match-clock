const requireAssets = require.context('./assets', true, /.*/);

const exp = {};
requireAssets.keys().forEach((key) => {
    exp[key] = requireAssets(key);
});

module.exports = exp;
