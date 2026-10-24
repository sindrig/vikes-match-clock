import { useState } from "react";
import { Button } from "rsuite";
import { useLocalState } from "../../contexts/LocalStateContext";
import { parseMainScreenMediaAsset } from "../../contexts/firebaseParsers";
import { MainScreenMediaAsset } from "../../types";
import ImageList from "./ImageList";

interface MainScreenMediaPickerProps {
  value: MainScreenMediaAsset | null;
  onChange: (asset: MainScreenMediaAsset | null) => void;
  disabled: boolean;
}

const MainScreenMediaPicker = ({
  value,
  onChange,
  disabled,
}: MainScreenMediaPickerProps) => {
  const { listenPrefix } = useLocalState();
  const [browsing, setBrowsing] = useState(false);
  const [folder, setFolder] = useState("");
  const mediaLocation = listenPrefix === "safamyri" ? "fotbolti" : listenPrefix;

  const navigate = (name: string) => {
    if (name === "..") {
      setFolder(folder.slice(0, folder.lastIndexOf("/")));
    } else {
      setFolder(`${folder}/${name}`);
    }
  };

  return (
    <div className="media-pair-field">
      <div className="media-pair-label">Stórskjár (valfrjálst)</div>
      <p className="media-pair-hint">
        Veldu mynd eða myndband úr Myndir. Sýna birtir þá efnið á stórskjá og
        báðum jaðarskjám.
      </p>
      <div className="media-pair-main-selection">
        <span>{value?.name ?? "Ekkert efni á stórskjá"}</span>
        <Button
          size="sm"
          disabled={disabled}
          onClick={() => setBrowsing(!browsing)}
        >
          {browsing ? "Loka myndefni" : "Velja úr myndefni"}
        </Button>
        {value && (
          <Button
            size="sm"
            appearance="subtle"
            disabled={disabled}
            onClick={() => onChange(null)}
          >
            Aftengja stórskjá
          </Button>
        )}
      </div>
      {browsing && !disabled && (
        <div className="media-pair-library">
          {folder && (
            <Button size="sm" onClick={() => navigate("..")}>
              Til baka
            </Button>
          )}
          <ImageList
            prefix={`${mediaLocation}/images${folder}`}
            allowEdit={false}
            appendPrefix={navigate}
            ts={null}
            onAddAssets={(assets) => {
              const selected = parseMainScreenMediaAsset(assets[0]);
              if (selected) {
                onChange(selected);
                setBrowsing(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
};

export default MainScreenMediaPicker;
