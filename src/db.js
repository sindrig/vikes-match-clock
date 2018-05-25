import { set, get, keys, clear } from 'idb-keyval';

export default class DB {
    constructor(defaultState) {
        this.getAllData = this.getAllData.bind(this);
        this.setAllData = this.setAllData.bind(this);
        this.clearAllData = this.clearAllData.bind(this);
        this.defaultState = defaultState;
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
                            set(key, this.defaultState[key]).then(() => console.log('Added key ', key));
                        }
                    });
                    return result;
                }));
    }

    setAllData(data) {
        return Promise.all(Object.keys(data).map(key => set(key, data[key])))
            .then(this.getAllData);
    }

    clearAllData = clear;
}
