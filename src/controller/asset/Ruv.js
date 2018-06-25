import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import Hls from 'hls.js';

import controllerActions from '../../actions/controller';

const DEFAULT_URLS = {
    ruv: 'http://ruvruv-live.hls.adaptive.level3.net/ruv/ruv/index.m3u8',
    ruv2: 'http://ruvruv-live.hls.adaptive.level3.net/ruv/ruv2/index.m3u8',
};

class Ruv extends Component {
    static propTypes = {
        thumbnail: PropTypes.bool,
        getRuvUrl: PropTypes.func.isRequired,
        channel: PropTypes.string.isRequired,
    };

    static defaultProps = {
        thumbnail: false,
    };

    constructor(props) {
        super(props);
        this.state = {
            streamUrl: null,
        };
        this.video = React.createRef();
        this.hls = null;
    }

    componentWillMount() {
        this.updateStreamUrl();
    }

    componentDidUpdate(prevProps) {
        console.log('this.video', this.video);
        const { streamUrl } = this.state;
        if (prevProps.channel !== this.props.channel) {
            this.updateStreamUrl();
        } else if (this.video) {
            if (this.hls) {
                this.hls.destroy();
            }
            const hls = new Hls();
            hls.loadSource(streamUrl);
            hls.attachMedia(this.video.current);
            hls.on(Hls.Events.MANIFEST_PARSED, () => {
                console.log('streamUrl', streamUrl, 'parsed');
                this.video.current.play();
            });

            this.hls = hls;
        }
    }

    componentWillUnmount() {
        if (this.hls) {
            this.hls.destroy();
        }
    }

    updateStreamUrl() {
        const { getRuvUrl, channel } = this.props;
        getRuvUrl(channel).then(({ value: { result } }) => {
            this.setState({ streamUrl: result[0] || DEFAULT_URLS[channel] });
        }).catch((e) => {
            console.log('e', e);
            this.setState({ streamUrl: DEFAULT_URLS[channel] });
        });
    }

    render() {
        const { thumbnail } = this.props;
        if (thumbnail) {
            return <div>RÚV</div>;
        }
        return (
            <video
                ref={this.video}
                className="hls-player"
                width={240}
                height={176}
                preload="metadata"
                style={{
                    backgroundColor: 'black',
                    verticalAlign: 'middle',
                }}
            />
        );
    }
}

const dispatchToProps = dispatch => bindActionCreators({
    getRuvUrl: controllerActions.getRuvUrl,
}, dispatch);

export default connect(null, dispatchToProps)(Ruv);
