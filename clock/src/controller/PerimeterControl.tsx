import { Button, ButtonGroup } from "rsuite";
import { usePerimeter } from "../contexts/FirebaseStateContext";

const PerimeterControl = () => {
  const { perimeter, setPerimeterState } = usePerimeter();

  if (!perimeter.enabled) return null;

  return (
    <div className="control-item withborder">
      <div className="theme-trigger-label">Jaðarskjár (perimeter)</div>
      <ButtonGroup size="sm">
        <Button
          appearance={perimeter.state === "on" ? "primary" : "default"}
          onClick={() => setPerimeterState("on")}
        >
          Kveikt
        </Button>
        <Button
          appearance={perimeter.state === "off" ? "primary" : "default"}
          onClick={() => setPerimeterState("off")}
        >
          Slökkt
        </Button>
      </ButtonGroup>
    </div>
  );
};

export default PerimeterControl;
