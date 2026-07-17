import type { IFrontendController, InferFrontendModels } from './types.ts';

export function getFrontendDbModels<FRONTEND extends IFrontendController>(
  frontend: FRONTEND,
): InferFrontendModels<FRONTEND> {
  return frontend.models;
}
