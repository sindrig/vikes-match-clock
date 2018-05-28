import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import matchActions from '../actions/match';
import MatchActions from './components/MatchActions';


const stateToProps = ({ controller: { view }, match }) => ({ view, match });
const dispatchToProps = dispatch => bindActionCreators({
    updateMatch: matchActions.updateMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(MatchActions);
