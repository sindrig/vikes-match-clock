import { bindActionCreators } from 'redux';
import { connect } from 'react-redux';
import PropTypes from 'prop-types';
import React, { Component } from 'react';

import { addVideosFromPlaylist } from './YoutubePlaylist';
import { ASSET_VIEWS } from '../../reducers/controller';
import { matchPropType, assetsPropType } from '../../propTypes';
import Asset, { checkKey } from './Asset';
import AssetSelector from './AssetSelector';
import RemovableAsset from './RemovableAsset';
import TeamAssetController from './team/TeamAssetController';
import UrlController from './UrlController';
import assetTypes from './AssetTypes';
import * as assetsImages from '../../assets';
import controllerActions from '../../actions/controller';

import './AssetController.css';


class AssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        renderAsset: PropTypes.func.isRequired,
        selectAssetView: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        assetView: PropTypes.string.isRequired,
        assets: assetsPropType.isRequired,
        updateAssets: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            playing: false,
            error: '',
        };
        this.deleteNextAsset = this.deleteNextAsset.bind(this);
        this.showNextAsset = this.showNextAsset.bind(this);
        this.onCycleChange = this.onCycleChange.bind(this);
        this.onAutoPlayChange = this.onAutoPlayChange.bind(this);
        this.onImageSecondsChange = this.onImageSecondsChange.bind(this);
        this.pause = this.pause.bind(this);
        this.requestRemoval = this.requestRemoval.bind(this);
        this.addMultipleAssets = this.addMultipleAssets.bind(this);
        this.clearQueue = this.clearQueue.bind(this);
        this.addAssetKey = this.addAssetKey.bind(this);
        this.removeAsset = this.removeAsset.bind(this);
    }

    onCycleChange() {
        const { assets: { cycle } } = this.props;
        this.updateAssets({ cycle: !cycle });
    }

    onAutoPlayChange() {
        const { assets: { autoPlay } } = this.props;
        this.updateAssets({ autoPlay: !autoPlay });
        if (!autoPlay) {
            this.pause();
        }
    }

    onImageSecondsChange(event) {
        event.preventDefault();
        const { target: { value } } = event;
        this.updateAssets({ imageSeconds: Math.max(parseInt(value, 10), 1) });
    }

    addAssetKey(asset) {
        if (asset.type === assetTypes.URL) {
            if (asset.key.indexOf('youtube') > -1) {
                try {
                    const url = new URL(asset.key);
                    if (url.pathname === '/playlist') {
                        const params = url.search.replace('?', '').split('&');
                        const listId = params.map(p => p.split('=')).filter(kv => kv[0] === 'list').map(kv => kv[1])[0];
                        console.log('listId', listId);
                        return addVideosFromPlaylist(listId, this.addAssetKey);
                    }
                } catch (e) {
                    console.log(e);
                }
            }
        }
        return this.addMultipleAssets([asset]);
    }

    addMultipleAssets(assetList, options = { showNow: false }) {
        const { assets: { selectedAssets }, renderAsset } = this.props;
        const updatedAssets = [...selectedAssets];
        const errors = [];
        if (options.showNow && assetList.length === 1) {
            renderAsset(<Asset
                asset={assetList[0]}
            />);
        } else {
            assetList.forEach((asset) => {
                if (checkKey(asset)) {
                    if (updatedAssets.map(s => s.key).indexOf(asset.key) === -1) {
                        updatedAssets.push(asset);
                    } else {
                        errors.push(`Asset ${asset.key} already in asset list.`);
                    }
                } else {
                    errors.push(`Unknown asset ${asset.key}`);
                }
            });
            this.updateAssets({ selectedAssets: updatedAssets });
            if (errors.length) {
                this.setState({ error: errors.join(' - ') });
            } else {
                this.setState({ error: '' });
            }
        }
    }

    clearQueue() {
        return this.updateAssets({ selectedAssets: [] });
    }

    updateAssets(newState) {
        const { updateAssets } = this.props;
        updateAssets(newState);
    }

    playRuv(key) {
        return () => {
            const { renderAsset } = this.props;
            renderAsset(<Asset
                asset={{ key, type: assetTypes.RUV }}
            />);
        };
    }

    pause() {
        this.setState({ playing: false });
    }

    requestRemoval() {
        const { playing } = this.state;
        if (playing) {
            this.showNextAsset();
        }
    }

    showNextAsset() {
        const {
            assets: {
                cycle, selectedAssets, imageSeconds, autoPlay,
            },
            renderAsset,
        } = this.props;
        if (!selectedAssets.length) {
            this.pause();
            renderAsset(null);
        } else {
            const nextAsset = this.deleteNextAsset();
            renderAsset(<Asset
                asset={nextAsset}
                remove={this.requestRemoval}
                time={autoPlay ? imageSeconds : null}
            />);
            if (autoPlay) {
                this.setState({ playing: true });
            }
            if (cycle) {
                this.updateAssets({ selectedAssets: [...selectedAssets, nextAsset] });
            }
        }
    }

    deleteNextAsset() {
        const { assets: { selectedAssets } } = this.props;
        const asset = selectedAssets.shift();
        this.updateAssets({ selectedAssets });
        return asset;
    }

    removeAsset(asset) {
        const { assets: { selectedAssets } } = this.props;
        const idx = selectedAssets.map(a => a.key).indexOf(asset.key);
        if (idx > -1) {
            const newAssets = [...selectedAssets];
            newAssets.splice(idx, 1);
            this.updateAssets({ selectedAssets: newAssets });
        }
    }

    renderNextAsset() {
        const { assets: { selectedAssets } } = this.props;
        return (
            <div>
                {selectedAssets.map(asset => (
                    <RemovableAsset
                        asset={asset}
                        remove={this.removeAsset}
                        key={asset.key}
                    >
                        <Asset asset={asset} thumbnail />
                    </RemovableAsset>
                ))}
            </div>
        );
    }

    renderError() {
        const { error } = this.state;
        if (error) {
            return <div>{error}</div>;
        }
        return null;
    }

    renderAssetController() {
        const {
            assets: {
                cycle, selectedAssets, imageSeconds, autoPlay,
            },
        } = this.props;
        const { playing } = this.state;
        return (
            <div>
                <div className="controls control-item">
                    <AssetSelector addAssetKey={this.addAssetKey}>
                        <option value="null">Myndir</option>
                        {Object
                            .keys(assetsImages)
                            .filter(key => selectedAssets.map(a => a.key).indexOf(key) === -1)
                            .map(key => ({ key, name: key.split('/')[key.split('/').length - 1] }))
                            .map(({ key, name }) => <option value={key} key={key}>{name}</option>)
                        }
                    </AssetSelector>
                    <span>
                        {selectedAssets.length}
                        {' '}
                        í biðröð
                    </span>
                    {selectedAssets.length
                        ? <button type="button" onClick={this.clearQueue}>Hreinsa biðröð</button>
                        : null
                    }
                    {playing ? <button type="button" onClick={this.pause}>Pause</button> : null}
                    {!playing && selectedAssets.length
                        ? <button type="button" onClick={this.showNextAsset}>Birta</button>
                        : null
                    }
                    <div>
                        <input
                            type="checkbox"
                            onChange={this.onAutoPlayChange}
                            checked={autoPlay}
                        />
                        Autoplay
                    </div>
                    <div>
                        <input
                            type="checkbox"
                            onChange={this.onCycleChange}
                            checked={cycle}
                        />
                        Loop
                    </div>
                    {autoPlay
                        && (
                            <div>
                                <input
                                    type="number"
                                    onChange={this.onImageSecondsChange}
                                    value={imageSeconds}
                                    style={{ width: '33px' }}
                                />
                                sek
                            </div>
                        )
                    }
                    <UrlController addAsset={this.addAssetKey} />
                    <button type="button" onClick={this.playRuv('ruv')}>RÚV</button>
                    <button type="button" onClick={this.playRuv('ruv2')}>RÚV 2</button>
                    {this.renderError()}
                </div>
                <div className="upcoming-assets">
                    {this.renderNextAsset()}
                </div>
            </div>
        );
    }

    render() {
        const { match, assetView, selectAssetView } = this.props;
        return (
            <div className="asset-controller">
                <div className="view-selector">
                    <button type="button" onClick={() => selectAssetView(ASSET_VIEWS.assets)}>
                        Biðröð
                    </button>
                    <button type="button" onClick={() => selectAssetView(ASSET_VIEWS.teams)}>
                        Lið
                    </button>
                </div>
                {assetView === ASSET_VIEWS.assets && this.renderAssetController()}
                {assetView === ASSET_VIEWS.teams && (
                    <TeamAssetController
                        addAssets={this.addMultipleAssets}
                        match={match}
                        updateTeams={this.updateTeams}
                        // TODO
                        controllerState={null}
                        previousView={() => setTimeout(
                            () => selectAssetView(ASSET_VIEWS.assets),
                            500,
                        )}
                    />
                )}
            </div>
        );
    }
}

const stateToProps = ({ controller: { assetView, assets }, match }) => ({
    assetView,
    match,
    assets,
});

const dispatchToProps = dispatch => bindActionCreators({
    selectAssetView: controllerActions.selectAssetView,
    updateAssets: controllerActions.updateAssets,
}, dispatch);

export default connect(stateToProps, dispatchToProps)(AssetController);
