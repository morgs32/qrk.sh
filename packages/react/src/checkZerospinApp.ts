import type {
  IAggregateFrontend,
  IServiceFrontend,
} from '@zerospin/core/frontendController/types';
import type { ISystem } from '@zerospin/core/system/types';

/** Checks structural app compatibility at compile time; performs no runtime validation. */
export function checkZerospinApp<SYSTEM>(
  app: SYSTEM extends ISystem<
    infer AGGREGATES,
    infer SERVICES,
    infer SYSTEM_NAME,
    infer AUTHENTICATION,
    infer _LAYER_SERVICES
  >
    ? Readonly<{
        systemName: SYSTEM_NAME;
        authentication: AUTHENTICATION[number] extends infer AUTH
          ? AUTH extends { version: string; signature: unknown }
            ? Pick<AUTH, 'version' | 'signature'>
            : never
          : never;
        frontends: Readonly<
          Record<
            string,
            Readonly<{
              frontend: { systemName: SYSTEM_NAME } & (
                | ({
                    [NAME in keyof AGGREGATES as string extends NAME
                      ? never
                      : NAME]: {
                      [VERSION in keyof AGGREGATES[NAME] as string extends VERSION
                        ? never
                        : VERSION]: IAggregateFrontend<
                        AGGREGATES[NAME][VERSION]
                      >;
                    } extends infer VERSIONS
                      ? VERSIONS[keyof VERSIONS]
                      : never;
                  } extends infer OWNERS
                    ? OWNERS[keyof OWNERS]
                    : never)
                | ({
                    [NAME in keyof SERVICES as string extends NAME
                      ? never
                      : NAME]: {
                      [VERSION in keyof SERVICES[NAME] as string extends VERSION
                        ? never
                        : VERSION]: IServiceFrontend<SERVICES[NAME][VERSION]>;
                    } extends infer VERSIONS
                      ? VERSIONS[keyof VERSIONS]
                      : never;
                  } extends infer OWNERS
                    ? OWNERS[keyof OWNERS]
                    : never)
              );
            }>
          >
        >;
      }>
    : never,
): void {
  void app;
}
