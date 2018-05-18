import React from 'react';
import PropTypes from 'prop-types';


const Controller = ({ update, match, changeBackground }) => {
    const action = (attr, fn) => () => update({ ...match, [attr]: fn(match[attr]) });
    return (
        <div className="controller">
            <div>
                <button onClick={action('homeScore', x => x + 1)}>Heima +1</button>
                <button onClick={action('homeScore', x => x - 1)}>Heima -1</button>
            </div>
            <div>
                <button onClick={action('awayScore', x => x + 1)}>Úti +1</button>
                <button onClick={action('awayScore', x => x - 1)}>Úti -1</button>
            </div>
            <div>
                <button onClick={action('started', () => Date.now())} disabled={!!match.started}>Byrja</button>
                <button onClick={action('started', () => null)}>Núllstilla klukku</button>
            </div>
            <div>
                <button onClick={action('started', x => x - (60 * 1000))}>Klukka +1 mín</button>
                <button onClick={action('started', x => x + (60 * 1000))}>Klukka -1 mín</button>
            </div>
            <div>
                <button onClick={action('started', x => x - (5 * 1000))}>Klukka +5 sek</button>
                <button onClick={action('started', x => x + (5 * 1000))}>Klukka -5 sek</button>
            </div>
            <div>
                <button onClick={changeBackground}>Breyta bakgrunni</button>
            </div>
        </div>
    );
};

Controller.propTypes = {
    update: PropTypes.func.isRequired,
    changeBackground: PropTypes.func.isRequired,
    match: PropTypes.shape({
        homeScore: PropTypes.number,
        awayScore: PropTypes.number,
        started: PropTypes.number,
    }).isRequired,
};

export default Controller;
