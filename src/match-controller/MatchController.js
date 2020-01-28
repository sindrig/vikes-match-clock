import React from 'react';
import PropTypes from 'prop-types';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import { VIEWS } from '../reducers/controller';

import controllerActions from '../actions/controller';
import matchActions from '../actions/match';
import { matchPropType } from '../propTypes';
import TeamController from './TeamController';
import ControlButton from './ControlButton';

import './MatchController.css';

const MatchController = ({
    match: { started },
    selectView,
    pauseMatch,
    startMatch,
}) => (
    <div className="match-controller">
        <TeamController className="match-controller-box" team="home" started={started} />
        <div className="match-controller-box">
            <ControlButton className="yellow" big onClick={started ? pauseMatch : startMatch}>{started ? 'Stop' : 'Start'}</ControlButton>
            <ControlButton onClick={() => selectView(VIEWS.match)}>Leiðrétta</ControlButton>
        </div>
        <TeamController className="match-controller-box" team="away" started={started} />
    </div>
);

MatchController.propTypes = {
    match: matchPropType.isRequired,
    selectView: PropTypes.func.isRequired,
    startMatch: PropTypes.func.isRequired,
    pauseMatch: PropTypes.func.isRequired,
};

MatchController.defaultProps = {
};


const stateToProps = ({ match }) => ({ match });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    pauseMatch: matchActions.pauseMatch,
    startMatch: matchActions.startMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(MatchController);
