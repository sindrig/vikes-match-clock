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

export const controllerPropType = PropTypes.shape({
    assets: PropTypes.shape({
        selectedAssets: PropTypes.arrayOf(PropTypes.string).isRequired,
        cycle: PropTypes.bool.isRequired,
        imageSeconds: PropTypes.number.isRequired,
        autoPlay: PropTypes.bool.isRequired,
        freeTextAsset: PropTypes.string.isRequired,
    }),
    teamPlayers: PropTypes.shape({
        homeTeam: PropTypes.arrayOf(playerPropType).isRequired,
        awayTeam: PropTypes.arrayOf(playerPropType).isRequired,
    }),
});
