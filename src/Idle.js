import React from 'react';
import Clock from 'react-live-clock';
import vikesImage from './images/vikes.png';
import AdImage from './AdImage';

export default () => (
    <div className="idle">
        <img src={vikesImage} alt="Vikes" className="idle-vikes" />
        <Clock format="HH:mm" className="idle-clock" ticking />
        <AdImage />
    </div>
);
