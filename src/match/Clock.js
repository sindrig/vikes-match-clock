import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';

import controllerActions from '../actions/controller';
import Clock from './components/Clock';
import matchActions from '../actions/match';


const stateToProps = ({ match: { started, half } }) => ({ started, half });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    updateMatch: matchActions.updateMatch,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Clock);
