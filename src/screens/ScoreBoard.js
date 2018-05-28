import { connect } from 'react-redux';
import ScoreBoard from './components/ScoreBoard';


const stateToProps = ({ match }) => ({ match });

export default connect(stateToProps)(ScoreBoard);
