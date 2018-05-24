import React, { Component } from 'react';
import PropTypes from 'prop-types';
import YouTube from 'react-youtube';

import PlayerAsset from './PlayerAsset';
import PlayerCard from './PlayerCard';

import * as assets from '../../assets';
import clubLogos from '../../images/clubLogos';

import './Asset.css';

const assetKeyTests = {
    IMAGE: key => /\.((jpg)|(png))$/.test(key) && key.startsWith('assets/'),
    YOUTUBE: key => /^http/.test(key) && key.indexOf('youtube') > 0,
    PLAYER_IMG: key => /\.((jpg)|(png))$/.test(key) && key.startsWith('players/'),
    CUSTOM_PLAYER: key => /^customPlayer\/\d+\/[\S ]+\/[\S ]+$/.test(key),
};

export const checkKey = key => Object.values(assetKeyTests).some(keyTest => keyTest(key));

const getType = key => Object.keys(assetKeyTests)
    .find(keyTestKey => assetKeyTests[keyTestKey](key));

export default class Asset extends Component {
    static propTypes = {
        assetKey: PropTypes.string.isRequired,
        remove: PropTypes.func,
        thumbnail: PropTypes.bool,
        time: PropTypes.number,
    };

    static defaultProps = {
        thumbnail: false,
        remove: () => {},
        time: null,
    };

    constructor(props) {
        super(props);
        this.timeout = null;
    }

    componentDidMount() {
        this.setTimeoutIfNecessary();
    }

    componentDidUpdate() { // prevProps) {
        // const { assetKey } = this.props;
        // const prevAssetKey = prevProps.assetKey;
        // if (prevAssetKey !== assetKey) {
        this.setTimeoutIfNecessary();
        // }
    }

    componentWillUnmount() {
        clearTimeout(this.timeout);
    }

    setTimeoutIfNecessary() {
        const {
            time, thumbnail, remove, assetKey,
        } = this.props;
        clearTimeout(this.timeout);
        const type = getType(assetKey);
        const typeNeedsManualRemove = type !== 'YOUTUBE';
        if (time && !thumbnail && remove && typeNeedsManualRemove) {
            this.timeout = setTimeout(remove, time * 1000);
        }
    }

    render() {
        const { assetKey, thumbnail, remove } = this.props;
        const type = getType(assetKey);
        if (type === 'IMAGE') {
            return <img src={assets[assetKey]} alt={assetKey} key={assetKey} />;
        } else if (type === 'YOUTUBE') {
            const url = new window.URL(assetKey);
            const params = url.search.replace('?', '').split('&');
            const videoId = params.map(p => p.split('=')).filter(kv => kv[0] === 'v').map(kv => kv[1])[0];
            if (videoId) {
                const opts = {
                    height: '50',
                    width: '100',
                    playerVars: {
                        autoplay: 0,
                        modestbranding: 1,
                        rel: 0,
                        fs: 0,
                        disablekb: 1,
                    },
                };
                if (!thumbnail) {
                    opts.playerVars.showinfo = 0;
                    opts.playerVars.autoplay = 1;
                    opts.playerVars.controls = 0;
                    opts.height = '176';
                    opts.width = '240';
                }
                return (
                    <div style={{ backgroundColor: '#000000' }}>
                        <YouTube
                            videoId={videoId}
                            opts={opts}
                            onEnd={remove}
                        />
                    </div>
                );
            }
        } else if (type === 'PLAYER_IMG') {
            return (
                <PlayerAsset
                    assetKey={assetKey}
                    thumbnail={thumbnail}
                    asset={assets[assetKey]}
                />
            );
        } else if (type === 'CUSTOM_PLAYER') {
            const parts = assetKey.split('/');
            // Get rid of "customPlayer"
            parts.shift();
            const [playerNumber, playerName, teamName] = parts;
            return (
                <PlayerCard
                    playerNumber={parseInt(playerNumber, 10)}
                    playerName={playerName}
                    assetKey={assetKey}
                    thumbnail={thumbnail}
                >
                    {clubLogos[teamName] ?
                        <img src={clubLogos[teamName]} alt="teamName" /> :
                        null
                    }
                </PlayerCard>
            );
        }
        console.error('No type for key ', assetKey);
        return null;
    }
}
