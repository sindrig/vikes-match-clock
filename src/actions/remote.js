import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';


const actions = {
    [ActionTypes.setEmail]: email => ({ email }),
    [ActionTypes.setPassword]: password => ({ password }),
    [ActionTypes.setSync]: sync => ({ sync }),
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
