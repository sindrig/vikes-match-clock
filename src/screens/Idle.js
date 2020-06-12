import React, { Component } from 'react';
import { connect } from 'react-redux';
import Clock from 'react-live-clock';
import { viewPortPropType } from '../propTypes';

import clubLogos from '../images/clubLogos';
import AdImage from '../utils/AdImage';
import { getTemp } from '../lib/weather';

import './Idle.css';

const fetchTempInterval = 5 * 60 * 1000;

// Change this to true touse real temp
const useRealTemperature = true;

class Idle extends Component {
    static propTypes = {
        vp: viewPortPropType.isRequired,
    }

    constructor(props) {
        super(props);
        this.updateTemp = this.updateTemp.bind(this);
        this.state = {
            temperature: 17,
        };
    }

    componentDidMount() {
        this.updateTemp();
        this.interval = setInterval(this.updateTemp, fetchTempInterval);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    updateTemp() {
        if (!useRealTemperature) {
            return;
        }
        getTemp().then((temperature) => {
            if (temperature) {
                this.setState({ temperature });
            }
        });
    }

    render() {
        const { vp } = this.props;
        const { temperature } = this.state;
        return (
            <div className={`idle idle-${vp.key}`}>
                <AdImage size="large" blankBetweenImages time={10} />
                <img src={clubLogos['Víkingur R']} alt="Vikes" className="idle-vikes" />
                <div className="idle-text-container">
                    <div className="idle-text-box idle-clock">
                        <Clock format="HH:mm" className="idle-clock" ticking />
                    </div>
                    <div className="idle-text-box idle-temp">
                        <span className="idle-temperature">{useRealTemperature ? `${temperature}°` : '17°'}</span>
                    </div>
                </div>
            </div>
        );
    }
}


const stateToProps = ({ match, view: { vp } }) => ({ match, vp });

export default connect(stateToProps)(Idle);
