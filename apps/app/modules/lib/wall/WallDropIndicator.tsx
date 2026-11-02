import "./WallDropIndicator.css";

/** Local version of Atlassian's circle-ended indicator, with QRK's white-and-blue treatment. */
export function WallDropIndicator(props: { edge: "top" | "bottom" | "left" }) {
  const { edge } = props;
  return <div className="wall-drop-indicator" data-edge={edge} aria-hidden="true" />;
}
