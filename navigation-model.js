(function (global) {
  'use strict';
  const ROLE_CONFIG = {
    driver:{label:'Driver',icon:'🚛',desc:'Load tracking, PTI, expenses, sync',menu:[
      {page:'load',icon:'📦',label:'Loads'},{page:'report',icon:'📄',label:'Reports'},{page:'expenses',icon:'💳',label:'Expenses'},
      {page:'scan',icon:'📷',label:'Scan'},{page:'disputes',icon:'⚖️',label:'Disputes'},{page:'pti',icon:'🔍',label:'PTI'},
      {page:'stats',icon:'📈',label:'Stats'},{page:'community',icon:'🔗',label:'Links'},{page:'settings',icon:'⚙️',label:'Settings'}]},
    owner_op:{label:'Owner-Op',icon:'🏢',desc:'Driver + fuel, deductions, service fund, P&L',menu:[
      {page:'load',icon:'📦',label:'Loads'},{page:'report',icon:'📄',label:'Reports'},{page:'expenses',icon:'💳',label:'Expenses'},
      {page:'scan',icon:'📷',label:'Scan'},{page:'fuel',icon:'⛽',label:'Fuel'},{page:'deductions',icon:'💰',label:'Deductions'},
      {page:'service',icon:'🔧',label:'Service'},{page:'disputes',icon:'⚖️',label:'Disputes'},{page:'pti',icon:'🔍',label:'PTI'},
      {page:'stats',icon:'📈',label:'Stats'},{page:'community',icon:'🔗',label:'Links'},{page:'settings',icon:'⚙️',label:'Settings'}]},
    fleet:{label:'Fleet',icon:'🚚',desc:'Owner-Op + fleet dashboard, multi-truck, drivers',menu:[
      {page:'load',icon:'📦',label:'Loads'},{page:'fleet',icon:'🚚',label:'Fleet'},{page:'drivers',icon:'👥',label:'Drivers'},
      {page:'report',icon:'📄',label:'Reports'},{page:'expenses',icon:'💳',label:'Expenses'},{page:'scan',icon:'📷',label:'Scan'},
      {page:'fuel',icon:'⛽',label:'Fuel'},{page:'deductions',icon:'💰',label:'Deductions'},{page:'service',icon:'🔧',label:'Service'},
      {page:'disputes',icon:'⚖️',label:'Disputes'},{page:'pti',icon:'🔍',label:'PTI'},{page:'stats',icon:'📈',label:'Stats'},
      {page:'community',icon:'🔗',label:'Links'},{page:'settings',icon:'⚙️',label:'Settings'}]}
  };
  const FUNCTION_GROUPS = [
    {label:'Work',items:[{page:'load',icon:'📦',label:'Loads'},{page:'disputes',icon:'⚖️',label:'Exceptions'},{page:'scan',icon:'📄',label:'Documents'}]},
    {label:'Truck',items:[{page:'pti',icon:'🔍',label:'Inspections'},{page:'fuel',icon:'⛽',label:'Fuel',minRole:'owner_op'},{page:'service',icon:'🔧',label:'Maintenance',minRole:'owner_op'}]},
    {label:'Money',items:[{page:'expenses',icon:'💳',label:'Expenses'},{page:'report',icon:'📄',label:'Reports'},{page:'stats',icon:'📈',label:'Performance'},{page:'deductions',icon:'💰',label:'Deductions',minRole:'owner_op'}]},
    {label:'Team',roles:['fleet'],items:[{page:'fleet',icon:'🚚',label:'Fleet overview'},{page:'drivers',icon:'👥',label:'Drivers'}]},
    {label:'Resources & account',items:[{page:'community',icon:'🔗',label:'Links'},{page:'settings',icon:'⚙️',label:'Settings'}]}
  ];
  const ROLE_RANK = {driver:0,owner_op:1,fleet:2};
  const PRIMARY_NAV_PAGES = ['home','work','truck','team','money'];
  const PAGE_REGISTRY = {
    home:{classification:'ACTIVE'},load:{classification:'ACTIVE'},pti:{classification:'ACTIVE'},stats:{classification:'ACTIVE'},settings:{classification:'ACTIVE'},
    report:{classification:'ACTIVE'},disputes:{classification:'ACTIVE'},fuel:{classification:'ACTIVE'},deductions:{classification:'ACTIVE'},service:{classification:'ACTIVE'},
    fleet:{classification:'ACTIVE'},drivers:{classification:'ACTIVE'},marketplace:{classification:'ORPHANED'},community:{classification:'ACTIVE',technicalContainer:true},
    expenses:{classification:'ACTIVE'},scan:{classification:'ACTIVE'},work:{classification:'ACTIVE',technicalContainer:true},truck:{classification:'ACTIVE',technicalContainer:true},
    money:{classification:'ACTIVE',technicalContainer:true},team:{classification:'ACTIVE',technicalContainer:true},menu:{classification:'LEGACY_CONTAINER',technicalContainer:true}
  };
  function roleConfig(role){ return ROLE_CONFIG[role] || ROLE_CONFIG.driver; }
  function visibleFunctionGroups(role){
    return FUNCTION_GROUPS.filter(function(group){ return !group.roles || group.roles.includes(role); }).map(function(group){
      return {label:group.label,roles:group.roles,items:group.items.filter(function(item){ return !item.minRole || ROLE_RANK[role] >= ROLE_RANK[item.minRole]; })};
    }).filter(function(group){ return group.items.length; });
  }
  function roleMenuTargets(role){ return roleConfig(role).menu.map(function(item){ return item.page; }); }
  function groupedTargets(role){ return visibleFunctionGroups(role).flatMap(function(group){ return group.items.map(function(item){ return item.page; }); }); }
  function bottomDestinationsForRole(role){ return role === 'fleet' ? ['home','work','team','money'] : ['home','work','truck','money']; }
  function primaryDestinationForPage(name,role){
    if(['load','disputes','work'].includes(name)) return 'work';
    if(['pti','fuel','service','truck'].includes(name)) return role === 'fleet' ? 'team' : 'truck';
    if(['expenses','deductions','report','stats','money'].includes(name)) return 'money';
    if(['fleet','drivers','team'].includes(name)) return 'team';
    return name === 'home' ? 'home' : '';
  }
  const api = {ROLE_CONFIG,FUNCTION_GROUPS,ROLE_RANK,PRIMARY_NAV_PAGES,PAGE_REGISTRY,roleConfig,visibleFunctionGroups,roleMenuTargets,groupedTargets,bottomDestinationsForRole,primaryDestinationForPage};
  global.CrewBIQNavigationModel = api;
  global.ROLE_CONFIG = ROLE_CONFIG;
  global.FUNCTION_GROUPS = FUNCTION_GROUPS;
  global.ROLE_RANK = ROLE_RANK;
})(window);
