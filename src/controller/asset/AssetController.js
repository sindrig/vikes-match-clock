import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import AssetController from './components/AssetController';
import controllerActions from '../../actions/controller';


const stateToProps = ({ controller: { assetView }, match }) => ({ assetView, match });

const dispatchToProps = dispatch => bindActionCreators({
    selectAssetView: controllerActions.selectAssetView,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(AssetController);
