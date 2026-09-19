import { makeAggregateVersion } from "@zerospin/core/aggregate/makeAggregateVersion";

import { library } from "./library";
import { libraryAggregate } from "./libraryAggregate";

export function makeLibraryAggregateVersion() {
  return makeAggregateVersion(library, {
    version: "1.0.0",
    models: libraryAggregate.models,
    contracts: libraryAggregate.contracts,
    selections: libraryAggregate.selections,
  });
}
