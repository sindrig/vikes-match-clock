import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { matchPropType, controllerPropType } from '../../propTypes';

import RemovableAsset from './RemovableAsset';
import AssetSelector from './AssetSelector';
import Asset, { checkKey } from './Asset';
import * as assets from '../../assets';
import TeamAssetController from './team/TeamAssetController';
import UrlController from './UrlController';
import { ASSET_VIEWS } from '../../api';
import './AssetController.css';

export default class AssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        renderAsset: PropTypes.func.isRequired,
        updateState: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
        state: controllerPropType.isRequired,
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
        this.updateTeams = this.updateTeams.bind(this);
        this.addMultipleAssets = this.addMultipleAssets.bind(this);
        this.clearQueue = this.clearQueue.bind(this);
        this.addAssetKey = this.addAssetKey.bind(this);
        this.removeAsset = this.removeAsset.bind(this);
    }

    onCycleChange() {
        const { state: { assets: { cycle } } } = this.props;
        this.updateAssets({ cycle: !cycle });
    }

    onAutoPlayChange() {
        const { state: { assets: { autoPlay } } } = this.props;
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

    addAssetKey(key, extra = {}) {
        return this.addMultipleAssets([key], extra);
    }

    addMultipleAssets(assetList, extra = {}) {
        if (Object.keys(extra).length) {
            console.error('Someone is using extra... ', extra);
        }
        const { state: { assets: { selectedAssets } } } = this.props;
        const updatedAssets = [...selectedAssets];
        const errors = [];
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
        this.updateAssets({ selectedAssets: updatedAssets, ...extra });
        if (errors.length) {
            this.setState({ error: errors.join(' - ') });
        } else {
            this.setState({ error: '' });
        }
    }

    clearQueue() {
        return this.updateAssets({ selectedAssets: [] });
    }

    updateAssets(newState) {
        const {
            state: {
                assets: {
                    selectedAssets, cycle, imageSeconds, autoPlay,
                },
            },
            updateState,
        } = this.props;
        updateState({
            assets: {
                selectedAssets, cycle, imageSeconds, autoPlay, ...newState,
            },
        });
    }

    updateTeams(newState) {
        const {
            state: {
                teamPlayers,
            },
            updateState,
        } = this.props;
        updateState({
            teamPlayers: { ...teamPlayers, ...newState },
        });
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
            state: {
                assets: {
                    cycle, selectedAssets, imageSeconds, autoPlay,
                },
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
        const { state: { assets: { selectedAssets } } } = this.props;
        const asset = selectedAssets.shift();
        this.updateAssets({ selectedAssets });
        return asset;
    }

    removeAsset(asset) {
        const { state: { assets: { selectedAssets } } } = this.props;
        const idx = selectedAssets.map(a => a.key).indexOf(asset.key);
        if (idx > -1) {
            const newAssets = [...selectedAssets];
            newAssets.splice(idx, 1);
            this.updateAssets({ selectedAssets: newAssets });
        }
    }

    renderNextAsset() {
        const { state: { assets: { selectedAssets } } } = this.props;
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
            state: {
                assets: {
                    cycle, selectedAssets, imageSeconds, autoPlay,
                },
            },
        } = this.props;
        const { playing } = this.state;
        return (
            <div>
                <div className="controls control-item">
                    <AssetSelector addAssetKey={this.addAssetKey}>
                        <option value="null">Myndir</option>
                        {Object
                            .keys(assets)
                            .filter(key => selectedAssets.map(a => a.key).indexOf(key) === -1)
                            .map(key => ({ key, name: key.split('/')[key.split('/').length - 1] }))
                            .map(({ key, name }) => <option value={key} key={key}>{name}</option>)
                        }
                    </AssetSelector>
                    <span>{selectedAssets.length} í biðröð</span>
                    {selectedAssets.length ?
                        <button onClick={this.clearQueue}>Hreinsa biðröð</button> :
                        null
                    }
                    {playing ? <button onClick={this.pause}>Pause</button> : null}
                    {!playing && selectedAssets.length ?
                        <button onClick={this.showNextAsset}>Birta</button> :
                        null
                    }
                    <div>
                        <input
                            type="checkbox"
                            onChange={this.onAutoPlayChange}
                            checked={autoPlay}
                        />Autoplay
                    </div>
                    <div>
                        <input
                            type="checkbox"
                            onChange={this.onCycleChange}
                            checked={cycle}
                        />Loop
                    </div>
                    {autoPlay &&
                        <div>
                            <input
                                type="number"
                                onChange={this.onImageSecondsChange}
                                value={imageSeconds}
                                style={{ width: '33px' }}
                            />sek
                        </div>
                    }
                    <UrlController addAsset={this.addAssetKey} />
                    {this.renderError()}
                </div>
                <div className="upcoming-assets">
                    {this.renderNextAsset()}
                </div>
            </div>
        );
    }

    render() {
        const { match, state, updateState } = this.props;
        return (
            <div className="asset-controller">
                <div className="view-selector">
                    <button onClick={() => updateState({ assetView: ASSET_VIEWS.assets })}>
                        Biðröð
                    </button>
                    <button onClick={() => updateState({ assetView: ASSET_VIEWS.teams })}>
                        Lið
                    </button>
                </div>
                {state.assetView === ASSET_VIEWS.assets && this.renderAssetController()}
                {state.assetView === ASSET_VIEWS.teams && (
                    <TeamAssetController
                        addAssets={this.addMultipleAssets}
                        match={match}
                        updateTeams={this.updateTeams}
                        controllerState={state}
                        previousView={() => setTimeout(() => updateState({
                            assetView: ASSET_VIEWS.assets,
                        }), 500)}
                    />
                )}
            </div>
        );
    }
}
