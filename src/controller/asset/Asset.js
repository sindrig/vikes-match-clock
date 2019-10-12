import React, { Component } from 'react';
import PropTypes from 'prop-types';
import YouTube from 'react-youtube';
import { connect } from 'react-redux';

import { assetPropType, viewPortPropType } from '../../propTypes';
import PlayerCard from './PlayerCard';
import Substitution from './Substitution';

import * as assets from '../../assets';
import assetTypes from './AssetTypes';
import clubLogos from '../../images/clubLogos';
import Ruv from './Ruv';

import './Asset.css';

export const checkKey = asset => (
    // Make sure that the asset type is in assetTypes
    // And make sure that the asset key is not null/undefined/empty
    Object.keys(assetTypes).indexOf(asset.type) !== -1 && asset.key
);

class Asset extends Component {
    static propTypes = {
        asset: assetPropType.isRequired,
        remove: PropTypes.func,
        thumbnail: PropTypes.bool,
        time: PropTypes.number,
        vp: viewPortPropType.isRequired,
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
        const typeNeedsManualRemove = asset.type !== assetTypes.URL;
        if (time && !thumbnail && remove && typeNeedsManualRemove) {
            this.timeout = setTimeout(remove, time * 1000);
        }
    }

    getPlayerAsset({ asset, widthMultiplier }) {
        const { thumbnail } = this.props;
        if (asset.type === assetTypes.PLAYER) {
            return (
                <PlayerCard
                    asset={asset}
                    thumbnail={thumbnail}
                    className="player-card-image"
                    key={asset.key}
                    overlay={asset.overlay}
                >
                    <img src={assets[asset.key]} alt={asset.key} />
                </PlayerCard>
            );
        }
        if (asset.type === assetTypes.NO_IMAGE_PLAYER) {
            const { teamName } = asset;
            return (
                <PlayerCard
                    asset={asset}
                    thumbnail={thumbnail}
                    className="player-card-no-image"
                    widthMultiplier={widthMultiplier}
                    key={asset.key}
                    overlay={asset.overlay}
                >
                    {clubLogos[teamName]
                        ? <img src={clubLogos[teamName]} alt="teamName" />
                        : null
                    }
                </PlayerCard>
            );
        }
        throw new Error('you should not get here');
    }

    renderRuv() {
        const { asset: { key }, thumbnail } = this.props;
        return <Ruv thumbnail={thumbnail} channel={key} />;
    }

    renderUrl() {
        const {
            asset, thumbnail, remove, vp,
        } = this.props;
        // TODO can only handle youtube
        let url;
        try {
            url = new window.URL(asset.key);
        } catch (e) {
            console.error('Unknown url ', asset.key);
            return null;
        }
        const isYouTube = url.host.indexOf('youtube');
        const params = url.search.replace('?', '').split('&');
        const videoId = params.map(p => p.split('=')).filter(kv => kv[0] === 'v').map(kv => kv[1])[0];
        if (isYouTube) {
            if (videoId) {
                if (thumbnail) {
                    return (
                        <a href={`https://www.youtube.com/watch?v=${videoId}`}>
                            Youtube:
                            {videoId}
                        </a>
                    );
                }
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
                opts.playerVars.showinfo = 0;
                opts.playerVars.autoplay = 1;
                opts.playerVars.controls = 0;
                opts.height = vp.style.height;
                opts.width = vp.style.width;
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
        }
        console.log('Do not know how to render ', url);
        return null;
    }

    render() {
        const { asset, thumbnail } = this.props;
        if (asset.type === assetTypes.IMAGE) {
            return <img src={assets[asset.key]} alt={asset.key} key={asset.key} />;
        }
        if (asset.type === assetTypes.URL) {
            return this.renderUrl();
        }
        if (asset.type === assetTypes.RUV) {
            return this.renderRuv();
        }
        if (asset.type === assetTypes.PLAYER || asset.type === assetTypes.NO_IMAGE_PLAYER) {
            return this.getPlayerAsset({ asset, widthMultiplier: 1 });
        }
        if (asset.type === assetTypes.SUB) {
            const { subIn, subOut } = asset;
            return (
                <Substitution thumbnail={thumbnail}>
                    {[subIn, subOut].map(subAsset => this.getPlayerAsset({
                        asset: subAsset,
                        widthMultiplier: 0.7,
                    }))}
                </Substitution>
            );
        }
        console.error('No type for item ', asset);
        return null;
    }
}


const stateToProps = ({ view: { vp } }) => ({ vp });

export default connect(stateToProps)(Asset);
