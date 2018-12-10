import axios from 'axios';

const options = {
    params: {
        stations: '1',
        time: '1h',
        anytime: '1',
    },
};

export const getTemp = () =>
    axios.get('https://apis.is/weather/observations/en', options)
        .then(({
            data: { results },
        }) => {
            const temperature = Math.ceil(parseFloat(results[0].T));
            if (!Number.isNaN(temperature)) {
                return temperature;
            }
            console.log('Received strange temperature:', results, results[0].T);
            return null;
        });

export default getTemp;
