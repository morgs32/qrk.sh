import type { InferDecodedRow, IShape } from "@zerospin/schema";
import type { ReactNode } from "react";

export interface IFormConfiguration<DATA = unknown> {
  configurationType: "form";
  form: {
    bivarianceHack(props: {
      data: DATA;
      onChange: { bivarianceHack(data: DATA): void }["bivarianceHack"];
    }): ReactNode;
  }["bivarianceHack"];
}

export function makeFormConfiguration<const DATA_SHAPE extends IShape>(props: {
  form: (props: {
    data: InferDecodedRow<DATA_SHAPE>;
    onChange: (data: InferDecodedRow<DATA_SHAPE>) => void;
  }) => ReactNode;
}): IFormConfiguration<InferDecodedRow<DATA_SHAPE>> {
  return {
    configurationType: "form",
    form: props.form,
  };
}
