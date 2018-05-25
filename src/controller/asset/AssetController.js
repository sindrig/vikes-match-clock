import React, { Component } from 'react';
import PropTypes from 'prop-types';
import { matchPropType, controllerPropType } from '../../propTypes';

import RemovableAsset from './RemovableAsset';
import AssetSelector from './AssetSelector';
import assetTypes from './AssetTypes';
import Asset, { checkKey } from './Asset';
import * as assets from '../../assets';
import TeamAssetController from './team/TeamAssetController';
import './AssetController.css';

const ASSET_VIEWS = {
    assets: 'assets',
    team: 'team',
};

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
            assetView: ASSET_VIEWS.assets,
        };
        this.deleteNextAsset = this.deleteNextAsset.bind(this);
        this.showNextAsset = this.showNextAsset.bind(this);
        this.onCycleChange = this.onCycleChange.bind(this);
        this.onAutoPlayChange = this.onAutoPlayChange.bind(this);
        this.onImageSecondsChange = this.onImageSecondsChange.bind(this);
        this.pause = this.pause.bind(this);
        this.onTextChange = this.onTextChange.bind(this);
        this.addUrlAsset = this.addUrlAsset.bind(this);
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

    onTextChange(event) {
        event.preventDefault();
        const { target: { value } } = event;
        this.updateAssets({ freeTextAsset: value });
    }


    addUrlAsset() {
        const { state: { assets: { freeTextAsset } } } = this.props;
        return this.addAssetKey({ type: assetTypes.URL, key: freeTextAsset }, { freeTextAsset: '' });
    }

    addAssetKey(key, extra = {}) {
        return this.addMultipleAssets([key], extra);
    }

    addMultipleAssets(assetKeys, extra = {}) {
        const { state: { assets: { selectedAssets } } } = this.props;
        const updatedAssets = [...selectedAssets];
        const errors = [];
        assetKeys.forEach((key) => {
            if (checkKey(key)) {
                if (selectedAssets.indexOf(key) === -1) {
                    updatedAssets.push(key);
                } else {
                    errors.push(`Key ${key} already in asset list.`);
                }
            } else {
                errors.push(`Unknown key ${key}`);
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
                    selectedAssets, cycle, imageSeconds, autoPlay, freeTextAsset,
                },
            },
            updateState,
        } = this.props;
        updateState({
            assets: {
                selectedAssets, cycle, imageSeconds, autoPlay, freeTextAsset, ...newState,
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
                    cycle, selectedAssets, imageSeconds, autoPlay, freeTextAsset,
                },
            },
        } = this.props;
        const { playing } = this.state;
        return (
            <div>
                <div className="controls">
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
                    Url: <input
                        type="text"
                        onChange={this.onTextChange}
                        value={freeTextAsset}
                        style={{ width: '95px' }}
                    />
                    <button onClick={this.addUrlAsset}>Bæta við</button>
                    {this.renderError()}
                </div>
                <div className="upcoming-assets">
                    {this.renderNextAsset()}
                </div>
            </div>
        );
    }

    render() {
        const { match, state } = this.props;
        const { assetView } = this.state;
        return (
            <div className="asset-controller">
                <div className="view-selector">
                    <button onClick={() => this.setState({ assetView: ASSET_VIEWS.assets })}>
                        Biðröð
                    </button>
                    <button onClick={() => this.setState({ assetView: ASSET_VIEWS.teams })}>
                        Lið
                    </button>
                </div>
                {assetView === ASSET_VIEWS.assets && this.renderAssetController()}
                {assetView === ASSET_VIEWS.teams && (
                    <TeamAssetController
                        addAssets={this.addMultipleAssets}
                        match={match}
                        updateTeams={this.updateTeams}
                        controllerState={state}
                        previousView={() => this.setState({ assetView: ASSET_VIEWS.assets })}
                    />
                )}
            </div>
        );
    }
}
