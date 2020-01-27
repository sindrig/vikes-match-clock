import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';

const uuidv4 = () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0; // eslint-disable-line
    const v = c == 'x' ? r : (r & 0x3 | 0x8); // eslint-disable-line
    return v.toString(16);
});


const actions = {
    [ActionTypes.updateMatch]: partial => partial,
    [ActionTypes.addTimeout]: ({ team, penaltyLength }) => ({ team, key: uuidv4(), penaltyLength }),
    [ActionTypes.removePenalty]: key => ({ key }),
    [ActionTypes.pauseMatch]: options => ({ isHalfEnd: options && options.isHalfEnd }),
    [ActionTypes.setHalfStops]: halfStops => ({ halfStops }),
    [ActionTypes.updateHalfLength]: (currentValue, newValue) => ({ currentValue, newValue }),
    [ActionTypes.matchTimeout]: () => {},
    [ActionTypes.removeTimeout]: () => {},
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

actions.buzz = () => (dispatch) => {
    dispatch({ type: ActionTypes.buzz, payload: { on: true } });
    setTimeout(() => dispatch({ type: ActionTypes.buzz, payload: { on: false } }), 3000);
    return true;
};

export default actions;
