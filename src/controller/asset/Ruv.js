import React, { Component } from 'react';
import { connect } from 'react-redux';
import { bindActionCreators } from 'redux';
import PropTypes from 'prop-types';
import Hls from 'hls.js';

import controllerActions from '../../actions/controller';

const DEFAULT_URL = 'http://ruvruv-live.hls.adaptive.level3.net/ruv/ruv/index.m3u8';

class Ruv extends Component {
    static propTypes = {
        thumbnail: PropTypes.bool,
        getRuvUrl: PropTypes.func.isRequired,
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
        const { getRuvUrl } = this.props;
        getRuvUrl().then(({ value: { data: { result } } }) => {
            this.setState({ streamUrl: result[0] });
        }).catch(() => {
            this.setState({ streamUrl: DEFAULT_URL });
        });
    }

    componentDidUpdate() {
        console.log('this.video', this.video);
        const { streamUrl } = this.state;
        if (this.video) {
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
