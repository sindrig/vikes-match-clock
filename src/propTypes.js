import PropTypes from 'prop-types';
import { ASSET_VIEWS } from './reducers/controller';

export const matchPropType = PropTypes.shape({
    homeScore: PropTypes.number,
    awayScore: PropTypes.number,
    started: PropTypes.number,
    half: PropTypes.number,
    homeTeam: PropTypes.string.isRequired,
    awayTeam: PropTypes.string,
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

export const controllerPropType = PropTypes.shape({
    assets: PropTypes.shape({
        selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
        cycle: PropTypes.bool.isRequired,
        imageSeconds: PropTypes.number.isRequired,
        autoPlay: PropTypes.bool.isRequired,
    }),
    teamPlayers: teamPlayersPropType.isRequired,
    assetView: PropTypes.oneOf(Object.values(ASSET_VIEWS)),
});
