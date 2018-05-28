import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';
import { initialState } from '../reducers/match';


const actions = {
    [ActionTypes.updateMatch]: (partial) => {
        console.log('partial', partial);
        console.log('initialState', initialState);
        return { ...initialState, ...partial };
    },
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
