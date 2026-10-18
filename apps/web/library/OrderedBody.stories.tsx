import type { Meta, StoryObj } from "@storybook/react-vite";

import { UnderlinedLink } from "../components/UnderlinedLink";

import { OrderedBody, OrderedBodyHeading } from "./OrderedBody";

const meta = {
  title: "Web/OrderedBody",
  component: OrderedBody,
  parameters: {
    layout: "padded",
    docs: {
      description: {
        component:
          "Nested documentation sections with numbered headings and optional permalinks. Toggle `showListDecorator` and `showAnchors` in Controls; nested headings inherit the anchor setting.",
      },
      source: {
        code: `import { OrderedBody, OrderedBodyHeading } from "@/library/OrderedBody";

<OrderedBody showListDecorator showAnchors>
  <li>
    <OrderedBodyHeading>API Overview</OrderedBodyHeading>
    <OrderedBody level={2} showListDecorator>
      <li>
        <OrderedBodyHeading>GraphQL schema</OrderedBodyHeading>
        <p>Generate a typed client from the API schema.</p>
      </li>
      <li>
        <OrderedBodyHeading>Regions</OrderedBodyHeading>
        <p>Choose the region nearest your application.</p>
      </li>
    </OrderedBody>
  </li>
</OrderedBody>`,
      },
    },
  },
  args: {
    children: null,
    showListDecorator: true,
    showAnchors: true,
  },
  argTypes: {
    children: { control: false, table: { disable: true } },
    className: { control: false, table: { disable: true } },
    level: { control: false, table: { disable: true } },
    showListDecorator: { control: "boolean" },
    showAnchors: { control: "boolean" },
  },
  render: (props) => {
    const { showListDecorator, showAnchors } = props;
    return (
      <div className="mx-auto max-w-[780px] bg-[#f5f5f5] px-6 py-7 font-mono text-[15px] leading-[1.3] text-[#171717] md:px-10">
        <OrderedBody showListDecorator={showListDecorator} showAnchors={showAnchors}>
          <li>
            <OrderedBodyHeading>API Overview</OrderedBodyHeading>
            <OrderedBody level={2} showListDecorator={showListDecorator}>
              <li>
                <OrderedBodyHeading>GraphQL schema</OrderedBodyHeading>
                <p className="mt-5 mb-0">
                  The FRAGMENT API is a GraphQL API. The GraphQL schema is hosted at:
                </p>
                <div className="mt-5 bg-white p-5 leading-[1.45]">
                  <div className="mb-4 text-neutral-400">GraphQL schema URL</div>
                  <UnderlinedLink
                    className="break-all"
                    href="https://api.fragment.dev/schema.graphql"
                    size="lg"
                  >
                    https://api.fragment.dev/schema.graphql
                  </UnderlinedLink>
                </div>
                <p className="mt-5 mb-0">
                  Provide this schema to a GraphQL codegen tool to generate a typed client in any
                  language. A list of clients is available on the{" "}
                  <UnderlinedLink
                    href="https://graphql.org/community/tools-and-libraries/"
                    size="lg"
                  >
                    GraphQL website
                  </UnderlinedLink>
                  .
                </p>
              </li>
              <li className="mt-10">
                <OrderedBodyHeading>Regions</OrderedBodyHeading>
                <p className="mt-5 mb-0">
                  The FRAGMENT API is available in the following AWS regions:
                </p>
                <ul className="mt-5 mb-0 list-disc pl-[35px] max-[480px]:pl-4">
                  {["ap-southeast-2", "us-east-1", "us-east-2", "us-west-2", "eu-west-1"].map(
                    (region) => (
                      <li className="pl-0.5" key={region}>
                        <code className="bg-white px-1 py-px text-neutral-400">{region}</code>
                      </li>
                    ),
                  )}
                </ul>
                <p className="mt-5 mb-0">
                  Choose the region nearest your application when creating a workspace in the
                  dashboard.
                </p>
              </li>
              <li className="mt-10">
                <OrderedBodyHeading>Authentication</OrderedBodyHeading>
                <p className="mt-5 mb-0">
                  Authenticate API requests with your workspace credentials.
                </p>
              </li>
            </OrderedBody>
          </li>
        </OrderedBody>
      </div>
    );
  },
} satisfies Meta<typeof OrderedBody>;

export default meta;

export const Default = {} satisfies StoryObj<typeof meta>;

export const Permalink = {
  args: { showListDecorator: false },
  parameters: {
    layout: "centered",
    docs: {
      source: {
        code: `import { OrderedBody, OrderedBodyHeading } from "@/library/OrderedBody";

<OrderedBody showAnchors showListDecorator={false}>
  <li>
    <OrderedBodyHeading>Dashboard</OrderedBodyHeading>
  </li>
</OrderedBody>`,
      },
    },
  },
  render: (props) => {
    const { showListDecorator, showAnchors } = props;
    return (
      <OrderedBody showListDecorator={showListDecorator} showAnchors={showAnchors}>
        <li>
          <OrderedBodyHeading>Dashboard</OrderedBodyHeading>
        </li>
      </OrderedBody>
    );
  },
} satisfies StoryObj<typeof meta>;
