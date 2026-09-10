import type { IAnyFrontendController, InferFrontendModels } from './types.ts';

export function getFrontendDbModels<FRONTEND extends IAnyFrontendController>(
  frontend: FRONTEND,
): InferFrontendModels<FRONTEND> {
  return frontend.models;
}
