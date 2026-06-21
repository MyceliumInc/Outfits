export * from "./spec/index.js";
export * from "./adapters/index.js";
export {
  runGateway,
  buildGatewayServer,
  type GatewayServer,
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
