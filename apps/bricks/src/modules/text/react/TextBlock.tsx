import { MarkdownView } from "@meowdown/react";
import { stageAggregateSessionCommand } from "@zerospin/sdk/browser";
import { useContext } from "react";
import { BrickSessionContext } from "../../react/BrickSessionContext";
import { makeComponentView } from "../../react/makeComponentView";
import { textBlockComponentMetadata } from "../definition/textV1";
import { TextEditor } from "./TextEditor";
import "../../../components/spectral-font.css";
import "./text.css";

export const textBlockView = makeComponentView(textBlockComponentMetadata, {
  component(props) {
    const { content, fontFamily, fontSizePx } = props;
    const editing = useContext(BrickSessionContext);
    if (editing !== null) {
      const { session, brickId, placementId, registerFlush } = editing;
      return (
        <TextEditor
          key={placementId}
          state={{ content }}
          placementState={{ fontFamily, fontSizePx }}
          onSave={(state) => stageAggregateSessionCommand({
            session,
            contractName: "updateTextBrick",
            payload: { brickId, state },
          })}
          onSavePlacement={(state) => stageAggregateSessionCommand({
            session,
            contractName: "updateTextPlacement",
            payload: { placementId, state },
          })}
          registerFlush={registerFlush}
        />
      );
    }
    const families = { sans: '"Geist Variable", sans-serif', serif: '"Spectral", serif', mono: '"Geist Mono Variable", monospace' };
    return (
      <div className="qrk-text-block" style={{ fontFamily: families[fontFamily], fontSize: fontSizePx }}>
        <MarkdownView markdown={content} markMode="hide" interactive className="qrk-text-document" />
      </div>
    );
  },
});
