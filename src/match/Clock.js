import { connect } from 'react-redux';
import Clock from './components/Clock';


const stateToProps = ({ match: { started, half } }) => ({ started, half });

export default connect(stateToProps)(Clock);
