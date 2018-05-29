import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';


const actions = {
    [ActionTypes.updateMatch]: partial => partial,
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
