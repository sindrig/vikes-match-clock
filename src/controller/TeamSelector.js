import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import matchActions from '../actions/match';
import TeamSelector from './components/TeamSelector';


const stateToProps = ({ match }, ownProps) => ({ match, ...ownProps });
const dispatchToProps = dispatch => bindActionCreators({
    updateMatch: matchActions.updateMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(TeamSelector);
