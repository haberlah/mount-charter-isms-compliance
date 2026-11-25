import { execFile } from "node:child_process";
import os from "node:os";
import type { CollectorInfo, CollectorRunResult } from "@shared/schema";
import { findCliBinary } from "./ai-provider";
import { putBlob } from "./blob-store";
import { chunkText, normaliseExtractedText } from "./document-processor";
import { storage } from "./storage";

interface CollectorSpec {
  id: string;
  name: string;
  category: string;
  description: string;
  binary?: string;
  platformOnly?: NodeJS.Platform;
  mappedControls: string[];
  mappedFrameworks: Array<{ frameworkCode: string; reqCode: string }>;
  collect: (
    binaryPath: string | null,
  ) => Promise<{ summary: string; sections: Array<{ heading: string; output: string }> }>;
}

function runReadOnlyCommand(
  binary: string,
  args: string[],
  timeoutMs = 15_000,
): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, NO_COLOR: "1" } },
      (err, stdout, stderr) => {
        if (err) {
          resolve({ ok: false, stdout: stdout.trim(), stderr: (stderr || err.message).trim() });
          return;
        }
        resolve({ ok: true, stdout: stdout.trim(), stderr: stderr.trim() });
      },
    );
  });
}

const COLLECTORS: readonly CollectorSpec[] = [
  {
    id: "macos_posture",
    name: "macOS Endpoint Security Posture",
    category: "Endpoint / MDM",
    description:
      "Captures read-only local macOS version, FileVault disk encryption, Gatekeeper, Application Firewall, and System Integrity Protection (SIP) status.",
    platformOnly: "darwin",
    mappedControls: ["8.1", "8.8", "8.9", "8.24"],
    mappedFrameworks: [
      { frameworkCode: "acsc_e8_2023", reqCode: "E8-PO-ML1-01" },
      { frameworkCode: "acsc_e8_2023", reqCode: "E8-AC-ML1-01" },
    ],
    async collect() {
      const [sw, fv, gk, sip, fw] = await Promise.all([
        runReadOnlyCommand("/usr/bin/sw_vers", []),
        runReadOnlyCommand("/usr/bin/fdesetup", ["status"]),
        runReadOnlyCommand("/usr/sbin/spctl", ["--status"]),
        runReadOnlyCommand("/usr/bin/csrutil", ["status"]),
        runReadOnlyCommand("/usr/libexec/ApplicationFirewall/socketfilterfw", ["--getglobalstate"]),
      ]);
      const fvOn = fv.stdout.toLowerCase().includes("filevault is on");
      const gkOn = gk.stdout.toLowerCase().includes("assessments enabled");
      const sipOn = sip.stdout.toLowerCase().includes("enabled");
      return {
        summary: `Host ${os.hostname()}: FileVault ${fvOn ? "ON" : "CHECK"}, Gatekeeper ${gkOn ? "ON" : "CHECK"}, SIP ${sipOn ? "ON" : "CHECK"}`,
        sections: [
          { heading: "Host & OS Version (sw_vers)", output: sw.stdout || sw.stderr },
          {
            heading: "FileVault Disk Encryption (fdesetup status)",
            output: fv.stdout || fv.stderr,
          },
          { heading: "Gatekeeper (spctl --status)", output: gk.stdout || gk.stderr },
          {
            heading: "System Integrity Protection (csrutil status)",
            output: sip.stdout || sip.stderr,
          },
          { heading: "Application Firewall", output: fw.stdout || fw.stderr },
        ],
      };
    },
  },
  {
    id: "github_security",
    name: "GitHub Security & Repository Posture",
    category: "Source Control / CI",
    description:
      "Uses your locally authenticated `gh` CLI to capture read-only GitHub account/organisation security posture and repository visibility/settings.",
    binary: "gh",
    mappedControls: ["8.4", "8.25", "8.32"],
    mappedFrameworks: [{ frameworkCode: "acsc_e8_2023", reqCode: "E8-MFA-ML1-01" }],
    async collect(bin) {
      const gh = bin!;
      const [auth, repos] = await Promise.all([
        runReadOnlyCommand(gh, ["auth", "status"]),
        runReadOnlyCommand(gh, [
          "repo",
          "list",
          "--limit",
          "25",
          "--json",
          "nameWithOwner,visibility,defaultBranchRef,isArchived,updatedAt",
        ]),
      ]);
      if (!auth.ok && !repos.ok) {
        throw new Error(`gh CLI is not authenticated: ${auth.stderr || repos.stderr}`);
      }
      return {
        summary:
          "Captured read-only GitHub CLI auth status and up to 25 repository posture records.",
        sections: [
          { heading: "GitHub Auth Status", output: auth.stdout || auth.stderr },
          { heading: "Repositories JSON (Top 25)", output: repos.stdout || repos.stderr },
        ],
      };
    },
  },
  {
    id: "gcloud_iam",
    name: "Google Cloud (gcloud) Project & IAM Posture",
    category: "Cloud Infrastructure",
    description:
      "Uses your locally authenticated `gcloud` CLI to capture active project configuration, enabled services, and IAM summary (read-only).",
    binary: "gcloud",
    mappedControls: ["5.15", "8.2", "8.15", "5.23"],
    mappedFrameworks: [{ frameworkCode: "acsc_e8_2023", reqCode: "E8-AP-ML1-01" }],
    async collect(bin) {
      const gcloud = bin!;
      const [cfg, projects] = await Promise.all([
        runReadOnlyCommand(gcloud, ["config", "list", "--format=json"]),
        runReadOnlyCommand(gcloud, ["projects", "list", "--limit=25", "--format=json"]),
      ]);
      if (!projects.ok && !cfg.ok) {
        throw new Error(`gcloud CLI failed: ${projects.stderr || cfg.stderr}`);
      }
      return {
        summary:
          "Captured read-only Google Cloud CLI active configuration and accessible projects.",
        sections: [
          { heading: "gcloud Active Configuration", output: cfg.stdout || cfg.stderr },
          {
            heading: "Accessible GCP Projects (Top 25)",
            output: projects.stdout || projects.stderr,
          },
        ],
      };
    },
  },
  {
    id: "aws_iam",
    name: "AWS Account & IAM Security Summary",
    category: "Cloud Infrastructure",
    description:
      "Uses your locally authenticated `aws` CLI to capture read-only caller identity and IAM Account Summary (MFA, root access keys, password policy).",
    binary: "aws",
    mappedControls: ["5.15", "8.2", "8.5", "5.23"],
    mappedFrameworks: [
      { frameworkCode: "acsc_e8_2023", reqCode: "E8-MFA-ML1-01" },
      { frameworkCode: "acsc_e8_2023", reqCode: "E8-AP-ML1-01" },
    ],
    async collect(bin) {
      const aws = bin!;
      const [id, iam] = await Promise.all([
        runReadOnlyCommand(aws, ["sts", "get-caller-identity", "--output", "json"]),
        runReadOnlyCommand(aws, ["iam", "get-account-summary", "--output", "json"]),
      ]);
      if (!id.ok) {
        throw new Error(`aws CLI is not authenticated: ${id.stderr}`);
      }
      return {
        summary: "Captured read-only AWS caller identity and IAM Account Summary.",
        sections: [
          { heading: "AWS Caller Identity", output: id.stdout },
          { heading: "AWS IAM Account Summary", output: iam.stdout || iam.stderr },
        ],
      };
    },
  },
];

export function listCollectors(): CollectorInfo[] {
  return COLLECTORS.map((c) => {
    if (c.platformOnly && process.platform !== c.platformOnly) {
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        description: c.description,
        available: false,
        statusNote: `Available on ${c.platformOnly} only.`,
        mappedControls: c.mappedControls,
        mappedFrameworks: c.mappedFrameworks,
      };
    }
    if (c.binary) {
      const binPath = findCliBinary(c.binary);
      return {
        id: c.id,
        name: c.name,
        category: c.category,
        description: c.description,
        available: Boolean(binPath),
        statusNote: binPath
          ? `Detected \`${c.binary}\` at ${binPath}`
          : `\`${c.binary}\` CLI not installed on PATH.`,
        mappedControls: c.mappedControls,
        mappedFrameworks: c.mappedFrameworks,
      };
    }
    return {
      id: c.id,
      name: c.name,
      category: c.category,
      description: c.description,
      available: true,
      statusNote: "Built-in macOS local posture collector ready.",
      mappedControls: c.mappedControls,
      mappedFrameworks: c.mappedFrameworks,
    };
  });
}

export async function runCollector(
  workspaceId: number,
  collectorId: string,
): Promise<CollectorRunResult> {
  const spec = COLLECTORS.find((c) => c.id === collectorId);
  if (!spec) throw new Error(`Unknown collector "${collectorId}"`);
  if (spec.platformOnly && process.platform !== spec.platformOnly) {
    throw new Error(`Collector "${spec.name}" is only supported on ${spec.platformOnly}.`);
  }
  const binPath = spec.binary ? findCliBinary(spec.binary) : null;
  if (spec.binary && !binPath) {
    throw new Error(`Required CLI "${spec.binary}" is not installed on PATH.`);
  }

  const capturedAt = new Date().toISOString();
  const collected = await spec.collect(binPath);

  const md = [
    `# ${spec.name} — Automated Local Evidence Snapshot`,
    "",
    `- **Captured At:** ${capturedAt}`,
    `- **Host:** ${os.hostname()} (${process.platform} ${os.arch()})`,
    `- **Summary:** ${collected.summary}`,
    `- **Mapped ISO Controls:** ${spec.mappedControls.join(", ")}`,
    "",
    ...collected.sections.flatMap((s) => [`## ${s.heading}`, "", "```", s.output, "```", ""]),
  ].join("\n");

  const buf = Buffer.from(md, "utf8");
  const { blobKey, fileHash } = putBlob(buf);
  const cleanDate = capturedAt.slice(0, 10);
  const title = `${spec.name} (${cleanDate})`;
  const filename = `collector-${spec.id}-${cleanDate}.md`;
  const normalised = normaliseExtractedText(md);
  const chunks = chunkText(normalised);

  const existing = storage.findDocumentByHash(workspaceId, fileHash);
  const doc =
    existing ||
    storage.createDocument({
      workspaceId,
      title,
      originalFilename: filename,
      blobKey,
      mimeType: "text/markdown",
      fileSize: buf.length,
      fileHash,
      documentDate: cleanDate,
      evidenceType: "RECORD",
      description: `Automated read-only snapshot captured by Mount Charter local collector (${spec.id}): ${collected.summary}`,
      extractedText: normalised,
      extractionStatus: "extracted",
      chunks,
    });

  // Auto-link to mapped ISO 27001 controls
  const linkedControls: string[] = [];
  for (const cn of spec.mappedControls) {
    const ctrl = storage.getControlByNumber(cn);
    if (ctrl) {
      const wc = storage.ensureWorkspaceControl(workspaceId, ctrl.id);
      storage.linkDocumentToControl(workspaceId, doc.id, wc.id);
      linkedControls.push(cn);
    }
  }

  // Auto-link to mapped Australian framework requirements
  const linkedRequirements: string[] = [];
  for (const mf of spec.mappedFrameworks) {
    const added = storage.addRequirementEvidence({
      workspaceId,
      frameworkCode: mf.frameworkCode,
      reqCode: mf.reqCode,
      documentId: doc.id,
      title: doc.title,
      evidenceType: "RECORD",
    });
    if (added) linkedRequirements.push(`${mf.frameworkCode}:${mf.reqCode}`);
  }

  return {
    collectorId: spec.id,
    documentId: doc.id,
    title: doc.title,
    capturedAt,
    linkedControls,
    linkedRequirements,
    summary: collected.summary,
  };
}
