import fs from 'node:fs';
import path from 'node:path';

import { redactValue } from './redact.mjs';

function markdownList(values) {
  return values.length ? values.map(value => `- ${value}`).join('\n') : '- None';
}
export function renderMarkdown(artifact) {
  const scenarios = artifact.scenarios.map(scenario => {
    const evidence = Object.entries(scenario.evidence)
      .map(([kind, references]) => `### ${kind}\n\n${markdownList(references)}`)
      .join('\n\n');
    return `## ${scenario.id}: ${scenario.title}

Status: ${scenario.status}

Finding classification: ${scenario.result_class}

Expected: ${scenario.expected_result || 'Not specified'}

Actual: ${scenario.actual_result || 'Not observed'}

${evidence}`;
  }).join('\n\n');

  return `# CrewBIQ Test Run ${artifact.run_id}

Status: ${artifact.overall_status}

Environment: ${artifact.environment}

Workflow commit: ${artifact.application.workflow_commit}

App/deployment commit: ${artifact.application.deployment_commit}

Tester role: ${artifact.tester.tester_role}

Application role and tenant aliases: ${artifact.tester.application_role}; ${artifact.tester.tenant_aliases.join(', ') || 'none'}

Browser/viewport: ${artifact.browser.engine}; ${artifact.browser.viewport.width}x${artifact.browser.viewport.height}

Evidence mode: ${artifact.evidence_policy.mode}

Text evidence redacted: ${artifact.evidence_policy.text_evidence_redacted}

Binary evidence safe: ${artifact.evidence_policy.binary_evidence_safe}

Binary evidence omitted: ${artifact.evidence_policy.binary_evidence_omitted}

## Preconditions

${markdownList(artifact.preconditions)}

## Scenarios

${scenarios}

## Cleanup

${artifact.cleanup_status}

## Limitations and unverified claims

${markdownList(artifact.limitations)}
`;
}

export function writeRunArtifacts(artifact, outputDir) {
  const safeArtifact = redactValue(artifact);
  fs.mkdirSync(outputDir, { recursive: true });
  const jsonPath = path.join(outputDir, 'run.json');
  const markdownPath = path.join(outputDir, 'report.md');
  fs.writeFileSync(jsonPath, `${JSON.stringify(safeArtifact, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderMarkdown(safeArtifact), 'utf8');
  return { jsonPath, markdownPath };
}
