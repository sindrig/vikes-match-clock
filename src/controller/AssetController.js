import React, { Component } from 'react';
import PropTypes from 'prop-types';

import RemovableAsset from './RemovableAsset';
import Asset, { checkKey } from './Asset';
import { fillStarting } from '../api';
import * as assets from '../assets';
import './AssetController.css';

export default class AssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        renderAsset: PropTypes.func.isRequired,
        updateState: PropTypes.func.isRequired,
        selectedAssets: PropTypes.arrayOf(PropTypes.string).isRequired,
        cycle: PropTypes.bool.isRequired,
        autoPlay: PropTypes.bool.isRequired,
        imageSeconds: PropTypes.number.isRequired,
        freeTextAsset: PropTypes.string.isRequired,
        currentView: PropTypes.oneOf(['MATCH', 'IDLE']).isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            playing: false,
            error: '',
        };
        this.onAddAsset = this.onAddAsset.bind(this);
        this.deleteNextAsset = this.deleteNextAsset.bind(this);
        this.showNextAsset = this.showNextAsset.bind(this);
        this.onCycleChange = this.onCycleChange.bind(this);
        this.onAutoPlayChange = this.onAutoPlayChange.bind(this);
        this.onImageSecondsChange = this.onImageSecondsChange.bind(this);
        this.pause = this.pause.bind(this);
        this.onTextChange = this.onTextChange.bind(this);
        this.addUrlAsset = this.addUrlAsset.bind(this);
    }

    onCycleChange() {
        const { cycle } = this.props;
        this.updateState({ cycle: !cycle });
    }

    onAutoPlayChange() {
        const { autoPlay } = this.props;
        this.updateState({ autoPlay: !autoPlay });
        if (!autoPlay) {
            this.pause();
        }
    }

    onImageSecondsChange(event) {
        event.preventDefault();
        const { target: { value } } = event;
        this.updateState({ imageSeconds: Math.max(parseInt(value, 10), 1) });
    }

    onTextChange(event) {
        event.preventDefault();
        const { target: { value } } = event;
        this.updateState({ freeTextAsset: value });
    }


    onAddAsset(event) {
        event.preventDefault();
        const { target: { value } } = event;
        return this.addAssetKey(value);
    }

    addUrlAsset() {
        const { freeTextAsset } = this.props;
        return this.addAssetKey(freeTextAsset, { freeTextAsset: '' });
    }

    addAssetKey(key, extra = {}) {
        if (checkKey(key)) {
            const { selectedAssets } = this.props;
            if (selectedAssets.indexOf(key) === -1) {
                this.setState({ error: '' });
                this.updateState({ selectedAssets: [...selectedAssets, key], ...extra });
            } else {
                this.setState({ error: `Key ${key} already in asset list.` });
            }
        } else {
            this.setState({ error: `Unknown key ${key}` });
        }
    }

    updateState(newState) {
        const {
            updateState, selectedAssets, cycle, imageSeconds, autoPlay, freeTextAsset,
        } = this.props;
        updateState({
            assets: {
                selectedAssets, cycle, imageSeconds, autoPlay, freeTextAsset, ...newState,
            },
        });
    }

    pause() {
        this.setState({ playing: false });
    }

    showNextAsset() {
        const {
            renderAsset, cycle, selectedAssets, imageSeconds, autoPlay,
        } = this.props;
        if (!selectedAssets.length) {
            this.pause();
            renderAsset(null);
        } else {
            const nextAsset = this.deleteNextAsset();
            renderAsset(<Asset
                assetKey={nextAsset}
                remove={this.showNextAsset}
                time={autoPlay ? imageSeconds : null}
            />);
            if (autoPlay) {
                this.setState({ playing: true });
            }
            if (cycle) {
                this.updateState({ selectedAssets: [...selectedAssets, nextAsset] });
            }
        }
    }

    deleteNextAsset() {
        const { selectedAssets } = this.props;
        const asset = selectedAssets.shift();
        this.updateState({ selectedAssets });
        return asset;
    }

    removeAsset(key) {
        return () => {
            const { selectedAssets } = this.props;
            const idx = selectedAssets.indexOf(key);
            if (idx > -1) {
                const newAssets = [...selectedAssets];
                newAssets.splice(idx, 1);
                this.updateState({ selectedAssets: newAssets });
            }
        };
    }

    renderNextAsset() {
        const { selectedAssets } = this.props;
        return (
            <div>
                {selectedAssets.map(key => (
                    <RemovableAsset remove={this.removeAsset(key)} key={key}>
                        <Asset assetKey={key} thumbnail />
                        <span>{key}</span>
                    </RemovableAsset>
                ))}
            </div>
        );
    }

    renderError() {
        const { error } = this.state;
        if (error) {
            return error;
        }
        return null;
    }

    render() {
        const {
            selectedAssets, cycle, imageSeconds, autoPlay, freeTextAsset,
            currentView,
        } = this.props;
        const { playing } = this.state;
        return (
            <div className="asset-controller">
                <div className="controls">
                    <select onChange={this.onAddAsset} value="null">
                        <option value="null">Bæta í röð</option>
                        {Object
                            .keys(assets)
                            .filter(key => selectedAssets.indexOf(key) === -1)
                            .map(key => <option value={key} key={key}>{key}</option>)
                        }
                    </select>
                    <span>{selectedAssets.length} í biðröð</span>
                    {playing ? <button onClick={this.pause}>Pause</button> : null}
                    {!playing && selectedAssets.length ?
                        <button onClick={this.showNextAsset}>Birta</button> :
                        null
                    }
                    {currentView === 'MATCH' ?
                        <button onClick={fillStarting}>Sækja byrjunarlið</button> :
                        null
                    }
                    <div>
                        <input
                            type="checkbox"
                            onChange={this.onAutoPlayChange}
                            checked={autoPlay}
                        />Autoplay
                    </div>
                    {autoPlay &&
                        <div>
                            <input
                                type="checkbox"
                                onChange={this.onCycleChange}
                                checked={cycle}
                            />Loop
                        </div>
                    }
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
}
