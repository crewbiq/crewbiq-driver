(function (global) {
  'use strict';

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const ANALYTICS_DATA = {
    driver: [
      {id:'driver-earnings',kind:'line',title:'Earnings by day',question:'When did this week earn the most?',period:'This week',format:'currency',series:[{key:'gross',label:'Gross earnings',color:'#60a5fa',values:[420,680,510,920,760,1180,950]}]},
      {id:'driver-miles',kind:'line',title:'Miles driven',question:'How much of each day was revenue-generating?',period:'Sun–Sat',format:'miles',series:[{key:'loaded',label:'Loaded',color:'#3b82f6',values:[310,455,380,520,465,610,0]},{key:'deadhead',label:'Deadhead',color:'#f7b955',values:[42,68,35,81,54,38,0]}]}
    ],
    owner_op: [
      {id:'owner-revenue-net',kind:'line',title:'Revenue / Net',question:'How much revenue became take-home value?',period:'This week',format:'currency',series:[{key:'revenue',label:'Revenue',color:'#60a5fa',values:[760,1120,880,1460,1210,1580,830]},{key:'net',label:'Net',color:'#2dd4a0',values:[390,610,420,790,645,820,410]}]},
      {id:'owner-miles',kind:'line',title:'Loaded vs deadhead',question:'Where is utilization leaking margin?',period:'Sun–Sat',format:'miles',series:[{key:'loaded',label:'Loaded',color:'#3b82f6',values:[355,490,410,565,520,620,280]},{key:'deadhead',label:'Deadhead',color:'#f7b955',values:[48,72,41,88,63,36,22]}]},
      {id:'owner-fuel-cost',kind:'bar',title:'Fuel cost per mile',question:'Is fuel efficiency improving through the week?',period:'This week',format:'costPerMile',series:[{key:'fuelCost',label:'Cost / mi',color:'#a78bfa',values:[.56,.54,.58,.51,.49,.47,.52]}]}
    ],
    fleet: [
      {id:'fleet-gross',kind:'line',title:'Fleet gross',question:'How is fleet revenue pacing this week?',period:'This week',format:'compactCurrency',series:[{key:'gross',label:'Fleet gross',color:'#60a5fa',values:[8400,10200,9600,11800,10900,12400,5100]}]},
      {id:'fleet-utilization',kind:'bar',title:'Fleet utilization',question:'How much available capacity is moving?',period:'Sun–Sat',format:'percent',series:[{key:'utilization',label:'Utilization',color:'#2dd4a0',values:[78,83,81,92,88,94,76]}]},
      {id:'fleet-readiness',kind:'progress',title:'Compliance & evidence',question:'What needs attention before it becomes an exception?',period:'Current',format:'percent',items:[{key:'pti',label:'PTI compliance',value:94,max:100,color:'#2dd4a0'},{key:'evidence',label:'Evidence complete',value:88,max:100,color:'#60a5fa'},{key:'exceptions',label:'Open exceptions',value:3,max:12,color:'#f7b955'}]}
    ]
  };

  function formatValue(value, format) {
    if (format === 'currency') return '$' + Math.round(value).toLocaleString('en-US');
    if (format === 'compactCurrency') return '$' + (value >= 1000 ? (value / 1000).toFixed(1).replace('.0', '') + 'k' : value);
    if (format === 'miles') return Math.round(value).toLocaleString('en-US') + ' mi';
    if (format === 'percent') return Math.round(value) + '%';
    if (format === 'costPerMile') return '$' + Number(value).toFixed(2) + '/mi';
    return String(value);
  }

  function selectionDetail(config, role, index, seriesIndex) {
    const series = config.series && config.series[seriesIndex || 0];
    return {
      chartId: config.id,
      role,
      metric: series ? series.key : config.items[index].key,
      period: config.period,
      selectedDate: config.kind === 'progress' ? 'current' : DAYS[index],
      selectedSeries: series ? series.label : config.items[index].label,
      selectedValue: series ? series.values[index] : config.items[index].value,
      relatedEntityIds: []
    };
  }

  function zeroStateMarkup(message) {
    return '<div class="chart-zero"><span>—</span><strong>No data yet</strong><p>' + (message || 'No activity recorded for this period') + '</p></div>';
  }

  function pathFor(values, xFor, yFor) {
    return values.map(function (value, index) { return (index ? 'L' : 'M') + xFor(index).toFixed(1) + ' ' + yFor(value).toFixed(1); }).join(' ');
  }

  function renderCartesian(canvas, config, role) {
    const width = 620, height = 226, left = 42, right = 14, top = 16, bottom = 38;
    const plotWidth = width - left - right, plotHeight = height - top - bottom;
    const values = config.series.flatMap(function (series) { return series.values; });
    if (!values.length) { canvas.innerHTML = zeroStateMarkup('No earnings recorded this week'); return; }
    const max = Math.max.apply(Math, values.concat([1])) * 1.12;
    const xFor = function (index) { return left + (plotWidth * index / Math.max(1, DAYS.length - 1)); };
    const yFor = function (value) { return top + plotHeight - (value / max * plotHeight); };
    const grid = [0,.25,.5,.75,1].map(function (ratio) {
      const y = top + plotHeight * ratio;
      return '<line class="chart-gridline" x1="' + left + '" x2="' + (width-right) + '" y1="' + y + '" y2="' + y + '"/>';
    }).join('');
    const labels = DAYS.map(function (day,index) { return '<text class="chart-axis-label" x="' + xFor(index) + '" y="' + (height-12) + '" text-anchor="middle">' + day + '</text>'; }).join('');
    let marks = '';
    if (config.kind === 'bar') {
      const barWidth = Math.min(42, plotWidth / DAYS.length * .54);
      marks = config.series[0].values.map(function (value,index) {
        const y=yFor(value); return '<rect class="chart-bar" data-index="'+index+'" x="'+(xFor(index)-barWidth/2)+'" y="'+y+'" width="'+barWidth+'" height="'+(top+plotHeight-y)+'" rx="7" fill="'+config.series[0].color+'"/>';
      }).join('');
    } else {
      marks = config.series.map(function (series,seriesIndex) {
        const path=pathFor(series.values,xFor,yFor);
        return '<path class="chart-line chart-series-'+seriesIndex+'" pathLength="1" d="'+path+'" stroke="'+series.color+'"/>'+
          series.values.map(function (value,index) { return '<circle class="chart-point chart-series-'+seriesIndex+'" data-series="'+seriesIndex+'" data-index="'+index+'" cx="'+xFor(index)+'" cy="'+yFor(value)+'" r="3" fill="'+series.color+'"/>'; }).join('');
      }).join('');
    }
    canvas.innerHTML = '<svg class="chart-svg" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="'+config.title+' interactive chart">'+grid+labels+marks+'<line class="chart-guide" x1="0" x2="0" y1="'+top+'" y2="'+(top+plotHeight)+'"/><rect class="chart-hit-area" x="'+left+'" y="'+top+'" width="'+plotWidth+'" height="'+plotHeight+'" fill="transparent"/></svg><div class="chart-tooltip" role="status"></div>';
    const svg=canvas.querySelector('svg'), hit=canvas.querySelector('.chart-hit-area'), guide=canvas.querySelector('.chart-guide'), tooltip=canvas.querySelector('.chart-tooltip');
    let pinned=false;
    function select(event, shouldPin) {
      const rect=svg.getBoundingClientRect();
      const localX=Math.max(left,Math.min(width-right,(event.clientX-rect.left)/rect.width*width));
      const index=Math.max(0,Math.min(DAYS.length-1,Math.round((localX-left)/plotWidth*(DAYS.length-1))));
      const x=xFor(index); guide.setAttribute('x1',x);guide.setAttribute('x2',x);guide.classList.add('show');
      canvas.querySelectorAll('.chart-point').forEach(function (point) { point.classList.toggle('selected',Number(point.dataset.index)===index); });
      canvas.querySelectorAll('.chart-bar').forEach(function (bar) { bar.classList.toggle('selected',Number(bar.dataset.index)===index); });
      tooltip.innerHTML='<strong>'+DAYS[index]+'</strong>'+config.series.map(function(series){return '<span><i style="background:'+series.color+'"></i>'+series.label+' <b>'+formatValue(series.values[index],config.format)+'</b></span>';}).join('');
      const canvasWidth=canvas.clientWidth, target=x/width*canvasWidth, tipWidth=Math.min(210,canvasWidth-16);
      tooltip.style.width=tipWidth+'px';tooltip.style.left=Math.max(8,Math.min(canvasWidth-tipWidth-8,target-tipWidth/2))+'px';tooltip.classList.add('show');
      if(shouldPin)pinned=true;
      canvas.dispatchEvent(new CustomEvent('crewbiq:chart-select',{bubbles:true,detail:selectionDetail(config,role,index,0)}));
    }
    hit.addEventListener('pointermove',function(event){select(event,false);});
    hit.addEventListener('pointerdown',function(event){event.preventDefault();select(event,true);});
    hit.addEventListener('pointerleave',function(){if(!pinned){guide.classList.remove('show');tooltip.classList.remove('show');canvas.querySelectorAll('.selected').forEach(function(node){node.classList.remove('selected');});}});
  }

  function renderProgress(canvas, config, role) {
    canvas.innerHTML='<div class="chart-progress-list">'+config.items.map(function(item,index){const pct=Math.min(100,item.value/item.max*100);return '<button class="chart-progress-row" data-index="'+index+'"><span><b>'+item.label+'</b><em>'+formatValue(item.value,item.key==='exceptions'?'number':config.format)+'</em></span><i><u style="width:'+pct+'%;background:'+item.color+'"></u></i></button>';}).join('')+'</div><div class="chart-progress-note">Tap a signal to prepare a future drill-down selection.</div>';
    canvas.querySelectorAll('.chart-progress-row').forEach(function(row){row.addEventListener('pointerdown',function(){canvas.querySelectorAll('.chart-progress-row').forEach(function(node){node.classList.remove('selected');});row.classList.add('selected');const index=Number(row.dataset.index);canvas.dispatchEvent(new CustomEvent('crewbiq:chart-select',{bubbles:true,detail:selectionDetail(config,role,index,0)}));});});
  }

  function renderDashboard(container, role) {
    const configs=ANALYTICS_DATA[role]||ANALYTICS_DATA.driver;
    container.innerHTML=configs.map(function(config,index){const legend=(config.series||[]).map(function(series){return '<span><i style="background:'+series.color+'"></i>'+series.label+'</span>';}).join('');return '<article class="chart-card '+(configs.length===3&&index===0?'chart-wide':'')+'" data-chart-id="'+config.id+'"><header><div><span>'+config.period+'</span><h3>'+config.title+'</h3><p>'+config.question+'</p></div><div class="chart-legend">'+legend+'</div></header><div class="chart-canvas"></div></article>';}).join('');
    configs.forEach(function(config){const canvas=container.querySelector('[data-chart-id="'+config.id+'"] .chart-canvas');if(config.kind==='progress')renderProgress(canvas,config,role);else renderCartesian(canvas,config,role);});
  }

  global.CrewBIQCharts={ANALYTICS_DATA,formatValue,selectionDetail,zeroStateMarkup,renderDashboard};
})(window);
