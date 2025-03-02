import PropTypes from "prop-types";

import { SPORTS } from "./constants";
import { ASSET_VIEWS } from "./reducers/controller";

export const twoMinPropType = PropTypes.shape({
  atTimeElapsed: PropTypes.number.isRequired,
  key: PropTypes.string.isRequired,
  penaltyLength: PropTypes.number.isRequired,
});

export const matchPropType = PropTypes.shape({
  homeScore: PropTypes.number,
  awayScore: PropTypes.number,
  started: PropTypes.number,
  homeTeam: PropTypes.string.isRequired,
  awayTeam: PropTypes.string,
  injuryTime: PropTypes.number,
  matchType: PropTypes.oneOf(Object.keys(SPORTS)),
  matchStartTime: PropTypes.string,
  home2min: PropTypes.arrayOf(twoMinPropType),
  away2min: PropTypes.arrayOf(twoMinPropType),
  timeout: PropTypes.number,
  homeTimeouts: PropTypes.number,
  awayTimeouts: PropTypes.number,
});

export const playerPropType = PropTypes.shape({
  name: PropTypes.string.isRequired,
  id: PropTypes.number,
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
  selectedAssets: PropTypes.arrayOf(assetPropType).isRequired,
  cycle: PropTypes.bool.isRequired,
  imageSeconds: PropTypes.number.isRequired,
  autoPlay: PropTypes.bool.isRequired,
  teamPlayers: teamPlayersPropType.isRequired,
  assetView: PropTypes.oneOf(Object.values(ASSET_VIEWS)),
});

export const availableMatchesPropType = PropTypes.objectOf(
  PropTypes.shape({
    group: PropTypes.string,
    players: PropTypes.objectOf(PropTypes.arrayOf(playerPropType)),
  }),
);

export const viewPortPropType = PropTypes.shape({
  style: PropTypes.shape({
    height: PropTypes.number.isRequired,
    width: PropTypes.number.isRequired,
  }),
  fontSize: PropTypes.string,
  name: PropTypes.string.isRequired,
  key: PropTypes.string.isRequired,
});

export const backgroundPropType = PropTypes.shape({
  backgroundImage: PropTypes.string,
  backgroundColor: PropTypes.string,
});
