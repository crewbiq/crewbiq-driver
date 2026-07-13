import path from 'node:path';

import { writeRunArtifacts } from '../support/report.mjs';
import { redactString } from '../support/redact.mjs';

function referenceFor(attachment) {
  if (attachment.path) {
    return path.relative(process.cwd(), attachment.path).replaceAll('\\', '/');
  }
  return `inline:${attachment.name}`;
}

function evidenceFrom(attachments) {
  const evidence = {
    screenshots: [],
    traces: [],
    console: [],
    network: [],
    other: [],
  };

  for (const attachment of attachments) {
    const reference = referenceFor(attachment);
    const name = attachment.name.toLowerCase();
    if (name.includes('screenshot') || attachment.contentType.startsWith('image/')) {
      evidence.screenshots.push(reference);
    } else if (name.includes('trace')) {
      evidence.traces.push(reference);
    } else if (name.includes('console')) {
      evidence.console.push(reference);
    } else if (name.includes('network')) {
      evidence.network.push(reference);
    } else {
      evidence.other.push(reference);
    }
  }

  return Object.fromEntries(
    Object.entries(evidence).map(([kind, references]) => [kind, [...new Set(references)]]),
  );
}

function resultClass(status, intentionalFailure) {
  if (intentionalFailure && status === 'failed') return 'pass';
  if (status === 'passed') return 'pass';
  if (status === 'skipped') return 'not_run';
  if (status === 'timed_out' || status === 'interrupted') return 'environment_failure';
  return 'reproducible_defect';
}

export default class CrewBIQReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'artifacts/e2e';
    this.scenarios = [];
  }

  onBegin(config) {
    this.startedAt = new Date();
    this.project = config.projects[0];
  }

  onTestEnd(test, result) {
    const intentionalFailure = test.title.includes('@intentional-failure');
    const error = result.error && (result.error.message || result.error.stack);
    this.scenarios.push({
      id: test.title.split(' ')[0],
      title: test.title.replace(/^[^ ]+\s*/, '').replace(' @intentional-failure', ''),
      status: result.status,
      result_class: resultClass(result.status, intentionalFailure),
      expected_result: intentionalFailure
        ? 'The controlled assertion fails and the harness records failure evidence.'
        : 'The self-contained browser harness completes successfully.',
      actual_result: error ? redactString(error) : result.status,
      retry_count: result.retry,
      steps: [],
      evidence: evidenceFrom(result.attachments),
      intentional_failure: intentionalFailure,
    });
  }

  async onEnd(result) {
    const finishedAt = new Date();
    const viewport = this.project.use.viewport || { width: 1280, height: 720 };
    const artifact = {
      schema_version: '1.0.0',
      run_id: process.env.E2E_RUN_ID || `e2e-${this.startedAt.toISOString().replace(/[:.]/g, '-')}`,
      started_at: this.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      overall_status: result.status,
      environment: process.env.E2E_ENVIRONMENT || 'local',
      application: {
        repository: 'crewbiq/crewbiq-driver',
        commit: process.env.GITHUB_SHA || process.env.E2E_COMMIT || 'unverified-local',
        base_url: process.env.E2E_BASE_URL || 'self-contained-test-page',
      },
      tester: {
        tester_role: process.env.E2E_TESTER_ROLE || 'harness-self-test',
        application_role: process.env.E2E_APPLICATION_ROLE || 'none',
        tenant_aliases: (process.env.E2E_TENANT_ALIASES || '')
          .split(',')
          .map(value => value.trim())
          .filter(Boolean),
      },
      browser: {
        engine: this.project.name,
        profile: 'playwright-managed',
        viewport,
      },
      preconditions: [
        'No CrewBIQ account or production credential is used.',
        'The page and network response are synthetic and local to the test.',
      ],
      fixture_manifest_reference: null,
      scenarios: this.scenarios,
      cleanup_status: 'not_required',
      limitations: [
        'This harness self-test does not verify CrewBIQ product behavior.',
        'PostgreSQL, Orchestrator and production are not contacted.',
      ],
      report: {
        json: `${this.outputDir}/run.json`,
        markdown: `${this.outputDir}/report.md`,
      },
      redacted: true,
    };

    writeRunArtifacts(artifact, this.outputDir);
  }
}
