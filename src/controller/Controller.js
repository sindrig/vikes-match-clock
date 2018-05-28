import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import Controller from './components/Controller';
import controllerActions from '../actions/controller';


const stateToProps = ({ controller: { view }, match }) => ({ view, match });

const dispatchToProps = dispatch => bindActionCreators({
    selectView: controllerActions.selectView,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(Controller);
