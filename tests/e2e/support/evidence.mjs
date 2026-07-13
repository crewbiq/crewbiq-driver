import fs from 'node:fs';
import path from 'node:path';

import { redactString, redactValue } from './redact.mjs';

const binaryModes = new Set(['synthetic', 'disposable']);
const knownModes = new Set(['safe', ...binaryModes]);

function safeName(value) {
  return String(value).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-|-$/g, '').toLowerCase();
}

function referenceFor(filePath) {
  return path.relative(process.cwd(), filePath).replaceAll('\\', '/');
}

export function resolveEvidencePolicy(env = process.env) {
  const requestedMode = String(env.E2E_EVIDENCE_MODE || 'safe').toLowerCase();
  const mode = knownModes.has(requestedMode) ? requestedMode : 'safe';
  const sensitiveRun = String(env.E2E_AUTHENTICATED_RUN || '') === '1'
    || String(env.E2E_SENSITIVE_RUN || '') === '1';
  const binaryEvidenceSafe = binaryModes.has(mode)
    && String(env.E2E_ALLOW_BINARY_EVIDENCE || '') === '1'
    && !sensitiveRun;
  return {
    mode,
    sensitive_run: sensitiveRun,
    text_evidence_redacted: true,
    binary_evidence_safe: binaryEvidenceSafe,
    binary_evidence_omitted: !binaryEvidenceSafe,
  };
}

export function resetUploadDirectory(uploadDir) {
  fs.rmSync(uploadDir, { recursive: true, force: true });
  fs.mkdirSync(uploadDir, { recursive: true });
}

function redactedText(raw) {
  try {
    return `${JSON.stringify(redactValue(JSON.parse(raw)), null, 2)}\n`;
  } catch {
    return redactString(raw);
  }
}

function writeRedactedText(sourcePath, destinationPath) {
  fs.writeFileSync(destinationPath, redactedText(fs.readFileSync(sourcePath, 'utf8')), 'utf8');
}

function writeRedactedAttachment(attachment, destinationPath) {
  if (attachment.path) {
    writeRedactedText(attachment.path, destinationPath);
    return;
  }
  if (attachment.body !== undefined) {
    const raw = Buffer.isBuffer(attachment.body)
      ? attachment.body.toString('utf8')
      : String(attachment.body);
    fs.writeFileSync(destinationPath, redactedText(raw), 'utf8');
    return;
  }
  throw new Error('Text evidence attachment has no path or body');
}

export function publishScenarioAttachments({
  attachments,
  uploadDir,
  scenarioId,
  policy,
}) {
  const evidence = {
    screenshots: [],
    traces: [],
    console: [],
    network: [],
    other: [],
    omitted: [],
  };
  const artifacts = [];
  const scenarioDir = path.join(uploadDir, 'evidence', safeName(scenarioId));
  fs.mkdirSync(scenarioDir, { recursive: true });

  for (const attachment of attachments) {
    const rawName = String(attachment.name || '');
    const name = rawName.toLowerCase();
    const contentType = String(attachment.contentType || '');
    const isConsole = name === 'console-log' && contentType === 'application/json';
    const isNetwork = name === 'network-log' && contentType === 'application/json';
    const isObservation = name.endsWith('-observations') && contentType === 'application/json';
    const isScreenshot = name.includes('screenshot') || contentType.startsWith('image/');
    const isTrace = name.includes('trace') || contentType === 'application/zip';

    if ((isConsole || isNetwork) && attachment.path) {
      const kind = isConsole ? 'console' : 'network';
      const destination = path.join(scenarioDir, `${kind}.json`);
      writeRedactedText(attachment.path, destination);
      evidence[kind].push(referenceFor(destination));
      artifacts.push({
        path: path.relative(uploadDir, destination).replaceAll('\\', '/'),
        kind: `redacted_${kind}`,
        media_type: 'application/json',
      });
      continue;
    }

    if (isObservation && (attachment.path || attachment.body !== undefined)) {
      const baseName = safeName(rawName) || 'observations';
      const destination = path.join(scenarioDir, `${baseName}.json`);
      writeRedactedAttachment(attachment, destination);
      evidence.other.push(referenceFor(destination));
      artifacts.push({
        path: path.relative(uploadDir, destination).replaceAll('\\', '/'),
        kind: 'redacted_observations',
        media_type: 'application/json',
      });
      continue;
    }

    if ((isScreenshot || isTrace) && attachment.path) {
      const kind = isScreenshot ? 'screenshots' : 'traces';
      if (policy.binary_evidence_safe) {
        const extension = isScreenshot ? '.png' : '.zip';
        const destination = path.join(scenarioDir, `${kind.slice(0, -1)}${extension}`);
        fs.copyFileSync(attachment.path, destination);
        evidence[kind].push(referenceFor(destination));
        artifacts.push({
          path: path.relative(uploadDir, destination).replaceAll('\\', '/'),
          kind: `synthetic_${kind.slice(0, -1)}`,
          media_type: contentType,
        });
      } else {
        evidence.omitted.push(`${name || kind}: binary evidence disabled by safe policy`);
      }
      continue;
    }

    evidence.omitted.push(`${name || 'unnamed'}: attachment type is not allowlisted`);
  }

  return { evidence, artifacts };
}

export function writeUploadManifest(uploadDir, policy, artifacts) {
  const manifestPath = path.join(uploadDir, 'upload-manifest.json');
  const manifest = {
    schema_version: '1.0.0',
    evidence_policy: policy,
    artifacts: [
      { path: 'run.json', kind: 'redacted_run_json', media_type: 'application/json' },
      { path: 'report.md', kind: 'redacted_markdown', media_type: 'text/markdown' },
      ...artifacts,
      { path: 'upload-manifest.json', kind: 'allowlist_manifest', media_type: 'application/json' },
    ],
  };
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return manifestPath;
}
