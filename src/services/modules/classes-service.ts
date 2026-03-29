import { UpstreamMappingPendingError } from "../../utils/errors";
import type { UtpHttpClient } from "../upstream/utp-http-client";

export interface ClassesService {
  listClasses(): Promise<never>;
}

export function createClassesService(client: UtpHttpClient): ClassesService {
  void client;

  return {
    async listClasses(): Promise<never> {
      throw new UpstreamMappingPendingError("Classes upstream mapping is pending");
    },
  };
}
