import React, { Component } from 'react';
import PropTypes from 'prop-types';
import AWS from 'aws-sdk';
import { RingLoader } from 'react-spinners';
import { matchPropType } from '../../propTypes';


import lambda from '../../lambda';
import * as assets from '../../assets';

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

const comparableName = name => name.replace('.').toLowerCase();
const nameComp = (n1, n2) => comparableName(n1) === comparableName(n2);


export default class AutoFiller extends Component {
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
        };
        this.autoFill = this.autoFill.bind(this);
    }

    handleTeams(data) {
        const { match, addAsset } = this.props;
         
    }

    autoFill() {
        this.setState({ loading: true });
        ensureCredentials().then(() => {
            const fn = new AWS.Lambda({
                region: lambda.region,
                apiVersion: '2015-03-31',
            });
            const fnParams = {
                FunctionName: lambda.skyrslaFunction,
                InvocationType: 'RequestResponse',
                Payload: JSON.stringify({ matchId: '427941' }),
            };
            fn.invoke(fnParams, (error, data) => {
                if (error) {
                    this.setState({ error });
                } else {
                    const json = JSON.parse(data.Payload);
                    this.handleTeams(json);
                }
                this.setState({ loading: false });
            });
        });
    }

    render() {
        const { loading, error } = this.state;
        return (
            <div className="auto-filler">
                <RingLoader loading={loading} />
                {!loading ? <button onClick={this.autoFill}>Sækja lið</button> : null}
                <span className="error">{error}</span>
            </div>
        );
    }
}
