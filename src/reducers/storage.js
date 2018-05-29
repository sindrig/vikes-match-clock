import { get, set, del } from '../lib/idb-keyval';

export default {
    getItem: get,
    setItem: set,
    removeItem: del,
};

export const getItem = get;

export const setItem = set;

export const removeItem = del;
