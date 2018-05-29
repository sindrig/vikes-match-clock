import { get, set, del } from '../lib/idb-keyval';

export default {
    getItem: get,
    setItem: set,
    removeItem: del,
};
