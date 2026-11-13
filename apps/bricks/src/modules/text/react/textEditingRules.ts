import { definePlugin, Priority, withPriority } from "@prosekit/core";
import { Plugin } from "@prosekit/pm/state";
import { isTextDocument } from "../definition/textDocument";

/** Keep all editing transactions inside the Text Brick's single text block. */
export const textEditingRules = withPriority(
    definePlugin(new Plugin({
      filterTransaction(transaction) {
        return !transaction.docChanged || isTextDocument(transaction.doc);
      },
      props: {
        handleKeyDown(view, event) {
          if (event.key !== "Enter" || event.isComposing || view.composing) return false;
          event.preventDefault();
          return true;
        },
        handlePaste(view, event) {
          event.preventDefault();
          const text = event.clipboardData?.getData("text/plain").replace(/[\r\n\u2028\u2029]+/gu, " ") ?? "";
          if (text !== "") view.dispatch(view.state.tr.insertText(text));
          return true;
        },
        handleDrop(view, event, _slice, moved) {
          if (moved) return false;
          event.preventDefault();
          const text = event.dataTransfer?.getData("text/plain").replace(/[\r\n\u2028\u2029]+/gu, " ") ?? "";
          const position = view.posAtCoords({ left: event.clientX, top: event.clientY });
          if (text !== "" && position !== null) view.dispatch(view.state.tr.insertText(text, position.pos));
          return true;
        },
      },
    })),
    Priority.high,
  );
