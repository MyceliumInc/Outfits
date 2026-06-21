export * from "./spec/index.js";
export * from "./adapters/index.js";
export {
  runGateway,
  HANDLERS,
  sanitizedEnv,
  type CapabilityHandler,
  ScopeViolation,
  assertShellAllowed,
  assertPathAllowed,
  assertUrlAllowed,
  normalizeCommand,
} from "./gateway/index.js";
export { doctor, type DoctorReport } from "./cli/doctor.js";
