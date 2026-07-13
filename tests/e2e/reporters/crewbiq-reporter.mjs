import path from 'node:path';

import {
  publishScenarioAttachments,
  resetUploadDirectory,
  resolveEvidencePolicy,
  writeUploadManifest,
} from '../support/evidence.mjs';
import { writeRunArtifacts } from '../support/report.mjs';
import { redactString } from '../support/redact.mjs';

function resultClass(status, intentionalFailure) {
  if (intentionalFailure && status === 'failed') return 'pass';
  if (status === 'passed') return 'pass';
  if (status === 'skipped') return 'not_run';
  if (status === 'timed_out' || status === 'interrupted') return 'environment_failure';
  return 'reproducible_defect';
}

function annotations(test, type) {
  return (test.annotations || [])
    .filter(item => item.type === type)
    .map(item => item.description)
    .filter(Boolean);
}

export function reportedOverallStatus(runStatus, scenarios) {
  return scenarios.length > 0 && scenarios.every(scenario => scenario.result_class === 'not_run')
    ? 'not_run'
    : runStatus;
}

export default class CrewBIQReporter {
  constructor(options = {}) {
    this.outputDir = options.outputDir || 'artifacts/e2e';
    this.uploadDir = path.join(this.outputDir, 'upload');
    this.uploadReference = this.uploadDir.replaceAll('\\', '/');
    this.evidencePolicy = resolveEvidencePolicy();
    this.scenarios = [];
  }

  onBegin(config) {
    this.startedAt = new Date();
    this.project = config.projects[0];
  }

  onTestEnd(test, result) {
    const intentionalFailure = test.title.includes('@intentional-failure');
    const error = result.error && (result.error.message || result.error.stack);
    const expected = annotations(test, 'expected_result')[0];
    const skippedReason = annotations(test, 'skip').at(-1);
    this.scenarios.push({
      id: test.title.split(' ')[0],
      title: test.title.replace(/^[^ ]+\s*/, '').replace(' @intentional-failure', ''),
      status: result.status,
      result_class: resultClass(result.status, intentionalFailure),
      expected_result: expected || (intentionalFailure
        ? 'The controlled assertion fails and the harness records failure evidence.'
        : 'The self-contained browser harness completes successfully.'),
      actual_result: error ? redactString(error) : (skippedReason || result.status),
      retry_count: result.retry,
      steps: annotations(test, 'step'),
      attachments: result.attachments,
      intentional_failure: intentionalFailure,
    });
  }

  async onEnd(result) {
    resetUploadDirectory(this.uploadDir);
    const publishedArtifacts = [];
    this.scenarios = this.scenarios.map(scenario => {
      const { attachments, ...reportableScenario } = scenario;
      const published = publishScenarioAttachments({
        attachments,
        uploadDir: this.uploadDir,
        scenarioId: scenario.id,
        policy: this.evidencePolicy,
      });
      publishedArtifacts.push(...published.artifacts);
      return { ...reportableScenario, evidence: published.evidence };
    });

    const finishedAt = new Date();
    const viewport = this.project.use.viewport || { width: 1280, height: 720 };
    const authenticatedRun = this.evidencePolicy.sensitive_run;
    const overallStatus = reportedOverallStatus(result.status, this.scenarios);
    const artifact = {
      schema_version: '1.0.0',
      run_id: process.env.E2E_RUN_ID || `e2e-${this.startedAt.toISOString().replace(/[:.]/g, '-')}`,
      started_at: this.startedAt.toISOString(),
      finished_at: finishedAt.toISOString(),
      overall_status: overallStatus,
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
      preconditions: authenticatedRun ? [
        'The run requires an explicit staging/test environment and allowlisted hosts.',
        'Credentials are supplied at runtime and are not written to evidence.',
        'Every scenario starts in an independent Playwright browser context.',
        'Screenshots and traces are disabled for this authenticated run.',
      ] : [
        'No CrewBIQ account or production credential is used.',
        'The page and network response are synthetic and local to the test.',
      ],
      fixture_manifest_reference: authenticatedRun
        ? path.basename(process.env.E2E_FIXTURE_MANIFEST_PATH || '') || null
        : null,
      scenarios: this.scenarios,
      cleanup_status: overallStatus === 'not_run'
        ? 'not_run'
        : (authenticatedRun ? (result.status === 'passed' ? 'complete' : 'incomplete') : 'not_required'),
      limitations: authenticatedRun ? [
        'Reusable E2E identities and manifest-owned fixtures are intentionally retained.',
        'Scenarios attempt to revoke only the sessions they create.',
      ] : [
        'This harness self-test does not verify CrewBIQ product behavior.',
        'PostgreSQL, Orchestrator and production are not contacted.',
      ],
      evidence_policy: {
        ...this.evidencePolicy,
        allowlist_manifest: `${this.uploadReference}/upload-manifest.json`,
      },
      report: {
        json: `${this.uploadReference}/run.json`,
        markdown: `${this.uploadReference}/report.md`,
      },
    };

    writeRunArtifacts(artifact, this.uploadDir);
    writeUploadManifest(this.uploadDir, this.evidencePolicy, publishedArtifacts);
  }
}
