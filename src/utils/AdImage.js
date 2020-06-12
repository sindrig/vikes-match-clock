import React, { useState, useEffect, useRef } from 'react';
import PropTypes from 'prop-types';

import * as assets from '../assets';

function useInterval(callback, delay) {
    const savedCallback = useRef();

    // Remember the latest callback.
    useEffect(() => {
        savedCallback.current = callback;
    }, [callback]);

    // Set up the interval.
    useEffect(() => {
        function tick() {
            savedCallback.current();
        }
        if (delay !== null) {
            const id = setInterval(tick, delay);
            return () => clearInterval(id);
        }
        return () => {};
    }, [delay]);
}

const AdImage = ({ size, time, blankBetweenImages }) => {
    const adRegex = new RegExp(`ads\\/${size}\\/(.*)\\.*`);
    const adAssets = [...new Set(Object.keys(assets)
        .map(k => k.match(adRegex))
        .filter(m => m)
        .map(m => m[1]))];
    const [img, setImg] = useState(0);
    const [isBlank, setBlank] = useState(blankBetweenImages);
    useInterval(() => {
        if (!isBlank && blankBetweenImages) {
            return setBlank(true);
        }
        if (blankBetweenImages && isBlank) {
            setBlank(false);
        }
        const nextImg = img + 1;
        return setImg(nextImg === adAssets.length ? 0 : nextImg);
    }, time * 1000);
    const src = `ads/${size}/${adAssets[img]}`;
    if (isBlank) {
        return null;
    }
    return <img src={assets[src]} className="ad" alt="Ad" />;
};

AdImage.propTypes = {
    size: PropTypes.string.isRequired,
    time: PropTypes.number,
    blankBetweenImages: PropTypes.bool,
};

AdImage.defaultProps = {
    time: 5,
    blankBetweenImages: false,
};

export default AdImage;
