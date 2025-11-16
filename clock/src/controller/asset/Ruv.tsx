import { Component, RefObject, createRef } from "react";
import { connect, ConnectedProps } from "react-redux";
import { bindActionCreators, Dispatch } from "redux";
import Hls from "hls.js";

import controllerActions from "../../actions/controller";
import { RootState } from "../../types";

const DEFAULT_URLS: Record<string, string> = {
  ruv: `${window.location.protocol}//ruvruv-live.hls.adaptive.level3.net/ruv/ruv/index.m3u8`,
  ruv2: `${window.location.protocol}//ruvruv-live.hls.adaptive.level3.net/ruv/ruv2/index.m3u8`,
};

interface OwnProps {
  thumbnail?: boolean;
  channel: string;
}

const mapStateToProps = ({ view: { vp } }: RootState) => ({ vp });

const mapDispatchToProps = (dispatch: Dispatch) =>
  bindActionCreators(
    {
      getRuvUrl: controllerActions.getRuvUrl,
    },
    dispatch,
  );

const connector = connect(mapStateToProps, mapDispatchToProps);

type PropsFromRedux = ConnectedProps<typeof connector>;

type Props = PropsFromRedux & OwnProps;

interface State {
  streamUrl: string | null;
}

class Ruv extends Component<Props, State> {
  video: RefObject<HTMLVideoElement | null>;
  hls: Hls | null;

  constructor(props: Props) {
    super(props);
    this.state = {
      streamUrl: null,
    };
    this.video = createRef<HTMLVideoElement>();
    this.hls = null;
  }

  // TODO: Can we get rid of this...?
  UNSAFE_componentWillMount(): void {
    this.updateStreamUrl();
  }

  componentDidUpdate(prevProps: Props): void {
    const { streamUrl } = this.state;
    const { channel } = this.props;
    if (prevProps.channel !== channel) {
      this.updateStreamUrl();
    } else if (this.video.current && streamUrl) {
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
        console.log(this.video.current?.play);
        this.video.current?.play();
      });

      this.hls = hls;
    }
  }

  componentWillUnmount(): void {
    if (this.hls) {
      this.hls.destroy();
    }
  }

  updateStreamUrl(): void {
    const { getRuvUrl, channel } = this.props;
    getRuvUrl(channel)
      .then(({ value: { result } }: any) => {
        this.setState({ streamUrl: result[0] || DEFAULT_URLS[channel] || null });
      })
      .catch((e: Error) => {
        console.log("e", e);
        this.setState({ streamUrl: DEFAULT_URLS[channel] || null });
      });
  }

  render(): React.JSX.Element {
    const {
      thumbnail = false,
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

export default connector(Ruv);
