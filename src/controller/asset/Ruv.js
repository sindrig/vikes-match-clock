import React, { Component } from "react";
import { connect } from "react-redux";
import { bindActionCreators } from "redux";
import PropTypes from "prop-types";
import Hls from "hls.js";

import controllerActions from "../../actions/controller";
import { viewPortPropType } from "../../propTypes";

const DEFAULT_URLS = {
  ruv: "http://ruvruv-live.hls.adaptive.level3.net/ruv/ruv/index.m3u8",
  ruv2: "http://ruvruv-live.hls.adaptive.level3.net/ruv/ruv2/index.m3u8",
};

class Ruv extends Component {
  static propTypes = {
    thumbnail: PropTypes.bool,
    getRuvUrl: PropTypes.func.isRequired,
    channel: PropTypes.string.isRequired,
    vp: viewPortPropType.isRequired,
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

  // TODO: Can we get rid of this...?
  UNSAFE_componentWillMount() {
    this.updateStreamUrl();
  }

  componentDidUpdate(prevProps) {
    const { streamUrl } = this.state;
    const { channel } = this.props;
    if (prevProps.channel !== channel) {
      this.updateStreamUrl();
    } else if (this.video) {
      if (this.hls) {
        this.hls.destroy();
      }
      // TODO: Remove when new version of hls.js is live
      const hls = new Hls({ enableWorker: false });
      hls.loadSource(streamUrl);
      hls.attachMedia(this.video.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log("streamUrl", streamUrl, "parsed");
        console.log(this.video);
        console.log(this.video.current);
        console.log(this.video.current.play);
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
    getRuvUrl(channel)
      .then(({ value: { result } }) => {
        this.setState({ streamUrl: result[0] || DEFAULT_URLS[channel] });
      })
      .catch((e) => {
        console.log("e", e);
        this.setState({ streamUrl: DEFAULT_URLS[channel] });
      });
  }

  render() {
    const {
      thumbnail,
      vp: {
        style: { width, height },
      },
    } = this.props;
    if (thumbnail) {
      return <div>RÚV</div>;
    }
    return (
      <video
        ref={this.video}
        className="hls-player"
        width={width}
        height={height}
        preload="metadata"
        style={{
          backgroundColor: "black",
          verticalAlign: "middle",
        }}
      />
    );
  }
}

const dispatchToProps = (dispatch) =>
  bindActionCreators(
    {
      getRuvUrl: controllerActions.getRuvUrl,
    },
    dispatch
  );
const stateToProps = ({ view: { vp } }) => ({ vp });

export default connect(stateToProps, dispatchToProps)(Ruv);
