import {
  makeDrizzleSchemaFromEncodedTable,
  type IEncodedShape,
} from '@zerospin/schema';

export function makeNodeResourceTables(
  models: Readonly<
    Record<
      string,
      {
        modelName: string;
        propertiesShape: IEncodedShape;
        indexes: readonly {
          name: string;
          columns: readonly string[];
          unique?: boolean;
        }[];
      }
    >
  >,
) {
  return Object.fromEntries(
    Object.entries(models).map(([name, model]) => {
      if (
        name !== model.modelName ||
        ['commands', 'nodeMetadata'].includes(name)
      ) {
        throw new Error(`Invalid node resource table: ${name}`);
      }
      return [
        name,
        makeDrizzleSchemaFromEncodedTable({
          name,
          shape: model.propertiesShape,
          indexes: model.indexes.map(config => {
            const [first, ...rest] = config.columns;
            if (first === undefined) {
              throw new Error(`Empty index: ${config.name}`);
            }
            const columns: [string, ...string[]] = [first, ...rest];
            return { ...config, columns };
          }),
        }),
      ];
    }),
  );
}
