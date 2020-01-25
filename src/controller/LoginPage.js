import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import { withFirebase } from 'react-redux-firebase';
import remoteActions from '../actions/remote';

class LoginPage extends Component {
    static propTypes = {
        password: PropTypes.string,
        sync: PropTypes.bool,
        email: PropTypes.string,
        setSync: PropTypes.func.isRequired,
        setEmail: PropTypes.func.isRequired,
        setPassword: PropTypes.func.isRequired,
        firebase: PropTypes.shape({
            auth: PropTypes.func.isRequired,
        }).isRequired,
        available: PropTypes.arrayOf(PropTypes.string),
        listenPrefix: PropTypes.string.isRequired,
        setListenPrefix: PropTypes.func.isRequired,
    };

    static defaultProps = {
        password: '',
        email: '',
        sync: false,
        available: [],
    };

    constructor(props) {
        super(props);
        this.state = { currentUser: null };
        this.checkUserLoggedIn = this.checkUserLoggedIn.bind(this);
    }

    componentDidMount() {
        this.interval = setInterval(this.checkUserLoggedIn, 5000);
        setTimeout(this.checkUserLoggedIn, 1000);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    checkUserLoggedIn() {
        const { firebase } = this.props;
        const { currentUser } = firebase.auth();
        this.setState({ currentUser });
    }

    renderIsRemoteCtrl() {
        const { sync, setSync } = this.props;
        return (
            <label htmlFor="set-synced">
                <input type="checkbox" checked={sync} onChange={() => setSync(!sync)} id="set-synced" />
                Fjarstjórn
            </label>
        );
    }

    renderListenerCtrl() {
        const { setListenPrefix, available, listenPrefix } = this.props;
        if (!available) {
            return null;
        }
        return (
            <div>
                Stjórnandi:
                <select
                    onChange={({ target: { value } }) => setListenPrefix(value)}
                    value={listenPrefix}
                >
                    {available.map(a => <option value={a} key={a}>{a}</option>)}
                </select>
            </div>
        );
    }

    render() {
        const {
            password, email, setEmail, setPassword, firebase,
        } = this.props;
        const { currentUser } = this.state;
        if (currentUser) {
            return (
                <div>
                    {this.renderIsRemoteCtrl()}
                    [
                    <b>{currentUser.email.split('@')[0]}</b>
                    ]
                    <br />
                    <button type="button" onClick={() => firebase.logout().then(this.checkUserLoggedIn)}>Log out...</button>
                </div>
            );
        }
        const login = (e) => {
            e.preventDefault();
            // eslint-disable-next-line
            firebase.login({ email, password }).catch(err => alert(err.message)).then(this.checkUserLoggedIn);
        };
        return (
            <div>
                <form onSubmit={login}>
                    <div>
                        {this.renderIsRemoteCtrl()}
                    </div>
                    {this.renderListenerCtrl()}
                    <div>
                        <input
                            name="email"
                            autoComplete="email"
                            placeholder="E-mail"
                            label="Email"
                            value={email}
                            onChange={({ target: { value } }) => setEmail(value)}
                        />
                        <input
                            name="password"
                            placeholder="Password"
                            autoComplete="current-password"
                            label="Password"
                            type="password"
                            value={password}
                            onChange={({ target: { value } }) => setPassword(value)}
                        />
                    </div>
                    <div>
                        <button
                            type="submit"
                        >
                            Login
                        </button>
                    </div>
                </form>
            </div>
        );
    }
}


const stateToProps = ({ remote: { email, password, sync, listenPrefix }, listeners: { available } }) => ({
    email, password, sync, listenPrefix, available: available,
});
const dispatchToProps = dispatch => bindActionCreators({
    setEmail: remoteActions.setEmail,
    setPassword: remoteActions.setPassword,
    setSync: remoteActions.setSync,
    setListenPrefix: remoteActions.setListenPrefix,
}, dispatch);

export default withFirebase(connect(stateToProps, dispatchToProps)(LoginPage));
