"use client";

import { useState, type ReactNode } from "react";

import { OrderedBody } from "../../library/OrderedBody";

const regions = ["ap-southeast-2", "us-east-1", "us-east-2", "us-west-2", "eu-west-1"];

function SectionHeading({
  index,
  children,
  showListDecorator,
  showAnchors,
}: {
  index?: string;
  children: ReactNode;
  showListDecorator: boolean;
  showAnchors: boolean;
}) {
  return (
    <h2
      className={`m-0 flex items-baseline gap-[9px] text-base font-normal leading-[1.3] max-[480px]:gap-2${
        showListDecorator ? "" : " text-neutral-400"
      }`}
    >
      {showListDecorator && index ? <span className="text-neutral-400">{index}.</span> : null}
      <span>{children}</span>
      {showAnchors ? (
        <span className="-ml-0.5 text-neutral-400" aria-hidden="true">
          #
        </span>
      ) : null}
    </h2>
  );
}

function SchemaSection({
  showListDecorator,
  showAnchors,
}: {
  showListDecorator: boolean;
  showAnchors: boolean;
}) {
  return (
    <>
      <SectionHeading showListDecorator={showListDecorator} showAnchors={showAnchors}>
        GraphQL schema
      </SectionHeading>
      <p className="mt-5 mb-0 max-w-[680px]">
        The FRAGMENT API is a GraphQL API. The GraphQL schema is hosted at:
      </p>
      <div className="mt-5 bg-white p-5 leading-[1.45] max-[480px]:px-[18px]">
        <div className="mb-4 text-neutral-400">GraphQL schema URL</div>
        <a
          className="no-underline max-[480px]:break-all"
          href="https://api.fragment.dev/schema.graphql"
        >
          https://api.fragment.dev/schema.graphql
        </a>
      </div>
      <p className="mt-5 mb-0 max-w-[680px]">
        Provide this schema to a GraphQL codegen tool to generate a typed client in any language. A
        list of clients is available on the{" "}
        <a
          className="underline underline-offset-2"
          href="https://graphql.org/community/tools-and-libraries/"
        >
          GraphQL website
        </a>
        .
      </p>
    </>
  );
}

function RegionsSection({
  showListDecorator,
  showAnchors,
  leftAligned,
}: {
  showListDecorator: boolean;
  showAnchors: boolean;
  leftAligned: boolean;
}) {
  return (
    <>
      <SectionHeading showListDecorator={showListDecorator} showAnchors={showAnchors}>
        Regions
      </SectionHeading>
      <p className="mt-5 mb-0 max-w-[680px]">
        The FRAGMENT API is available in the following AWS regions:
      </p>
      <ul
        className={`mt-5 mb-0 ${
          leftAligned
            ? "pl-[29px] max-[480px]:pl-8 -ml-[29px] max-[480px]:-ml-8"
            : "pl-[35px] max-[480px]:pl-4"
        }`}
      >
        {regions.map((region) => (
          <li className="pl-0.5 max-[480px]:pl-0" key={region}>
            <code className="bg-white px-1 py-px text-neutral-400">{region}</code>
          </li>
        ))}
      </ul>
      <p className="mt-5 mb-0 max-w-[680px]">
        The region for a workspace can be found in the API URL in the settings tab of the{" "}
        <a className="underline underline-offset-2" href="#dashboard">
          dashboard
        </a>
        . Use the top-left dropdown in the dashboard to create a new workspace.
      </p>
      <p className="mt-5 mb-0 max-w-[680px]">
        <a className="underline underline-offset-2" href="#contact">
          Contact us
        </a>{" "}
        if you don&apos;t see your desired AWS region.
      </p>
    </>
  );
}

export default function OrderedBodyPage() {
  const [showListDecorator, setShowListDecorator] = useState(true);
  const [showAnchors, setShowAnchors] = useState(true);
  const [leftAligned, setLeftAligned] = useState(false);

  const nestedListClassName = leftAligned
    ? "max-[480px]:-ml-8 -ml-[29px]"
    : undefined;

  return (
    <main className="min-h-screen bg-[#f5f5f5] px-6 pt-7 pb-14 font-mono text-[15px] leading-[1.28] text-[#171717] max-[480px]:px-[23px] max-[480px]:pt-2 max-[480px]:pb-10 max-[480px]:text-sm md:px-10 md:pb-[72px]">
      <div className="mx-auto max-w-[700px]">
        <div className="mb-6 flex flex-wrap justify-end gap-x-4 gap-y-3">
          <label className="inline-flex cursor-pointer select-none items-center gap-[9px] text-xs text-neutral-500">
            <span>Show list decorator</span>
            <input
              type="checkbox"
              checked={showListDecorator}
              onChange={(event) => setShowListDecorator(event.target.checked)}
            />
          </label>
          <label className="inline-flex cursor-pointer select-none items-center gap-[9px] text-xs text-neutral-500">
            <span>Show anchors</span>
            <input
              type="checkbox"
              checked={showAnchors}
              onChange={(event) => setShowAnchors(event.target.checked)}
            />
          </label>
          <label className="inline-flex cursor-pointer select-none items-center gap-[9px] text-xs text-neutral-500">
            <span>Left aligned</span>
            <input
              type="checkbox"
              checked={leftAligned}
              onChange={(event) => setLeftAligned(event.target.checked)}
            />
          </label>
        </div>
        <OrderedBody showListDecorator={showListDecorator} showAnchors={showAnchors}>
          <li>
            <SectionHeading showListDecorator={showListDecorator} showAnchors={showAnchors}>
              API Overview
            </SectionHeading>
            <OrderedBody
              className={nestedListClassName}
              level={2}
              showListDecorator={showListDecorator}
            >
              <li>
                <SchemaSection showListDecorator={showListDecorator} showAnchors={showAnchors} />
              </li>
              <li className="mt-10">
                <RegionsSection
                  showListDecorator={showListDecorator}
                  showAnchors={showAnchors}
                  leftAligned={leftAligned}
                />
              </li>
              <li className="mt-[76px]">
                <SectionHeading showListDecorator={showListDecorator} showAnchors={showAnchors}>
                  Authentication
                </SectionHeading>
              </li>
            </OrderedBody>
          </li>
        </OrderedBody>
      </div>
    </main>
  );
}
