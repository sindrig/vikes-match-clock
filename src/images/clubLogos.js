const requireAssets = require.context('./club-logos', true, /.*/);

const stripStartRe = /^[\\./\\]+/;
const stripExtRe = /\.\w+$/;

const sanitizeKey = key => key
    .replace(stripStartRe, '')
    .replace(stripExtRe, '');

const exp = {};
requireAssets.keys().forEach((key) => {
    exp[sanitizeKey(key)] = requireAssets(key);
});

module.exports = exp;
