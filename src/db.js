import { set, get, keys, clear } from './idb-keyval';

export default class DB {
    constructor(defaultState) {
        this.getAllData = this.getAllData.bind(this);
        this.setAllData = this.setAllData.bind(this);
        this.get = this.get.bind(this);
        this.set = this.set.bind(this);
        this.defaultState = defaultState;
        this.cache = {};
    }

    getAllData() {
        return keys().then(dbKeys =>
            Promise.all(dbKeys.map(key => get(key)))
                .then((values) => {
                    const result = {};
                    dbKeys.forEach((key, index) => { result[key] = values[index]; });
                    Object.keys(this.defaultState).forEach((key) => {
                        if (!result[key]) {
                            console.log('Missing key', key, '. Adding it from default');
                            result[key] = this.defaultState[key];
                            this.set(key, this.defaultState[key]).then(() => console.log('Added key ', key));
                        }
                    });
                    return result;
                }));
    }

    setAllData(data) {
        return Promise.all(Object.keys(data).map(key => this.set(key, data[key])))
            .then(this.getAllData);
    }

    get(key) {
        if (this.cache[key]) {
            return new Promise(resolve => resolve(this.cache[key]));
        }
        return get(key);
    }

    set(key, value) {
        console.trace();
        this.cache[key] = value;
        return set(key, value);
    }
    clear = clear;
}
