/**
 * CrewBIQ Fleet-Load Resolution v0.1.0
 *
 * Pure functional module for resolving fleet loads to trucks.
 * No external dependencies, no mutations of inputs.
 */
(function (global) {
  'use strict';

  var VERSION = '0.1.0';

  function normalizeFleetLookupValue(value) {
    return String(value == null ? '' : value).trim().toLowerCase();
  }

  function identityValues(record) {
    return {
      driverProfileId: normalizeFleetLookupValue(record.driverProfileId),
      driver_profile_id: normalizeFleetLookupValue(record.driver_profile_id),
      driverId: normalizeFleetLookupValue(record.driverId),
      driver_id: normalizeFleetLookupValue(record.driver_id),
      crewId: normalizeFleetLookupValue(record.crewId),
      crew_id: normalizeFleetLookupValue(record.crew_id),
      driverRef: normalizeFleetLookupValue(record.driverRef),
      driver_ref: normalizeFleetLookupValue(record.driver_ref),
      driverEmail: normalizeFleetLookupValue(record.driverEmail),
      driver_email: normalizeFleetLookupValue(record.driver_email),
      email: normalizeFleetLookupValue(record.email)
    };
  }

  function collectIdSet() {
    var result = [];
    for (var i = 0; i < arguments.length; i++) {
      var val = arguments[i];
      if (val != null) {
        var trimmed = String(val).trim();
        if (trimmed !== '') {
          result.push(trimmed);
        }
      }
    }
    return result;
  }

  function buildUnitSet() {
    var result = [];
    for (var i = 0; i < arguments.length; i++) {
      var val = arguments[i];
      if (val != null) {
        var trimmed = String(val).trim();
        if (trimmed !== '') {
          result.push(trimmed.toLowerCase());
        }
      }
    }
    return result;
  }

  function resolveLoadToTruck(record, trucks, driverProfiles) {
    if (!record || !Array.isArray(trucks) || !Array.isArray(driverProfiles)) {
      return null;
    }

    // Active trucks only
    var activeTrucks = [];
    for (var ti = 0; ti < trucks.length; ti++) {
      var t = trucks[ti];
      if (t && t.active !== false) {
        activeTrucks.push(t);
      }
    }

    // Helper: find active trucks by normalized id (assumes unique id field)
    function findTruckByNormalizedId(normalizedId) {
      var candidates = [];
      for (var i = 0; i < activeTrucks.length; i++) {
        var tid = activeTrucks[i].id;
        if (tid != null && normalizeFleetLookupValue(tid) === normalizedId) {
          candidates.push(activeTrucks[i]);
        }
      }
      if (candidates.length === 1) {
        return candidates[0];
      }
      return null; // zero or multiple -> ambiguous
    }

    // Helper: find active truck by unit (normalized)
    function findTruckByUnit(normalizedUnit) {
      var candidates = [];
      for (var i = 0; i < activeTrucks.length; i++) {
        var unit = activeTrucks[i].unitNumber || activeTrucks[i].unit_number || activeTrucks[i].truckUnit || activeTrucks[i].truck_unit;
        if (unit != null && normalizeFleetLookupValue(unit) === normalizedUnit) {
          candidates.push(activeTrucks[i]);
        }
      }
      if (candidates.length === 1) {
        return candidates[0];
      }
      return null;
    }

    // Collect truck IDs from record and all three payload envelopes independently
    function getDirectTruckIds(obj) {
      var ids = [];
      if (obj) {
        ids = ids.concat(collectIdSet(obj.truckId, obj.truck_id));
      }
      return ids;
    }

    var directIds = [];
    directIds = directIds.concat(getDirectTruckIds(record));
    directIds = directIds.concat(getDirectTruckIds(record.rawPayload));
    directIds = directIds.concat(getDirectTruckIds(record.raw_payload));
    directIds = directIds.concat(getDirectTruckIds(record.payload));

    if (directIds.length > 0) {
      // Deduplicate normalized
      var normalizedDirect = [];
      for (var di = 0; di < directIds.length; di++) {
        var norm = normalizeFleetLookupValue(directIds[di]);
        if (norm !== '' && normalizedDirect.indexOf(norm) === -1) {
          normalizedDirect.push(norm);
        }
      }
      if (normalizedDirect.length > 0) {
        var matchedTruck = null;
        for (var ni = 0; ni < normalizedDirect.length; ni++) {
          var truckForId = findTruckByNormalizedId(normalizedDirect[ni]);
          if (truckForId === null) {
            return null;
          }
          if (matchedTruck === null) {
            matchedTruck = truckForId;
          } else if (matchedTruck !== truckForId) {
            return null;
          }
        }
        if (matchedTruck !== null) {
          return matchedTruck;
        }
      }
    }

    // Unit tier
    function getUnitValues(obj) {
      var units = [];
      if (obj) {
        units = units.concat(buildUnitSet(obj.unitNumber, obj.unit_number, obj.truckUnit, obj.truck_unit));
      }
      return units;
    }

    var unitValues = [];
    unitValues = unitValues.concat(getUnitValues(record));
    unitValues = unitValues.concat(getUnitValues(record.rawPayload));
    unitValues = unitValues.concat(getUnitValues(record.raw_payload));
    unitValues = unitValues.concat(getUnitValues(record.payload));

    // Deduplicate normalized units
    var normalizedUnits = [];
    for (var ui = 0; ui < unitValues.length; ui++) {
      var uNorm = normalizeFleetLookupValue(unitValues[ui]);
      if (uNorm !== '' && normalizedUnits.indexOf(uNorm) === -1) {
        normalizedUnits.push(uNorm);
      }
    }

    if (normalizedUnits.length > 0) {
      // All distinct normalized units must be identical
      var firstUnit = normalizedUnits[0];
      for (var nu = 1; nu < normalizedUnits.length; nu++) {
        if (normalizedUnits[nu] !== firstUnit) {
          return null;
        }
      }
      return findTruckByUnit(firstUnit);
    }

    // Identity tier
    function collectProfileIdentities(obj, keys) {
      var vals = {};
      for (var i = 0; i < keys.length; i++) {
        if (obj) {
          var val = obj[keys[i]];
          if (val != null && String(val).trim() !== '') {
            vals[normalizeFleetLookupValue(val)] = true;
          }
        }
      }
      return vals;
    }

    var recordIdentityKeys = ['driverProfileId', 'driver_profile_id', 'driverId', 'driver_id', 'crewId', 'crew_id', 'driverRef', 'driver_ref', 'driverEmail', 'driver_email', 'email'];
    var recordIdentities = {};
    var sources = [record, record.rawPayload, record.raw_payload, record.payload];
    for (var si = 0; si < sources.length; si++) {
      var src = sources[si];
      var srcIdents = collectProfileIdentities(src, recordIdentityKeys);
      for (var key in srcIdents) {
        if (srcIdents.hasOwnProperty(key)) {
          recordIdentities[key] = true;
        }
      }
    }

    var profileIdentityKeys = ['id', 'driver_profile_id', 'driverId', 'driver_id', 'crewId', 'crew_id', 'email'];
    var matchingProfiles = [];
    for (var pi = 0; pi < driverProfiles.length; pi++) {
      var profile = driverProfiles[pi];
      if (!profile || profile.active === false) continue;
      // Collect non-empty identities for this profile
      var profileIdents = {};
      for (var pk = 0; pk < profileIdentityKeys.length; pk++) {
        var pVal = profile[profileIdentityKeys[pk]];
        if (pVal != null && String(pVal).trim() !== '') {
          profileIdents[normalizeFleetLookupValue(pVal)] = true;
        }
      }
      // Check intersection
      var hasMatch = false;
      for (var ri in recordIdentities) {
        if (recordIdentities.hasOwnProperty(ri) && profileIdents.hasOwnProperty(ri)) {
          hasMatch = true;
          break;
        }
      }
      if (hasMatch) {
        matchingProfiles.push(profile);
      }
    }

    if (matchingProfiles.length !== 1) {
      return null;
    }

    var matchedProfile = matchingProfiles[0];
    // Collect truckId and truck_id from profile
    var linkedIds = [];
    var ptId = matchedProfile.truckId;
    var ptId2 = matchedProfile.truck_id;
    if (ptId != null && String(ptId).trim() !== '') {
      linkedIds.push(normalizeFleetLookupValue(ptId));
    }
    if (ptId2 != null && String(ptId2).trim() !== '') {
      linkedIds.push(normalizeFleetLookupValue(ptId2));
    }

    // Deduplicate
    var uniqueLinked = [];
    for (var li = 0; li < linkedIds.length; li++) {
      if (linkedIds[li] !== '' && uniqueLinked.indexOf(linkedIds[li]) === -1) {
        uniqueLinked.push(linkedIds[li]);
      }
    }

    if (uniqueLinked.length !== 1) {
      return null;
    }

    var linkedId = uniqueLinked[0];
    var linkedTruck = findTruckByNormalizedId(linkedId);
    if (linkedTruck === null) {
      return null;
    }
    return linkedTruck;
  }

  function unassignedFleetLoads(records, trucks, driverProfiles) {
    if (!Array.isArray(records)) return [];
    var result = [];
    for (var i = 0; i < records.length; i++) {
      if (resolveLoadToTruck(records[i], trucks, driverProfiles) === null) {
        result.push(records[i]);
      }
    }
    return result;
  }

  var module = global.CrewBIQFleetLoadResolution || {};
  module.version = VERSION;
  module.normalizeFleetLookupValue = normalizeFleetLookupValue;
  module.resolveLoadToTruck = resolveLoadToTruck;
  module.unassignedFleetLoads = unassignedFleetLoads;
  global.CrewBIQFleetLoadResolution = module;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
