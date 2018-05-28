import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import Controller from './components/Controller';
import controllerActions from '../actions/controller';
import globalActions from '../actions/global';


const stateToProps = ({ controller: { view }, match }) => ({ view, match });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
    clearState: globalActions.clearState,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Controller);
