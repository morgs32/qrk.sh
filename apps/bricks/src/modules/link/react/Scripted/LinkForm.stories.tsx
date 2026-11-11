import type { Meta, StoryObj } from "@storybook/react-vite";
import { type ComponentProps, useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";

import { linkPreviewState } from "../../definition/linkPreviewState";
import { LinkForm } from "../LinkForm";

const meta = {
  title: "Modules/Link/Scripted",
  render: function RenderForm(
    props: Pick<ComponentProps<typeof LinkForm>, "onSave" | "lookupLinkPreview">,
  ) {
    const { onSave, lookupLinkPreview } = props;
    const [state, setState] = useState<ComponentProps<typeof LinkForm>["state"]>(null);
    const [open, setOpen] = useState(true);

    return (
      <div className="qrk-bricks grid gap-3">
        {open ? (
          <LinkForm
            state={state}
            lookupLinkPreview={lookupLinkPreview}
            onSave={(next) => {
              const result = onSave(next);
              if (result._tag === "Success") setState(next);
              return result;
            }}
          />
        ) : null}
        <button type="button" onClick={() => setOpen(false)}>
          Close form
        </button>
      </div>
    );
  },
  args: {
    onSave: fn<ComponentProps<typeof LinkForm>["onSave"]>(() => ({
      _tag: "Success",
      success: undefined,
    })),
    lookupLinkPreview: fn<ComponentProps<typeof LinkForm>["lookupLinkPreview"]>(),
  },
} satisfies Meta<Pick<ComponentProps<typeof LinkForm>, "onSave" | "lookupLinkPreview">>;

export default meta;

export const Autosave: StoryObj<typeof meta> = {
  play: async ({ args, canvasElement }) => {
    const canvas = within(canvasElement);
    const field = canvas.getByLabelText("Link URL");
    const fieldLayout = field.closest('[data-slot="field"]');
    expect(fieldLayout).toHaveAttribute("data-orientation", "vertical");
    expect(fieldLayout?.closest('[data-slot="field-group"]')).toBeInTheDocument();
    expect(field).toHaveAccessibleDescription("Enter an HTTP or HTTPS URL.");
    const close = canvas.getByRole("button", { name: "Close form" });
    const lookup = args.lookupLinkPreview;
    const save = args.onSave;
    const stale = Promise.withResolvers<Awaited<ReturnType<typeof lookup>>>();
    const leaving = Promise.withResolvers<Awaited<ReturnType<typeof lookup>>>();
    const url = "https://example.com/";
    const preview = { ...linkPreviewState.data, url };
    lookup
      .mockReturnValueOnce(stale.promise)
      .mockResolvedValueOnce({
        _tag: "Left",
        left: { code: "unsupported-page-shape", message: "Preview unavailable." },
      })
      .mockResolvedValueOnce({ _tag: "Right", right: preview })
      .mockReturnValueOnce(leaving.promise);

    await userEvent.type(field, "bad");
    await userEvent.keyboard("{Enter}");
    expect(await canvas.findByRole("alert")).toHaveTextContent("Enter a valid HTTP or HTTPS URL.");
    expect(field).toHaveAccessibleDescription(
      "Enter an HTTP or HTTPS URL. Enter a valid HTTP or HTTPS URL.",
    );
    expect(lookup).not.toHaveBeenCalled();

    await userEvent.clear(field);
    await userEvent.paste("https://stale.example/");
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(1), { timeout: 2000 });
    await userEvent.keyboard("{Enter}");
    await userEvent.tab();
    expect(lookup).toHaveBeenCalledTimes(1);

    await userEvent.clear(field);
    await userEvent.paste(url);
    expect(lookup.mock.calls[0]?.[1].aborted).toBe(true);
    stale.resolve({ _tag: "Right", right: { ...preview, url: "https://stale.example/" } });
    await userEvent.tab();
    expect(await canvas.findByRole("alert")).toHaveTextContent("Preview unavailable.");
    expect(save).not.toHaveBeenCalled();
    expect(field).toHaveValue(url);

    await userEvent.click(field);
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(save).toHaveBeenCalledWith({ payload: { url }, data: preview });

    await userEvent.clear(field);
    await userEvent.paste("https://leaving.example/");
    await userEvent.keyboard("{Enter}");
    await waitFor(() => expect(lookup).toHaveBeenCalledTimes(4));
    await userEvent.click(close);
    expect(lookup.mock.calls[3]?.[1].aborted).toBe(true);
    leaving.resolve({ _tag: "Right", right: { ...preview, url: "https://leaving.example/" } });
    await leaving.promise;
    expect(save).toHaveBeenCalledOnce();
  },
};
