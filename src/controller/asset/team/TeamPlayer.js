import React from 'react';
import PropTypes from 'prop-types';
import { playerPropType } from '../../../propTypes';

const handler = (onChange, attr, event) => {
    event.preventDefault();
    const { target: { value } } = event;
    let newValue = value;
    if (attr === 'number') {
        newValue = parseInt(value, 10);
        if (Number.isNaN(newValue)) {
            return;
        }
    }
    onChange({ [attr]: newValue });
};

const TeamPlayer = ({ player, onChange }) => (
    <div className="team-player">
        <input
            type="checkbox"
            checked={player.show || false}
            onChange={() => onChange({ show: !player.show })}
            className="team-player-show"
        />
        <input
            type="text"
            value={player.number || ''}
            onChange={e => handler(onChange, 'number', e)}
            className="team-player-number"
        />
        <input
            type="text"
            value={player.name || ''}
            onChange={e => handler(onChange, 'name', e)}
            className="team-player-name"
        />
        {false && <input
            type="text"
            value={player.role || ''}
            onChange={e => handler(onChange, 'role', e)}
            className="team-player-role"
        />}
    </div>
);

TeamPlayer.propTypes = {
    player: playerPropType.isRequired,
    onChange: PropTypes.func.isRequired,
};

export default TeamPlayer;
