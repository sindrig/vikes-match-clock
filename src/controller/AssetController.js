import React, { Component } from 'react';
import PropTypes from 'prop-types';

import RemovableAsset from './RemovableAsset';
import * as assets from '../assets';
import './AssetController.css';

// TODO more types?
const assetKeyToComponent = key => <img src={assets[key]} alt={key} key={key} />;

export default class AssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        renderAsset: PropTypes.func.isRequired,
        updateState: PropTypes.func.isRequired,
        selectedAssets: PropTypes.arrayOf(PropTypes.string).isRequired,
        cycle: PropTypes.bool.isRequired,
        autoPlay: PropTypes.bool.isRequired,
        imageSeconds: PropTypes.number.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            playing: false,
            playingTimeout: null,
        };
        this.onAddAsset = this.onAddAsset.bind(this);
        this.deleteNextAsset = this.deleteNextAsset.bind(this);
        this.showNextAsset = this.showNextAsset.bind(this);
        this.clearCurrentAsset = this.clearCurrentAsset.bind(this);
        this.onCycleChange = this.onCycleChange.bind(this);
        this.onAutoPlayChange = this.onAutoPlayChange.bind(this);
        this.onImageSecondsChange = this.onImageSecondsChange.bind(this);
        this.pause = this.pause.bind(this);
    }

    onAddAsset(event) {
        event.preventDefault();
        const { target: { value } } = event;
        const { selectedAssets } = this.props;
        this.updateState({ selectedAssets: [...selectedAssets, value] });
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

    updateState(newState) {
        const {
            updateState, selectedAssets, cycle, imageSeconds, autoPlay,
        } = this.props;
        updateState({
            assets: {
                selectedAssets, cycle, imageSeconds, autoPlay, ...newState,
            },
        });
    }

    pause() {
        const { playingTimeout } = this.state;
        clearTimeout(playingTimeout);
        this.setState({ playing: false, playingTimeout: null });
    }

    showNextAsset() {
        const {
            renderAsset, cycle, selectedAssets, imageSeconds, autoPlay,
        } = this.props;
        if (!selectedAssets.length) {
            this.pause();
            this.clearCurrentAsset();
        } else {
            const nextAsset = this.deleteNextAsset();
            renderAsset(assetKeyToComponent(nextAsset));
            if (autoPlay) {
                this.setState({
                    playing: true,
                    playingTimeout: setTimeout(this.showNextAsset, imageSeconds * 1000),
                });
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

    clearCurrentAsset() {
        const { renderAsset } = this.props;
        renderAsset(null);
    }

    renderNextAsset() {
        const { selectedAssets } = this.props;
        return (
            <div>
                {selectedAssets.map(key => (
                    <RemovableAsset remove={this.removeAsset(key)} key={key}>
                        {assetKeyToComponent(key)}
                        <span>{key}</span>
                    </RemovableAsset>
                ))}
            </div>
        );
    }

    render() {
        const {
            selectedAssets, cycle, imageSeconds, autoPlay,
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
                    <button onClick={this.clearCurrentAsset}>Hreinsa núverandi mynd</button>
                    <span>{selectedAssets.length} í biðröð</span>
                    {playing ?
                        <button onClick={this.pause}>Pause</button> :
                        <button onClick={this.showNextAsset}>Birta</button>
                    }
                    <button onClick={this.deleteNextAsset}>Hætta við</button>
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
                </div>
                <div className="upcoming-assets">
                    {this.renderNextAsset()}
                </div>
            </div>
        );
    }
}
