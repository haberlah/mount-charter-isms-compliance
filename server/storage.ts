import { auditRepository } from "./repositories/audit";
import { controlsRepository } from "./repositories/controls";
import { dashboardRepository } from "./repositories/dashboard";
import { evidenceRepository } from "./repositories/evidence";
import { frameworksRepository } from "./repositories/frameworks";
import { governanceRepository } from "./repositories/governance";
import { workspaceRepository } from "./repositories/workspaces";

/**
 * Facade combining all domain-specific SQLite repositories.
 * Route handlers and services may import either `storage` or the individual
 * domain repositories under `server/repositories/`.
 */
export const storage = {
  ...workspaceRepository,
  ...controlsRepository,
  ...evidenceRepository,
  ...auditRepository,
  ...frameworksRepository,
  ...governanceRepository,
  ...dashboardRepository,
};
