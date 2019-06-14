import { get, set, remove } from '../lib/idb-keyval';

export default {
    getItem: get,
    setItem: set,
    // Receives a `warnIfRemove` fn as 2nd variable, not using.
    removeItem: key => remove(key),
};
