import React, { Component } from 'react';
import PropTypes from 'prop-types';

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

    onImageSecondsChange(event) {
        event.preventDefault();
        const { target: { value } } = event;
        this.updateState({ imageSeconds: value });
    }

    updateState(newState) {
        const {
            updateState, selectedAssets, cycle, imageSeconds,
        } = this.props;
        updateState({
            assets: {
                selectedAssets, cycle, imageSeconds, ...newState,
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
            renderAsset, cycle, selectedAssets, imageSeconds,
        } = this.props;
        const nextAsset = this.deleteNextAsset();
        renderAsset(assetKeyToComponent(nextAsset));
        this.setState({
            playing: true,
            playingTimeout: setTimeout(this.showNextAsset, imageSeconds * 1000),
        });
        if (cycle) {
            this.updateState({ selectedAssets: [...selectedAssets, nextAsset] });
        }
    }

    deleteNextAsset() {
        const { selectedAssets } = this.props;
        const asset = selectedAssets.shift();
        this.updateState({ selectedAssets });
        return asset;
    }

    clearCurrentAsset() {
        const { renderAsset } = this.props;
        renderAsset(null);
    }

    renderNextAsset() {
        const { selectedAssets } = this.props;
        return (
            <div>
                {selectedAssets.slice(0, 3).map(assetKeyToComponent)}
            </div>
        );
    }

    render() {
        const { selectedAssets, cycle, imageSeconds } = this.props;
        const { playing } = this.state;
        return (
            <div className="asset-controller">
                <div>
                    <select onChange={this.onAddAsset} value="null">
                        <option value="null">Bæta við asset</option>
                        {Object
                            .keys(assets)
                            .filter(key => selectedAssets.indexOf(key) === -1)
                            .map(key => <option value={key} key={key}>{key}</option>)
                        }
                    </select>
                    <button onClick={this.clearCurrentAsset}>Hreinsa</button>
                </div>
                <div className="upcoming-assets">
                    <span>{selectedAssets.length} í biðröð</span>
                    {playing ?
                        <button onClick={this.pause}>Pause</button> :
                        <button onClick={this.showNextAsset}>Birta</button>
                    }
                    <button onClick={this.deleteNextAsset}>Hætta við</button>
                    <input
                        type="checkbox"
                        onChange={this.onCycleChange}
                        checked={cycle}
                    />Loop
                    <input
                        type="number"
                        onChange={this.onImageSecondsChange}
                        value={imageSeconds}
                        style={{ width: '33px' }}
                    />sek
                    {this.renderNextAsset()}
                </div>
            </div>
        );
    }
}
