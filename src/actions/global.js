import { createAction } from 'redux-actions';
import ActionTypes from '../ActionTypes';
import { persistor } from '../store';


const actions = {
    [ActionTypes.clearState]: () => persistor.purge(),
};

Object.keys(actions).forEach((type) => {
    actions[type] = createAction(type, actions[type]);
});

export default actions;
