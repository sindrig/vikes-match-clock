import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import ShortcutManager from './utils/ShortcutManager';

import viewActions from './actions/view';
import Controller from './controller/Controller';
import Asset from './controller/asset/Asset';

import ScoreBoard from './screens/ScoreBoard';
import Idle from './screens/Idle';
import { BACKGROUND } from './constants';

import { VIEWS } from './reducers/controller';
import { viewPortPropType } from './propTypes';
import StateListener from './StateListener';

import './App.css';


class App extends Component {
    static propTypes = {
        view: PropTypes.string.isRequired,
        vp: viewPortPropType.isRequired,
        asset: PropTypes.shape({
            asset: PropTypes.shape({
                key: PropTypes.string.isRequired,
                type: PropTypes.string.isRequired,
            }).isRequired,
            time: PropTypes.number,
        }),
        setViewPort: PropTypes.func.isRequired,
    };

    static defaultProps = {
        asset: null,
    };

    static childContextTypes = {
        // eslint-disable-next-line
        shortcuts: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.handleShortcuts = this.handleShortcuts.bind(this);
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        const { setViewPort, vp } = this.props;
        setViewPort(vp);
    }

    handleShortcuts(action) {
        switch (action) {
        case 'clearImage':
            console.log('clearImage');
            break;
        default:
            console.error('Unknown key pressed', action);
        }
        return this;
    }

    renderCurrentView() {
        const { view } = this.props;

        switch (view) {
        case VIEWS.match:
            return <ScoreBoard />;
        case VIEWS.idle:
        default:
            return <Idle />;
        }
    }

    render() {
        const { vp, asset } = this.props;
        const style = {
            ...BACKGROUND,
            ...vp.style,
        };
        return (
            <Shortcuts
                name="MAIN"
                handler={this.handleShortcuts}
                global
                targetNodeSelector="body"
            >
                <div className="App" style={style}>
                    {this.renderCurrentView()}
                </div>
                <Controller />
                { asset ? (
                    <div className="overlay-container" style={vp.style}>
                        <Asset {...asset} />
                    </div>
                ) : null
                }
                <StateListener />
            </Shortcuts>
        );
    }
}

const stateToProps = ({
    controller: { view, currentAsset }, view: { vp },
}) => ({ view, vp, asset: currentAsset || null });

const dispatchToProps = dispatch => bindActionCreators({
    setViewPort: viewActions.setViewPort,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(App);
