import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';


const actions = {
    [ActionTypes.selectView]: view => ({ view }),
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
