const requireAssets = require.context('./assets', true, /.*/);
const requirePlayers = require.context('./players', true, /.*/);

const RE = /^[\\./\\]+/;
const getKey = (key, loc) => `${loc}/${key.replace(RE, '')}`;

const exp = {};
requireAssets.keys().forEach((key) => {
    exp[getKey(key, 'assets')] = requireAssets(key);
});
requirePlayers.keys().forEach((key) => {
    exp[getKey(key, 'players')] = requirePlayers(key);
});

module.exports = exp;
