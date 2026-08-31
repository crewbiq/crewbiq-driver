(function (global) {
  'use strict';

  const ERROR_CODES = Object.freeze({
    INVALID_SCOPE: 'invalid_scope',
    INVALID_PERIOD: 'invalid_period',
    SELF_NOT_LINKED: 'self_not_linked',
    SELF_AMBIGUOUS: 'self_ambiguous',
    SELF_UNAUTHORIZED: 'self_unauthorized',
  });
  const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
  const PERIODS = new Set(['today', 'week', 'month', 'quarter', 'custom']);

  function fail(code, message, details) {
    return { ok: false, code, message, details: details || {} };
  }

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function validDate(value) {
    if (!DATE_PATTERN.test(text(value))) return false;
    const date = new Date(text(value) + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text(value);
  }

  function addDays(value, amount) {
    const date = new Date(value + 'T00:00:00.000Z');
    date.setUTCDate(date.getUTCDate() + amount);
    return date.toISOString().slice(0, 10);
  }

  function validTimeZone(value) {
    if (!text(value)) return false;
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: text(value) }).format(0);
      return true;
    } catch (_error) {
      return false;
    }
  }

  function resolvePeriod(request) {
    request = request || {};
    const period = text(request.period || request.type).toLowerCase();
    const timeZone = text(request.timeZone);
    if (!PERIODS.has(period)) return fail(ERROR_CODES.INVALID_PERIOD, 'Unsupported analytics period', { period });
    if (!validTimeZone(timeZone)) return fail(ERROR_CODES.INVALID_PERIOD, 'An explicit valid IANA timeZone is required', { timeZone });

    let startInclusive;
    let endExclusive;
    if (period === 'custom') {
      startInclusive = text(request.dateFrom);
      endExclusive = text(request.dateTo);
      if (!validDate(startInclusive) || !validDate(endExclusive) || startInclusive >= endExclusive) {
        return fail(ERROR_CODES.INVALID_PERIOD, 'Custom range requires valid dateFrom < dateTo', {
          dateFrom: startInclusive,
          dateTo: endExclusive,
        });
      }
    } else {
      const referenceDate = text(request.referenceDate);
      if (!validDate(referenceDate)) {
        return fail(ERROR_CODES.INVALID_PERIOD, 'A valid local referenceDate is required', { referenceDate });
      }
      const parts = referenceDate.split('-').map(Number);
      if (period === 'today') {
        startInclusive = referenceDate;
        endExclusive = addDays(referenceDate, 1);
      } else if (period === 'week') {
        const weekday = new Date(referenceDate + 'T00:00:00.000Z').getUTCDay();
        startInclusive = addDays(referenceDate, -((weekday + 6) % 7));
        endExclusive = addDays(startInclusive, 7);
      } else if (period === 'month') {
        startInclusive = referenceDate.slice(0, 7) + '-01';
        const next = new Date(Date.UTC(parts[0], parts[1], 1));
        endExclusive = next.toISOString().slice(0, 10);
      } else {
        const quarterMonth = Math.floor((parts[1] - 1) / 3) * 3;
        startInclusive = new Date(Date.UTC(parts[0], quarterMonth, 1)).toISOString().slice(0, 10);
        endExclusive = new Date(Date.UTC(parts[0], quarterMonth + 3, 1)).toISOString().slice(0, 10);
      }
    }
    return {
      ok: true,
      period,
      startInclusive,
      endExclusive,
      timeZone,
      timeZoneSource: 'explicit_argument',
      calendar: period === 'week' ? 'iso_week_monday' : 'calendar',
    };
  }

  function normalizeLink(link, actor) {
    if (!link || text(link.accountId) !== text(actor.accountId) || text(link.workspaceId) !== text(actor.workspaceId)) return null;
    const proof = text(link.proof);
    const recordCrewId = text(link.recordCrewId);
    if (!recordCrewId) return null;
    if (proof === 'authenticated_driver_partition') {
      if (actor.role !== 'driver' || text(link.subjectIdSpace) !== 'account_crew_id') return null;
      if (text(link.subjectId) !== text(actor.crewId) || recordCrewId !== text(actor.crewId)) return null;
      return {
        proof,
        subjectId: text(link.subjectId),
        subjectIdSpace: 'account_crew_id',
        driverProfileId: null,
        recordCrewId,
        currentTruckId: text(link.currentTruckId) || null,
      };
    }
    if (proof === 'canonical_account_driver_link') {
      const driverProfileId = text(link.driverProfileId);
      if (!driverProfileId) return null;
      return {
        proof,
        subjectId: driverProfileId,
        subjectIdSpace: 'driver_profile_id',
        driverProfileId,
        recordCrewId,
        currentTruckId: text(link.currentTruckId) || null,
      };
    }
    return null;
  }

  function resolveSelfScope(input) {
    input = input || {};
    const scope = input.scope || {};
    const actor = input.actor || {};
    if (scope.type !== 'self' || !text(scope.workspaceId) || scope.driverId != null || scope.truckId != null) {
      return fail(ERROR_CODES.INVALID_SCOPE, 'Only an un-narrowed SELF scope is supported', { type: scope.type });
    }
    if (!actor.authenticated || actor.authorized === false || !text(actor.accountId) || !text(actor.workspaceId) || text(actor.workspaceId) !== text(scope.workspaceId)) {
      return fail(ERROR_CODES.SELF_UNAUTHORIZED, 'Authenticated actor is not authorized for this workspace', { workspaceId: text(scope.workspaceId) });
    }
    const candidates = [];
    const seen = new Set();
    (Array.isArray(input.links) ? input.links : []).forEach(function (link) {
      const normalized = normalizeLink(link, actor);
      if (!normalized) return;
      const key = [normalized.subjectIdSpace, normalized.subjectId, normalized.recordCrewId].join('|');
      if (!seen.has(key)) { seen.add(key); candidates.push(normalized); }
    });
    if (!candidates.length) return fail(ERROR_CODES.SELF_NOT_LINKED, 'No proven Driver SELF link exists for this account', {});
    if (candidates.length > 1) return fail(ERROR_CODES.SELF_AMBIGUOUS, 'More than one proven Driver SELF link exists', { candidateCount: candidates.length });
    const subject = candidates[0];
    return {
      ok: true,
      scope: { type: 'self', workspaceId: text(scope.workspaceId) },
      subject,
    };
  }

  function recordDate(record) {
    const value = text(record && (record.pickup || record.date));
    return validDate(value) ? value : '';
  }

  function recordId(record) {
    return text(record && (record.id || record.record_id || record.loadId || record.key));
  }

  function inPeriod(date, period) {
    return !!date && date >= period.startInclusive && date < period.endExclusive;
  }

  function createAnalyticsSnapshot(input) {
    input = input || {};
    const resolvedScope = resolveSelfScope(input);
    if (!resolvedScope.ok) return resolvedScope;
    const period = resolvePeriod(input.period);
    if (!period.ok) return period;
    const subject = resolvedScope.subject;
    const partition = input.partition || {};
    const partitionProven = partition.proof === 'canonical_account_partition' && text(partition.ownerCrewId) === subject.recordCrewId;
    const records = [];
    const excluded = [];
    const warnings = new Set();
    const missingFields = new Set();

    (Array.isArray(input.loads) ? input.loads : []).forEach(function (source, index) {
      if (!source || typeof source !== 'object') return;
      const date = recordDate(source);
      if (!inPeriod(date, period)) return;
      const sourceCrewId = text(source.crewId);
      const exact = sourceCrewId && sourceCrewId === subject.recordCrewId;
      const byPartition = !sourceCrewId && partitionProven;
      if (!exact && !byPartition) {
        excluded.push({ index, recordId: recordId(source) || null, reason: sourceCrewId ? 'different_driver_identity' : 'unproven_attribution' });
        warnings.add('records_excluded_unproven_attribution');
        return;
      }
      if (byPartition) warnings.add('record_identity_proven_by_partition');
      const id = recordId(source);
      if (!id) { missingFields.add('load.recordId'); warnings.add('record_provenance_unavailable'); }
      records.push({
        id: id || null,
        date,
        crewId: sourceCrewId || null,
        truckId: text(source.truckId) || null,
        status: text(source.status) || 'active',
        gross: Number.isFinite(Number(source.gross)) && source.gross !== '' && source.gross != null ? Number(source.gross) : null,
        loadedMiles: Number.isFinite(Number(source.loadedMiles)) && source.loadedMiles !== '' && source.loadedMiles != null ? Number(source.loadedMiles) : null,
        deadheadMiles: Number.isFinite(Number(source.deadMiles)) && source.deadMiles !== '' && source.deadMiles != null ? Number(source.deadMiles) : null,
        attribution: exact ? 'record_crew_id' : 'canonical_account_partition',
      });
    });

    return {
      ok: true,
      scope: resolvedScope.scope,
      subject: {
        subjectId: subject.subjectId,
        subjectIdSpace: subject.subjectIdSpace,
        driverId: subject.driverProfileId,
        recordCrewId: subject.recordCrewId,
        proof: subject.proof,
        currentTruckId: subject.currentTruckId,
      },
      period,
      records,
      excludedRecords: excluded,
      dataQuality: {
        complete: !warnings.size && !missingFields.size,
        missingFields: Array.from(missingFields).sort(),
        warnings: Array.from(warnings).sort(),
        attribution: excluded.length ? 'partial' : 'proven',
      },
    };
  }

  function availableSum(records, field, missingFields) {
    if (records.some(function (record) { return record[field] == null; })) {
      missingFields.add('load.' + field);
      return { available: false, value: null };
    }
    return { available: true, value: records.reduce(function (sum, record) { return sum + record[field]; }, 0) };
  }

  function getDashboardMetrics(snapshot) {
    if (!snapshot || !snapshot.ok) return snapshot || fail(ERROR_CODES.INVALID_SCOPE, 'Valid analytics snapshot required', {});
    const missingFields = new Set(snapshot.dataQuality.missingFields);
    const warnings = new Set(snapshot.dataQuality.warnings);
    const grossRecords = snapshot.records.filter(function (record) { return record.status !== 'cancel' && record.status !== 'disputed'; });
    const mileageRecords = snapshot.records.filter(function (record) { return record.status !== 'cancel'; });
    const gross = availableSum(grossRecords, 'gross', missingFields);
    const loaded = availableSum(mileageRecords, 'loadedMiles', missingFields);
    const deadhead = availableSum(mileageRecords, 'deadheadMiles', missingFields);
    warnings.add('rpm_definition_unapproved');
    if (!snapshot.subject.currentTruckId) warnings.add('current_truck_unavailable');
    return {
      ok: true,
      scope: snapshot.scope,
      period: snapshot.period,
      driverId: snapshot.subject.driverId,
      subjectId: snapshot.subject.subjectId,
      subjectIdSpace: snapshot.subject.subjectIdSpace,
      gross: gross.value,
      loadCount: mileageRecords.length,
      loadedMiles: loaded.value,
      deadheadMiles: deadhead.value,
      rpm: null,
      currentTruckId: snapshot.subject.currentTruckId,
      availability: {
        gross: gross.available ? 'available' : 'unavailable',
        loadedMiles: loaded.available ? 'available' : 'unavailable',
        deadheadMiles: deadhead.available ? 'available' : 'unavailable',
        rpm: 'unavailable',
        currentTruckId: snapshot.subject.currentTruckId ? 'available' : 'unavailable',
      },
      dataQuality: {
        complete: !warnings.size && !missingFields.size,
        missingFields: Array.from(missingFields).sort(),
        warnings: Array.from(warnings).sort(),
        attribution: snapshot.dataQuality.attribution,
      },
    };
  }

  function groupByDate(records) {
    const groups = new Map();
    records.forEach(function (record) {
      if (!groups.has(record.date)) groups.set(record.date, []);
      groups.get(record.date).push(record);
    });
    return Array.from(groups.entries()).sort(function (a, b) { return a[0].localeCompare(b[0]); });
  }

  function idsFor(records) {
    return Array.from(new Set(records.map(function (record) { return record.id; }).filter(Boolean)));
  }

  function getEarningsSeries(snapshot) {
    if (!snapshot || !snapshot.ok) return snapshot || fail(ERROR_CODES.INVALID_SCOPE, 'Valid analytics snapshot required', {});
    const records = snapshot.records.filter(function (record) { return record.status !== 'cancel' && record.status !== 'disputed'; });
    const points = groupByDate(records).map(function (entry) {
      const available = entry[1].every(function (record) { return record.gross != null; });
      return {
        date: entry[0],
        value: available ? entry[1].reduce(function (sum, record) { return sum + record.gross; }, 0) : null,
        availability: available ? 'available' : 'unavailable',
        relatedRecordIds: idsFor(entry[1]),
      };
    });
    return { ok: true, metric: 'gross', period: snapshot.period, points };
  }

  function getMileageSeries(snapshot) {
    if (!snapshot || !snapshot.ok) return snapshot || fail(ERROR_CODES.INVALID_SCOPE, 'Valid analytics snapshot required', {});
    const records = snapshot.records.filter(function (record) { return record.status !== 'cancel'; });
    const points = groupByDate(records).map(function (entry) {
      const loadedAvailable = entry[1].every(function (record) { return record.loadedMiles != null; });
      const deadheadAvailable = entry[1].every(function (record) { return record.deadheadMiles != null; });
      return {
        date: entry[0],
        loadedMiles: loadedAvailable ? entry[1].reduce(function (sum, record) { return sum + record.loadedMiles; }, 0) : null,
        deadheadMiles: deadheadAvailable ? entry[1].reduce(function (sum, record) { return sum + record.deadheadMiles; }, 0) : null,
        availability: loadedAvailable && deadheadAvailable ? 'available' : 'partial',
        relatedRecordIds: idsFor(entry[1]),
      };
    });
    return { ok: true, metric: 'mileage', period: snapshot.period, points };
  }

  function createDriverSelfAnalytics(input) {
    const snapshot = createAnalyticsSnapshot(input);
    if (!snapshot.ok) return snapshot;
    return {
      ok: true,
      snapshot,
      metrics: getDashboardMetrics(snapshot),
      earningsSeries: getEarningsSeries(snapshot),
      mileageSeries: getMileageSeries(snapshot),
    };
  }

  global.CrewBIQAnalytics = Object.freeze({
    ERROR_CODES,
    resolvePeriod,
    resolveSelfScope,
    createAnalyticsSnapshot,
    getDashboardMetrics,
    getEarningsSeries,
    getMileageSeries,
    createDriverSelfAnalytics,
  });
})(typeof window !== 'undefined' ? window : globalThis);
