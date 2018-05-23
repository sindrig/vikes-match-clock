import React, { Component } from 'react';
import PropTypes from 'prop-types';

export class Player {
    constructor({ name, number, role }) {
        this.name = name;
        this.number = number;
        this.role = role;
        this.position = null;
    }
}

export default class Team extends Component {
    static propTypes = {
        team: PropTypes.arrayOf(Player),
    };


    render() {
        const { team } = this.props;
        return (
            <div className="team-asset-container">
                {team.map(p => <div>{p.name}</div>)}
            </div>
        );
    }
}
