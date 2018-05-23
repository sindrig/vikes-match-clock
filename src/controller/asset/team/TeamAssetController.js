import React, { Component } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import { RingLoader } from 'react-spinners';
import { matchPropType } from '../../../propTypes';
import clubIds from '../../../club-ids';


import lambda from '../../../lambda';
import Team, { Player } from './Team';

const awsConf = {
    region: lambda.region,
    credentials: new AWS.CognitoIdentityCredentials({
        IdentityPoolId: lambda.cognitoPoolId,
        RoleArn: lambda.cognitoRole,
        AccountId: lambda.accountId,
    }),
};
AWS.config.update(awsConf);

const ensureCredentials = () => new Promise((resolve, reject) => {
    if (!AWS.config.credentials || AWS.config.credentials.expired !== false) {
        AWS.config.credentials.get((err) => {
            if (err) {
                reject(err);
            } else {
                resolve(AWS.config.credentials);
            }
        });
    } else {
        resolve(AWS.config.credentials);
    }
});


export default class TeamAssetController extends Component {
    // TODO save state in localstorage
    static propTypes = {
        addAsset: PropTypes.func.isRequired,
        match: matchPropType.isRequired,
    };

    constructor(props) {
        super(props);
        this.state = {
            loading: false,
            error: '',
            homeTeam: [new Player({ name: '', number: 1, role: '' })],
            awayTeam: [new Player({ name: '', number: 1, role: '' })],
        };
        this.autoFill = this.autoFill.bind(this);
    }

    handleTeams(data) {
        const { match: { homeTeam, awayTeam } } = this.props;
        this.setState({
            homeTeam: data[clubIds[homeTeam]].map(p => new Player(p)),
            awayTeam: data[clubIds[awayTeam]].map(p => new Player(p)),
        });
    }

    autoFill() {
        const { match: { homeTeam, awayTeam } } = this.props;
        this.setState({ loading: true });
        ensureCredentials().then(() => {
            const fn = new AWS.Lambda({
                region: lambda.region,
                apiVersion: '2015-03-31',
            });
            const fnParams = {
                FunctionName: lambda.skyrslaFunction,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify({
                    homeTeam: clubIds[homeTeam],
                    awayTeam: clubIds[awayTeam],
                }),
            };
            fn.invoke(fnParams, (error, data) => {
                if (error) {
                    this.setState({ error });
                } else {
                    const json = JSON.parse(data.Payload);
                    if (json.error) {
                        this.setState({ error: json.error });
                    } else {
                        this.handleTeams(json);
                    }
                }
                this.setState({ loading: false });
            });
        });
    }

    render() {
        const {
            loading, error, homeTeam, awayTeam,
        } = this.state;
        return (
            <div className="team-asset-controller">
                <RingLoader loading={loading} />
                {!loading ? <button onClick={this.autoFill}>Sækja lið</button> : null}
                <span className="error">{error}</span>
                <div className="team-asset-controller-home-team">
                    <Team team={homeTeam} />
                </div>
                <div className="team-asset-controller-away-team">
                    <Team team={awayTeam} />
                </div>
            </div>
        );
    }
}
