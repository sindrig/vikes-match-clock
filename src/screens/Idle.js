import React, { Component } from 'react';
import axios from 'axios';
import Clock from 'react-live-clock';
import clubLogos from '../images/clubLogos';
import AdImage from '../utils/AdImage';

import './Idle.css';

// Change this to true touse real temp
const useRealTemperature = false;

export default class Idle extends Component {
    constructor(props) {
        super(props);
        this.updateTemp = this.updateTemp.bind(this);
        this.state = {
            temperature: 0,
        };
    }

    componentDidMount() {
        this.updateTemp();
        this.interval = setInterval(this.updateTemp, 60000);
    }

    componentWillUnmount() {
        clearInterval(this.interval);
    }

    updateTemp() {
        if (!useRealTemperature) {
            return;
        }
        const options = {
            params: {
                stations: '1',
                time: '1h',
                anytime: '1',
            },
        };
        axios.get('http://apis.is/weather/observations/en', options)
            .then(({
                data: { results },
            }) => this.setState({
                temperature: Math.ceil(parseFloat(results[0].T)),
            }));
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
