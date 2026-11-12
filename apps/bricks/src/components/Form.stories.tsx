import { Button } from "@qrk.sh/bricks/components/button";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";

import { TextInput } from "./TextInput";

const meta = { title: "Components/Form" } satisfies Meta;

export default meta;

export const Example = {
  render: function Render() {
    const [submitted, setSubmitted] = useState(false);

    return (
      <form
        className="mx-auto grid w-full max-w-3xl gap-2 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setSubmitted(true);
        }}
      >
        <TextInput
          label="Web URL"
          orientation="vertical"
          type="url"
          required
          placeholder="https://example.com"
          description={submitted ? undefined : "Enter a public web URL."}
          status={submitted ? "Form submitted." : undefined}
          onChange={() => setSubmitted(false)}
        />
        <Button type="submit" size="sm" className="justify-self-start">
          Submit
        </Button>
      </form>
    );
  },
} satisfies StoryObj<typeof meta>;
