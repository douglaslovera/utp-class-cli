import { UpstreamMappingPendingError } from "../../utils/errors";
import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface EvaluationsService {
  listEvaluations(): Promise<never>;
}

export function createEvaluationsService(client: UtpHttpClient): EvaluationsService {
  void client;

  return {
    async listEvaluations(): Promise<never> {
      throw new UpstreamMappingPendingError("Evaluations upstream mapping is pending");
    },
  };
}
