import React, { Component } from 'react';
import PropTypes from 'prop-types';
import YouTube from 'react-youtube';

import { assetPropType } from '../../propTypes';
import PlayerCard from './PlayerCard';
import Substitution from './Substitution';

import * as assets from '../../assets';
import assetTypes from './AssetTypes';
import clubLogos from '../../images/clubLogos';

import './Asset.css';

export const checkKey = key => Object.keys(assetTypes).indexOf(key.type) !== -1;

export default class Asset extends Component {
    static propTypes = {
        asset: assetPropType.isRequired,
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
        this.getPlayerAsset = this.getPlayerAsset.bind(this);
    }

    componentDidMount() {
        this.setTimeoutIfNecessary();
    }

    componentDidUpdate() {
        this.setTimeoutIfNecessary();
    }

    componentWillUnmount() {
        clearTimeout(this.timeout);
    }

    setTimeoutIfNecessary() {
        const {
            time, thumbnail, remove, asset,
        } = this.props;
        clearTimeout(this.timeout);
        const typeNeedsManualRemove = asset.type !== assetTypes.YOUTUBE;
        if (time && !thumbnail && remove && typeNeedsManualRemove) {
            this.timeout = setTimeout(remove, time * 1000);
        }
    }

    getPlayerAsset(asset) {
        const { thumbnail } = this.props;
        if (asset.type === assetTypes.PLAYER) {
            return (
                <PlayerCard
                    playerNumber={asset.number}
                    playerName={asset.name}
                    asset={asset}
                    thumbnail={thumbnail}
                >
                    <img src={assets[asset.key]} alt={asset.key} />
                </PlayerCard>
            );
        } else if (asset.type === assetTypes.NO_IMAGE_PLAYER) {
            const { number, name, teamName } = asset;
            return (
                <PlayerCard
                    playerNumber={parseInt(number, 10)}
                    playerName={name}
                    asset={asset}
                    thumbnail={thumbnail}
                >
                    {clubLogos[teamName] ?
                        <img src={clubLogos[teamName]} alt="teamName" /> :
                        null
                    }
                </PlayerCard>
            );
        }
        throw new Error('you should not get here');
    }

    render() {
        const { asset, thumbnail, remove } = this.props;
        if (asset.type === assetTypes.IMAGE) {
            return <img src={assets[asset.key]} alt={asset.key} key={asset.key} />;
        } else if (asset.type === assetTypes.URL) {
            // TODO can only handle youtube
            const url = new window.URL(asset.key);
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
        } else if (asset.type === assetTypes.PLAYER || asset.type === assetTypes.NO_IMAGE_PLAYER) {
            return this.getPlayerAsset(asset);
        } else if (asset.type === assetTypes.SUB) {
            const { subIn, subOut } = asset;
            return (
                <Substitution thumbnail={thumbnail}>
                    {[subOut, subIn].map(this.getPlayerAsset)}
                </Substitution>
            );
        }
        console.error('No type for item ', asset);
        return null;
    }
}
