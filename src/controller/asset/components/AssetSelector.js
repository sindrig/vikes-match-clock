import React from 'react';
import PropTypes from 'prop-types';
import assetTypes from './AssetTypes';

const keyToAssetKey = (key) => {
    if (/\.((jpg)|(png))$/.test(key) && key.startsWith('players/')) {
        const playerKey = key.replace('players/', '').split('.')[0];
        const parts = playerKey.split(/[ ](.+)/);
        let playerNumber = parseInt(parts[0], 10);
        if (Number.isNaN(playerNumber)) {
            [playerNumber] = parts;
        }
        const playerName = parts[1].split('_').join(' ');
        return {
            type: assetTypes.PLAYER,
            key,
            name: playerName,
            number: playerNumber,
            teamName: null, // TODO: VIKES?
        };
    }
    return {
        type: assetTypes.IMAGE,
        key,
    };
};

const AssetSelector = ({ addAssetKey, children }) => {
    const onChangeHandler = (e) => {
        const { target: { value } } = e;
        addAssetKey(keyToAssetKey(value));
    };
    return <select onChange={onChangeHandler} value="null">{children}</select>;
};

AssetSelector.propTypes = {
    addAssetKey: PropTypes.func.isRequired,
    children: PropTypes.oneOfType([
        PropTypes.arrayOf(PropTypes.node),
        PropTypes.node,
    ]).isRequired,
};

export default AssetSelector;
