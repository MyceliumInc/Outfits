import { execSync } from "node:child_process";
import {
  Outfit,
  validateSemantics,
  ONTOLOGY,
  type ValidationIssue,
} from "../spec/index.js";
import { getAdapter } from "../adapters/index.js";

export interface DoctorReport {
  ok: boolean;
  issues: ValidationIssue[];
}

function commandExists(cmd: string): boolean {
  const bin = cmd.split(/\s+/)[0];
  try {
    execSync(process.platform === "win32" ? `where ${bin}` : `command -v ${bin}`, {
      stdio: "ignore",
    });
    return true;
  } catch {
    return false;
  }
}

export function doctor(outfit: Outfit, target: string): DoctorReport {
  const issues: ValidationIssue[] = [...validateSemantics(outfit)];
  const adapter = getAdapter(target);
  const c = adapter.conformance;

  if (outfit.capabilities.length && !(c.routeViaGateway && c.denyNative)) {
    issues.push({
      level: "error",
      message: `${adapter.title} cannot enforce capabilities (needs gateway routing + native deny).`,
    });
  }

  for (const cap of outfit.capabilities) {
    const missing = (ONTOLOGY[cap.id]?.requiresEnv ?? []).filter((v) => !process.env[v]);
    if (missing.length) {
      issues.push({
        level: "warning",
        message: `Capability "${cap.id}" needs environment not set here: ${missing.join(", ")}.`,
      });
    }
  }

  const hardInteg = outfit.integrations.filter((x) => x.enforcement === "hard");
  if (hardInteg.length && !c.integrations) {
    issues.push({
      level: "error",
      message: `${adapter.title} cannot enforce hard integrations.`,
    });
  }

  for (const integ of outfit.integrations) {
    if (integ.command && !commandExists(integ.command)) {
      issues.push({
        level: integ.enforcement === "hard" ? "error" : "warning",
        message: `Integration "${integ.id}" command not found: \`${integ.command}\`.${
          integ.install ? ` Install: ${integ.install}` : ""
        }`,
      });
    }
  }

  const ext = (outfit.extensions?.[target] ?? {}) as Record<string, any>;
  if (ext.hooks && !c.hooks) {
    issues.push({
      level: "warning",
      message: `${adapter.title} does not support hooks - this extension will be skipped.`,
    });
  }

  const ok = !issues.some((i) => i.level === "error");
  return { ok, issues };
}
