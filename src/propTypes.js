import PropTypes from 'prop-types';

export const matchPropType = PropTypes.shape({
    homeScore: PropTypes.number,
    awayScore: PropTypes.number,
    started: PropTypes.number,
    half: PropTypes.number,
    homeTeam: PropTypes.string.isRequired,
    awayTeam: PropTypes.string,
});
