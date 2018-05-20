import React, { Component } from 'react';
import PropTypes from 'prop-types';

import * as assets from '../assets';

// TODO more types?
const assetKeyToComponent = (key) => <img src={assets[key]} alt={key} />;

export default class AssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        renderAsset: PropTypes.func.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            selectedAssets: [],
        };
        this.addAsset = this.addAsset.bind(this);
        this.deleteNextAsset = this.deleteNextAsset.bind(this);
        this.showNextAsset = this.showNextAsset.bind(this);
    }

    addAsset(event) {
        event.preventDefault();
        const { target: { value } } = event;
        const { selectedAssets } = this.state;
        selectedAssets.push(value);
        this.setState({ selectedAssets });
    }

    showNextAsset() {
        const { renderAsset } = this.props;
        renderAsset(assetKeyToComponent(this.deleteNextAsset()));
    }

    deleteNextAsset() {
        const { selectedAssets } = this.state;
        const asset = selectedAssets.shift();
        this.setState({ selectedAssets });
        return asset;
    }

    renderNextAsset() {
        const { selectedAssets } = this.state;
        const nextAsset = selectedAssets[0];
        return assetKeyToComponent(nextAsset);
    }

    render() {
        const { selectedAssets } = this.state;
        return (
            <div className="asset-controller">
                <div>
                    <select onChange={this.addAsset} value="null">
                        <option value="null">Bæta við asset</option>
                        {Object.keys(assets).map(key => (
                            <option value={key} key={key}>{key}</option>
                        ))}
                    </select>
                </div>
                {selectedAssets.length ? (
                    <div className="upcoming-assets">
                        <span>{selectedAssets.length} í biðröð</span>
                        <button onClick={this.showNextAsset}>Birta</button>
                        <button onClick={this.deleteNextAsset}>Hætta við</button>
                        {this.renderNextAsset()}
                    </div>
                ) : null}
            </div>
        )
    }
}
