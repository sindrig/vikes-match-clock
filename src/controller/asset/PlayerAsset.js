import React, { Component } from 'react';
import PropTypes from 'prop-types';
import PlayerCard from './PlayerCard';

export default class PlayerAsset extends Component {
    static propTypes = {
        assetKey: PropTypes.string.isRequired,
        thumbnail: PropTypes.bool,
        asset: PropTypes.string.isRequired,
    };

    static defaultProps = {
        thumbnail: false,
    };

    state = {
        playerName: '',
        playerNumber: '',
    }

    static getDerivedStateFromProps(nextProps) {
        const { assetKey } = nextProps;
        const key = assetKey.replace('players/', '').split('.')[0];
        const parts = key.split(/[ ](.+)/);
        let playerNumber = parseInt(parts[0], 10);
        if (Number.isNaN(playerNumber)) {
            [playerNumber] = parts;
        }
        const playerName = parts[1].split('_').join(' ');

        return { playerName, playerNumber };
    }

    render() {
        const { assetKey, thumbnail, asset } = this.props;
        const { playerName, playerNumber } = this.state;
        return (
            <PlayerCard
                playerNumber={playerNumber}
                playerName={playerName}
                assetKey={assetKey}
                thumbnail={thumbnail}
            >
                <img src={asset} alt={assetKey} />
            </PlayerCard>
        );
        // return (
        //     <div className="asset-player-icon" key={assetKey} style={{ backgroundImage: `url(${backgroundImage})` }}>
        //         <img src={asset} alt={assetKey} />
        //         <span className="asset-player-number">{playerNumber}</span>
        //         <span className="asset-player-name" style={nameStyle}>{playerName}</span>
        //     </div>
        // );
    }
}
