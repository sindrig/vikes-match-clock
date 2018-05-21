import React from 'react';
import Clock from 'react-live-clock';
import clubLogos from '../images/clubLogos';
import AdImage from '../utils/AdImage';

import './Idle.css';

export default () => (
    <div className="idle">
        <img src={clubLogos['Víkingur R']} alt="Vikes" className="idle-vikes" />
        <div className="idle-text-container">
            <div className="idle-text-box idle-clock">
                <Clock format="HH:mm" className="idle-clock" ticking />
            </div>
            <div className="idle-text-box idle-temp">
                <span className="idle-temperature">17°</span>
            </div>
        </div>
        <AdImage />
    </div>
);
