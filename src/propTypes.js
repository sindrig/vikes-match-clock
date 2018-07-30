import PropTypes from 'prop-types';

import { HALFS } from './constants';
import { ASSET_VIEWS } from './reducers/controller';

export const matchPropType = PropTypes.shape({
    homeScore: PropTypes.number,
    awayScore: PropTypes.number,
    started: PropTypes.number,
    half: PropTypes.oneOf(Object.keys(HALFS)),
    homeTeam: PropTypes.string.isRequired,
    awayTeam: PropTypes.string,
    injuryTime: PropTypes.number,
});

export const playerPropType = PropTypes.shape({
    name: PropTypes.string.isRequired,
    number: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
    role: PropTypes.string,
    show: PropTypes.bool,
});

export const assetPropType = PropTypes.shape({
    key: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
});

export const teamPlayersPropType = PropTypes.shape({
    homeTeam: PropTypes.arrayOf(playerPropType).isRequired,
    awayTeam: PropTypes.arrayOf(playerPropType).isRequired,
});

export const assetsPropType = PropTypes.shape({
    selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
    cycle: PropTypes.bool.isRequired,
    imageSeconds: PropTypes.number.isRequired,
    autoPlay: PropTypes.bool.isRequired,
});

export const controllerPropType = PropTypes.shape({
    assets: assetsPropType,
    teamPlayers: teamPlayersPropType.isRequired,
    assetView: PropTypes.oneOf(Object.values(ASSET_VIEWS)),
});

export const availableMatchesPropType = PropTypes.objectOf(PropTypes.shape({
    group: PropTypes.string,
    players: PropTypes.objectOf(PropTypes.arrayOf(playerPropType)),
}));
