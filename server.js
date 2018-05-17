const express = require('express');

const app = express();
const port = process.env.PORT || 5000;

const bodyParser = require('body-parser');
app.use(bodyParser.json());

let match = {
    homeScore: 0,
    awayScore: 0,
    started: null,
};

app.post('/api/match/', (req, res) => {
    match = {
        started: Date.now(),
        homeScore: 0,
        awayScore: 0,
    };
    res.send({ match });
});

app.get('/api/match/', (req, res) => {
    return res.send({ match });
});

const getScore = (attr, body) => {
    if (body[attr] === undefined) {
        return match[attr];
    }else if (body[attr] < 0) {
        return 0
    }
    return body[attr];
}

app.put('/api/match/', (req, res) => {
    match.homeScore = getScore('homeScore', req.body);
    match.awayScore = getScore('awayScore', req.body);
    return res.send({ match });

});

app.listen(port, () => console.log(`Listening on port ${port}`));
