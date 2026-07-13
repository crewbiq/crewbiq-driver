/** CrewBIQ deduction policy modal placement compatibility v0.1.0 */
(function (global) {
  'use strict';

  function directActionRow(modal) {
    return Array.from(modal.querySelectorAll('div')).find(function (node) {
      return Array.from(node.children || []).some(function (child) {
        return child.matches && child.matches('button[onclick="saveDedModal()"]');
      });
    }) || null;
  }

  function install() {
    const modal = global.document && global.document.getElementById('dedModal');
    const context = global.document && global.document.getElementById('dedPolicyContext');
    const actionRow = modal && directActionRow(modal);
    if (context && actionRow && actionRow.parentNode && context.nextSibling !== actionRow) {
      actionRow.parentNode.insertBefore(context, actionRow);
    }

    const original = global.openAddDed;
    if (typeof original === 'function' && !original.__crewbiqDeductionPolicyUi) {
      const wrapped = function () {
        const policyContext = global.document.getElementById('dedPolicyContext');
        if (policyContext) policyContext.style.display = 'none';
        return original.apply(this, arguments);
      };
      wrapped.__crewbiqDeductionPolicyUi = true;
      global.openAddDed = wrapped;
    }
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { setTimeout(install, 0); });
    } else {
      setTimeout(install, 0);
    }
  }
})(window);
