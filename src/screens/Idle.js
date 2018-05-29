import React, { Component } from 'react';
import Clock from 'react-live-clock';
import clubLogos from '../images/clubLogos';
import AdImage from '../utils/AdImage';
import { getTemp } from '../lib/weather';

import './Idle.css';

const fetchTempInterval = 5 * 60 * 1000;

// Change this to true touse real temp
const useRealTemperature = true;

export default class Idle extends Component {
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
        const { temperature } = this.state;
        return (
            <div className="idle">
                <img src={clubLogos['Víkingur R']} alt="Vikes" className="idle-vikes" />
                <div className="idle-text-container">
                    <div className="idle-text-box idle-clock">
                        <Clock format="HH:mm" className="idle-clock" ticking />
                    </div>
                    <div className="idle-text-box idle-temp">
                        <span className="idle-temperature">{useRealTemperature ? `${temperature}°` : '17°'}</span>
                    </div>
                </div>
                <AdImage />
            </div>
        );
    }
}
