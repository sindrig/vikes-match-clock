import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { Shortcuts } from 'react-shortcuts';
import { connect } from 'react-redux';

import ShortcutManager from './utils/ShortcutManager';

import Controller from './controller/Controller';

import ScoreBoard from './screens/ScoreBoard';
import Idle from './screens/Idle';
import backgroundImage from './images/background.png';
import be50 from './images/be50.png';

import { VIEWS } from './reducers/controller';

import './App.css';


const backgrounds = [
    { backgroundImage: `url(${backgroundImage})` },
    { backgroundColor: 'black' },
    {},
];

// January is 0...
const beFrom = new Date(2019, 1, 16, 19);
const beTo = new Date(2019, 1, 16, 21);

class App extends Component {
    static propTypes = {
        view: PropTypes.string.isRequired,
    };

    static childContextTypes = {
        shortcuts: PropTypes.object.isRequired,
    }

    constructor(props) {
        super(props);
        this.state = {
            overlay: null,
            currentTime: new Date(),
        };
        this.handleShortcuts = this.handleShortcuts.bind(this);
        this.setOverlay = this.setOverlay.bind(this);
    }

    getChildContext() {
        return { shortcuts: ShortcutManager };
    }

    componentDidMount() {
        this.interval = setInterval(() => this.setState({ currentTime: new Date() }), 10000);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
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
        const { overlay, currentTime } = this.state;
        if (beFrom <= currentTime && beTo >= currentTime) {
            return (
                <div className="overlay-container">
                    <img src={be50} alt="" style={{ width: '100%' }} />
                </div>
            );
        }
        if (!overlay) {
            return null;
        }
        return (
            <div className="overlay-container">
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
        return (
            <Shortcuts
                name="MAIN"
                handler={this.handleShortcuts}
                global
                targetNodeSelector="body"
            >
                <div className="App" style={backgrounds[0]}>
                    {this.renderCurrentView()}
                </div>
                <Controller renderAsset={this.setOverlay} />
                {this.renderOverlay()}
            </Shortcuts>
        );
    }
}

const stateToProps = ({ controller: { view } }) => ({ view });

export default connect(stateToProps)(App);
