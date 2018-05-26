import PropTypes from 'prop-types';

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
    number: PropTypes.number,
    role: PropTypes.string,
    show: PropTypes.bool,
});

export const assetPropType = PropTypes.shape({
    key: PropTypes.string.isRequired,
    type: PropTypes.string.isRequired,
});

export const controllerPropType = PropTypes.shape({
    assets: PropTypes.shape({
        selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
        cycle: PropTypes.bool.isRequired,
        imageSeconds: PropTypes.number.isRequired,
        autoPlay: PropTypes.bool.isRequired,
    }),
    teamPlayers: PropTypes.shape({
        homeTeam: PropTypes.arrayOf(playerPropType).isRequired,
        awayTeam: PropTypes.arrayOf(playerPropType).isRequired,
    }),
});
