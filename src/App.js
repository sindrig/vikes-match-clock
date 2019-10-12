import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';

import ShortcutManager from './utils/ShortcutManager';

import viewActions from './actions/view';
import Controller from './controller/Controller';

import ScoreBoard from './screens/ScoreBoard';
import Idle from './screens/Idle';
import { BACKGROUND } from './constants';

import { VIEWS } from './reducers/controller';
import { viewPortPropType } from './propTypes';

import './App.css';


class App extends Component {
    static propTypes = {
        view: PropTypes.string.isRequired,
        vp: viewPortPropType.isRequired,
        setViewPort: PropTypes.func.isRequired,
    };

    static childContextTypes = {
        // eslint-disable-next-line
        shortcuts: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            overlay: null,
        };
        this.handleShortcuts = this.handleShortcuts.bind(this);
        this.setOverlay = this.setOverlay.bind(this);
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        const { setViewPort, vp } = this.props;
        setViewPort(vp);
    }

    setOverlay(component) {
        this.setState({ overlay: component });
    }

    handleShortcuts(action) {
        switch (action) {
        case 'clearImage':
            this.setOverlay(null);
            break;
        default:
            console.error('Unknown key pressed', action);
        }
        return this;
    }

    renderOverlay() {
        // TODO move to separate container.
        // TODO fade out.
        const { vp } = this.props;
        const { overlay } = this.state;
        if (!overlay) {
            return null;
        }
        return (
            <div className="overlay-container" style={vp.style}>
                {overlay}
            </div>
        );
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
        const { vp } = this.props;
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
                <Controller renderAsset={this.setOverlay} />
                {this.renderOverlay()}
            </Shortcuts>
        );
    }
}

const stateToProps = ({ controller: { view }, view: { vp } }) => ({ view, vp });

const dispatchToProps = dispatch => bindActionCreators({
    setViewPort: viewActions.setViewPort,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(App);
