(function(global){
  'use strict';

  function text(value){ return String(value == null ? '' : value).trim(); }
  function codeOf(result){ return text(result && (result.code || result.reason || result.error)).toLowerCase(); }
  function unavailableCode(code){ return code.includes('unauthor') || code.includes('forbidden') ? 'unauthorized' : 'unavailable'; }
  function failedState(result, notLinked){
    const code=codeOf(result);
    if(code.includes('ambiguous') || code.includes('multiple')) return {status:'ambiguous'};
    if(notLinked && (code.includes('not_found') || code.includes('not-linked') || code.includes('not_linked') || code.includes('no_link'))) return {status:'not_linked'};
    return {status:unavailableCode(code)};
  }
  function linkFrom(result){ return result && (result.proof || result.link || result.accountDriverLink || result.account_driver_link); }
  function assignmentFrom(result){ return result && (result.assignment || result.currentAssignment || result.current_assignment); }

  function create(deps){
    deps=deps || {};
    if(typeof deps.readAccountDriverLink !== 'function' || typeof deps.readCurrentAssignment !== 'function'){
      throw new Error('Canonical Driver SELF readers are required');
    }
    async function read(input){
      input=input || {};
      const sessionToken=text(input.sessionToken);
      const workspaceId=text(input.workspaceId);
      const accountId=text(input.accountId);
      if(!sessionToken || !workspaceId || !accountId) return {status:'unavailable'};

      let linkResult;
      try{
        linkResult=await deps.readAccountDriverLink({sessionToken, workspaceId, accountId, effectiveAt:input.effectiveAt});
      }catch(e){ return {status:'unavailable'}; }
      if(!linkResult || linkResult.ok !== true) return failedState(linkResult, true);
      const link=linkFrom(linkResult);
      const driverId=text(link && link.driverId);
      if(!link || text(link.workspaceId)!==workspaceId || text(link.accountId)!==accountId || !driverId) return {status:'ambiguous'};

      let assignmentResult;
      try{
        assignmentResult=await deps.readCurrentAssignment({sessionToken, workspaceId, driverId});
      }catch(e){ return {status:'unavailable'}; }
      if(!assignmentResult || assignmentResult.ok !== true){
        const failed=failedState(assignmentResult, false);
        const code=codeOf(assignmentResult);
        if(code.includes('not_found') || code.includes('no_current') || code.includes('not-assigned') || code.includes('not_assigned')){
          return {status:'success', workspaceId, accountId, driverId, truckId:'', assignment:null};
        }
        return failed;
      }
      const assignment=assignmentFrom(assignmentResult);
      if(!assignment) return {status:'success', workspaceId, accountId, driverId, truckId:'', assignment:null};
      if(text(assignment.workspaceId)!==workspaceId || text(assignment.driverId)!==driverId) return {status:'ambiguous'};
      const truckId=text(assignment.truckId);
      if(!truckId) return {status:'ambiguous'};
      return {status:'success', workspaceId, accountId, driverId, truckId, assignment};
    }
    return Object.freeze({read});
  }

  global.CrewBIQDriverSelf=Object.freeze({create});
})(typeof window !== 'undefined' ? window : globalThis);
