export * from "./spec/index.js";
export * from "./adapters/index.js";
export {
  runGateway,
  HANDLERS,
  type CapabilityHandler,
  ScopeViolation,
  assertShellAllowed,
  assertPathAllowed,
  assertUrlAllowed,
} from "./gateway/index.js";
export { doctor, type DoctorReport } from "./cli/doctor.js";
