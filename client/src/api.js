import axios from 'axios';

export default {
    getMatch: () => axios.get('/api/match/'),
    startMatch: () => axios.post('/api/match/'),
    updateScore: ({ homeScore, awayScore }) => axios.put('/api/match/', { homeScore, awayScore }),
};
