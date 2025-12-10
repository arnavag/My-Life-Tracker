// Charts: dynamically fetch data and keep instances for updates
let taskProgressChartInstance = null;
let habitProgressChartInstance = null; // for dashboard habit doughnut
let weeklyChartInstance = null; // weekly task line
let habitChartInstance = null; // weekly habit bar
let mergedHabitTaskChartInstance = null; // merged daily chart used elsewhere

// Track last chart creation time to prevent rapid recreation glitches
let lastTaskChartCreateTime = 0;

// monthlyBudget state: null = no saved budget yet; number = saved budget (can be 0)
window.monthlyBudget = null;

function initMonthlyBudget() {
  try {
    const stored = localStorage.getItem('monthlyBudget');
    if (stored === null) {
      window.monthlyBudget = null;
    } else {
      const n = Number(stored);
      // if stored value is not a number, default to 0 (treat as saved zero)
      window.monthlyBudget = isNaN(n) ? 0 : n;
    }
  } catch (e) {
    window.monthlyBudget = null;
  }
  updateBudgetUI();
}

function updateBudgetUI() {
  try {
    // Dashboard label
    const dashLabel = document.getElementById('dashboardBudgetLabel');
    const dashSpan = document.getElementById('dashboardMonthlyBudget');
    // Dashboard: update only the amount span to preserve label layout (label above amount)
    try {
      const displayValue = (window.monthlyBudget === null) ? 0 : window.monthlyBudget;
      const val = Number.isInteger(displayValue) ? String(displayValue) : Number(displayValue).toFixed(2);
      if (dashSpan) dashSpan.textContent = val;
      // ensure label text remains visible and correct
      if (dashLabel) dashLabel.textContent = 'Monthly Budget';
    } catch (e) {
      if (dashSpan) dashSpan.textContent = '0';
      if (dashLabel) dashLabel.textContent = 'Monthly Budget';
    }

    // Budget page label and input
    const pageLabel = document.getElementById('budgetPageLabel');
    const budgetInput = document.getElementById('budgetLimit');
    if (window.monthlyBudget === null) {
      if (pageLabel) pageLabel.textContent = 'Monthly Budget';
      // keep input empty with placeholder
      if (budgetInput) budgetInput.value = '';
    } else {
      const val = Number.isInteger(window.monthlyBudget) ? String(window.monthlyBudget) : window.monthlyBudget.toFixed(2);
      if (pageLabel) pageLabel.textContent = `Monthly Budget: ${val}`;
      // do not pre-fill the input; leave it as temporary controlled field
      if (budgetInput) budgetInput.value = '';
    }
  } catch (e) {
    // ignore UI update errors
  }
  try { enforceBudgetCardLayout(); } catch (e) {}
}

// Ensure the dashboard Budget stat card always shows the label above the amount
// This function restructures the DOM if the label or span were moved or hidden
// and runs immediately so changes appear without manual refresh when possible.
// Track if layout has been enforced to prevent unnecessary DOM manipulation
let _budgetLayoutEnforced = false;

function enforceBudgetCardLayout() {
  try {
    // Only run once to prevent flickering on page navigation
    if (_budgetLayoutEnforced) return;
    
    const card = document.querySelector('.quick-stats a.stat-viridian[href="/budget"]');
    const content = card ? card.querySelector('.stat-content') : null;
    if (!content) return;

    // Ensure label exists and is the first child of .stat-content
    let label = document.getElementById('dashboardBudgetLabel');
    if (!label) {
      label = document.createElement('h3');
      label.id = 'dashboardBudgetLabel';
      label.textContent = 'Monthly Budget';
    }
    if (label.parentElement !== content) content.insertBefore(label, content.firstChild);

    // Ensure amount span exists and is inside a .stat-number paragraph
    let span = document.getElementById('dashboardMonthlyBudget');
    if (!span) {
      span = document.createElement('span');
      span.id = 'dashboardMonthlyBudget';
      span.textContent = '0';
    }
    let p = content.querySelector('.stat-number');
    if (!p) {
      p = document.createElement('p');
      p.className = 'stat-number';
      p.innerHTML = '₹';
      p.appendChild(span);
      // append after label
      if (label.nextSibling) content.insertBefore(p, label.nextSibling); else content.appendChild(p);
    } else {
      // Ensure the rupee symbol is present and span is inside p
      if (!p.textContent.includes('₹')) {
        // Prepend rupee symbol while preserving span value
        const current = span && span.textContent ? span.textContent : '0';
        p.textContent = '₹';
        p.appendChild(span);
        span.textContent = current;
      } else if (!p.contains(span)) {
        // Move span into paragraph
        p.appendChild(span);
      }
    }

    // Force visual stacking via inline style as a last-resort to avoid layout races
    try {
      content.style.display = 'flex';
      content.style.flexDirection = 'column';
      content.style.alignItems = 'flex-start';
    } catch (e) {}
    
    _budgetLayoutEnforced = true;
  } catch (e) { /* non-critical */ }
}

// Run enforcement early (if script loaded after DOM) and also on DOMContentLoaded
try { enforceBudgetCardLayout(); } catch (e) {}

// Helper function to get CSS variable value from computed styles
function getCSSVariable(variableName) {
  return getComputedStyle(document.documentElement).getPropertyValue(variableName).trim();
}

// Helper function to get the correct text color based on current theme
function getChartTextColor() {
  return document.body.classList.contains('light-theme') ? '#3A3254' : '#EAF6F1';
}

// Helper function to get the correct grid color based on current theme
function getChartGridColor() {
  return document.body.classList.contains('light-theme') ? 'rgba(79, 18, 113, 0.12)' : 'rgba(245, 245, 245, 0.15)';
}

// Helper function to get theme-specific completed and pending colors from CSS variables (single source of truth)
function getThemeChartColors() {
  const isLight = document.body.classList.contains('light-theme');
  return {
    completed: getCSSVariable('--chart-completed'),
    pending: getCSSVariable('--chart-pending'),
    outline: getCSSVariable('--chart-outline'),
    // Negative space technique: use chart card background for borders in green mode
    border: isLight ? getCSSVariable('--chart-outline') : '#16352D',
    borderWidth: isLight ? 2 : 3
  };
}

// Helper function to get the correct line/bar chart color based on current theme
function getChartLineColor() {
  return document.body.classList.contains('light-theme') ? '#DA70D6' : '#29AB87';
}

// Helper function to get the correct bar chart color based on current theme
function getChartBarColor() {
  return document.body.classList.contains('light-theme') ? '#DA70D6' : '#29AB87';
}

// Chart.js plugin: apply a PURE RADIAL gradient based ONLY on ring thickness.
// The gradient starts at the INNER EDGE (dark) and fades to the OUTER EDGE (lighter).
// ZERO directional lighting — brightness is identical at every angle around the circle.
// This creates a 3D extruded ring with depth perpendicular to the surface, NOT a spotlight.
const ringInnerShadePlugin = {
  id: 'ringInnerShade',
  afterDatasetsDraw(chart) {
    try {
      // Only run in Green Dark Mode
      if (document.body.classList.contains('light-theme')) return;
      // Only for doughnut charts
      if (!chart || !chart.config || chart.config.type !== 'doughnut') return;
      // Restrict to dashboard doughnuts only
      try {
        const cid = chart && chart.canvas && chart.canvas.id;
        if (cid !== 'taskProgressChart' && cid !== 'habitProgressChart') return;
      } catch (e) { /* fallthrough */ }

      const ctx = chart.ctx;
      chart.data.datasets.forEach((ds, dsIndex) => {
        const meta = chart.getDatasetMeta(dsIndex);
        if (!meta || !meta.data) return;
        meta.data.forEach(arc => {
          const { x, y, innerRadius, outerRadius, startAngle, endAngle } = arc;
          if (!x || !y || !innerRadius || !outerRadius) return;

          ctx.save();
          // Clip to the ring segment
          ctx.beginPath();
          ctx.arc(x, y, outerRadius, startAngle, endAngle, false);
          ctx.arc(x, y, innerRadius, endAngle, startAngle, true);
          ctx.closePath();
          ctx.clip();

          // Create a PURE radial gradient from inner edge to outer edge
          // This is based ONLY on distance from center, creating uniform brightness at all angles
          const grad = ctx.createRadialGradient(x, y, innerRadius, x, y, outerRadius);
          
          // Dark at inner edge, smoothly fade to transparent at outer edge
          // This creates depth perpendicular to the ring surface with NO side lighting
          grad.addColorStop(0.0, 'rgba(0,0,0,0.35)');  // Dark at inner edge
          grad.addColorStop(0.3, 'rgba(0,0,0,0.20)');  // Smooth fade
          grad.addColorStop(0.6, 'rgba(0,0,0,0.10)');  // Gradual transition
          grad.addColorStop(0.85, 'rgba(0,0,0,0.03)'); // Nearly transparent
          grad.addColorStop(1.0, 'rgba(0,0,0,0.00)');  // Fully transparent at outer edge

          // Use multiply composite to darken the base segment color naturally
          const prevComp = ctx.globalCompositeOperation;
          ctx.globalCompositeOperation = 'multiply';
          ctx.fillStyle = grad;
          ctx.fillRect(x - outerRadius, y - outerRadius, outerRadius * 2, outerRadius * 2);
          ctx.globalCompositeOperation = prevComp;
          ctx.restore();
        });
        
        // Clear the center hole to make it transparent (no gradient in the hole)
        try {
          const firstArc = meta && meta.data && meta.data[0];
          if (firstArc && firstArc.x && firstArc.y && typeof firstArc.innerRadius === 'number') {
            const cx = firstArc.x;
            const cy = firstArc.y;
            const ir = firstArc.innerRadius;
            ctx.save();
            ctx.beginPath();
            ctx.arc(cx, cy, ir, 0, Math.PI * 2);
            ctx.closePath();
            const prevComp = ctx.globalCompositeOperation;
            ctx.globalCompositeOperation = 'destination-out';
            ctx.fillStyle = 'rgba(0,0,0,1)';
            ctx.fill();
            ctx.globalCompositeOperation = prevComp;
            ctx.restore();
          }
        } catch (e) { /* ignore */ }
      });
    } catch (e) {
      console.warn('ringInnerShadePlugin error', e);
    }
  }
};

// Register plugin globally
try { Chart.register(ringInnerShadePlugin); } catch (e) { console.warn('Could not register ringInnerShade plugin', e); }

// Global plugin: reliably hide tooltips when pointer leaves the canvas
// Addresses intermittent cases where Chart.js keeps the last hovered element
// active after fast exits or when the cursor hits the window edge.
const hideTooltipOnLeavePlugin = {
  id: 'hideTooltipOnLeave',
  beforeEvent(chart, args) {
    try {
      const evt = args && args.event;
      if (!evt) return;
      const t = evt.type || '';
      // Normalize common exit events that can leave the last element active
      if (t === 'mouseout' || t === 'mouseleave' || t === 'pointerleave' || t === 'pointerout') {
        try { chart.setActiveElements([]); } catch (e) {}
        try { chart.tooltip && chart.tooltip.setActiveElements([], { x: 0, y: 0 }); } catch (e) {}
        // Avoid a full re-render; Chart.js will clear the tooltip box next frame
        return;
      }
      // If moving the pointer and not intersecting any elements (e.g., coming
      // from outside the ring and slipping off immediately), proactively clear.
      if (t === 'mousemove' || t === 'pointermove') {
        try {
          const active = chart.getActiveElements ? chart.getActiveElements() : [];
          // If nothing is active and pointer is outside chart area, hide tooltip.
          const ca = chart.chartArea;
          const x = evt.x, y = evt.y;
          const outside = !ca || x < ca.left || x > ca.right || y < ca.top || y > ca.bottom;
          if (outside || !active || active.length === 0) {
            chart.setActiveElements([]);
            chart.tooltip && chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          }
        } catch (e) { /* ignore */ }
      }
    } catch (e) {
      // non-critical
    }
  }
};
try { Chart.register(hideTooltipOnLeavePlugin); } catch (e) { console.warn('Could not register hideTooltipOnLeave plugin', e); }

// As a safety net, also clear active elements when the window loses focus
// (e.g., user Alt-Tab) to prevent a stuck tooltip if the last hover left mid-frame.
try {
  window.addEventListener('blur', () => {
    [taskProgressChartInstance, habitProgressChartInstance, weeklyChartInstance, habitChartInstance, mergedHabitTaskChartInstance]
      .forEach(ci => {
        if (!ci) return;
        try { ci.setActiveElements([]); } catch (e) {}
        try { ci.tooltip && ci.tooltip.setActiveElements([], { x: 0, y: 0 }); } catch (e) {}
      });
  }, { passive: true });
} catch (e) { /* ignore */ }

// Strict doughnut hover plugin: show tooltip ONLY when the pointer is on a segment (the ring);
// otherwise, clear any active element so no tooltip is shown. Keeps logic simple and predictable.
const strictDoughnutHoverPlugin = {
  id: 'strictDoughnutHover',
  beforeEvent(chart, args) {
    try {
      // Only apply to doughnut charts (our dashboard rings)
      if (!chart || chart.config.type !== 'doughnut') return;
      const evt = args && args.event;
      if (!evt) return;
      const t = evt.type || '';
      // Run on pointer/mouse move to drive hover state explicitly
      if (t === 'mousemove' || t === 'pointermove') {
        const elements = chart.getElementsAtEventForMode(evt, 'nearest', { intersect: true }, true) || [];
        if (elements.length > 0) {
          // Lock hover to the nearest intersecting arc only
          chart.setActiveElements(elements);
          chart.tooltip && chart.tooltip.setActiveElements(elements, { x: evt.x, y: evt.y });
          // Clear any pending inactivity timeout for this chart
          try { if (chart._mlt_inactiveTimer) { clearTimeout(chart._mlt_inactiveTimer); chart._mlt_inactiveTimer = null; } } catch (e) {}
        } else {
          // Not on the ring — clear tooltip and active
          chart.setActiveElements([]);
          chart.tooltip && chart.tooltip.setActiveElements([], { x: 0, y: 0 });
          // Set a short inactivity timer as a watchdog in case an event is missed
          // This helps clear sporadic stuck tooltips on super-fast exits.
          try {
            if (chart._mlt_inactiveTimer) clearTimeout(chart._mlt_inactiveTimer);
            chart._mlt_inactiveTimer = setTimeout(() => {
              try {
                chart.setActiveElements([]);
                chart.tooltip && chart.tooltip.setActiveElements([], { x: 0, y: 0 });
              } catch (e) {}
              chart._mlt_inactiveTimer = null;
            }, 80); // ~1 frame buffer at 60–120Hz
          } catch (e) { /* ignore */ }
        }
      }
      // On cancellation-type events, force clear immediately
      if (t === 'pointercancel') {
        try { chart.setActiveElements([]); } catch (e) {}
        try { chart.tooltip && chart.tooltip.setActiveElements([], { x: 0, y: 0 }); } catch (e) {}
      }
    } catch (e) { /* non-critical */ }
  }
};
try { Chart.register(strictDoughnutHoverPlugin); } catch (e) { console.warn('Could not register strictDoughnutHover plugin', e); }

// Global guard: if the pointer moves anywhere NOT on a doughnut canvas,
// and any doughnut tooltip is visible, clear it. This catches cases where
// the browser doesn't deliver a clean leave to the canvas (fast exits).
try {
  window.addEventListener('pointermove', (ev) => {
    try {
      const target = ev.target;
      const canvases = [
        taskProgressChartInstance && taskProgressChartInstance.canvas,
        habitProgressChartInstance && habitProgressChartInstance.canvas
      ].filter(Boolean);
      const onDoughnutCanvas = canvases.some(c => c === target);
      if (!onDoughnutCanvas) {
        [taskProgressChartInstance, habitProgressChartInstance].forEach(ci => {
          if (!ci) return;
          // If nothing is active, or tooltip exists, force clear to be safe
          const active = ci.getActiveElements ? ci.getActiveElements() : [];
          if (!active || active.length === 0 || (ci.tooltip && ci.tooltip.getActiveElements && ci.tooltip.getActiveElements().length > 0)) {
            try { ci.setActiveElements([]); } catch (e) {}
            try { ci.tooltip && ci.tooltip.setActiveElements([], { x: 0, y: 0 }); } catch (e) {}
          }
        });
      }
    } catch (e) { /* ignore */ }
  }, { passive: true });
} catch (e) { /* ignore */ }

// Disable animations for pie/doughnut charts so rings render statically.
// This avoids any rotate/scale entrance effects when the user requests
// no animation and keeps the inner shading stable on hover.
try {
  if (window.Chart && Chart.defaults) {
    Chart.defaults.doughnut = Chart.defaults.doughnut || {};
    Chart.defaults.pie = Chart.defaults.pie || {};
    Chart.defaults.plugins = Chart.defaults.plugins || {};
    Chart.defaults.plugins.tooltip = Chart.defaults.plugins.tooltip || {};
    // Disable all tooltips globally
    Chart.defaults.plugins.tooltip.enabled = false;
    // Enable clockwise rotation animation
    Chart.defaults.doughnut.animation = {
      animateRotate: true,
      animateScale: false,
      duration: 1000,
      easing: 'easeOutQuart'
    };
    Chart.defaults.pie.animation = {
      animateRotate: true,
      animateScale: false,
      duration: 1000,
      easing: 'easeOutQuart'
    };
  }
} catch (e) { /* ignore if Chart not available yet */ }

/* tooltipSwatchPainter plugin removed as requested */

// Defensive: ensure doughnut/pie tooltip color boxes are drawn without any outline
// by default. Some charts (lines) intentionally draw a white outline; preserve
// that behavior for non-doughnut charts by delegating to the original callback
// when appropriate. This override runs early so charts created later inherit it.
try {
  if (window.Chart && Chart.defaults && Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
    const originalLabelColor = Chart.defaults.plugins.tooltip.callbacks && Chart.defaults.plugins.tooltip.callbacks.labelColor;
    Chart.defaults.plugins.tooltip.callbacks = Chart.defaults.plugins.tooltip.callbacks || {};
    Chart.defaults.plugins.tooltip.callbacks.labelColor = function(context) {
      try {
        const chartType = context && context.chart && context.chart.config && context.chart.config.type;
        const colors = getThemeChartColors();
          // For doughnut/pie charts, prefer dataset segment color; otherwise fall back to theme values
        if (chartType === 'doughnut' || chartType === 'pie') {
          const ds = context.dataset || {};
          let bg = null;
          if (Array.isArray(ds.backgroundColor)) {
            bg = ds.backgroundColor[context.dataIndex];
          } else if (ds.backgroundColor) {
            bg = ds.backgroundColor;
          }
          // If no dataset color, derive from the label (completed vs pending) using theme values
          if (!bg) {
            const label = context.label ? String(context.label).toLowerCase() : '';
            if (label.includes('pending')) bg = colors.pending || getCSSVariable('--chart-pending');
            else bg = colors.completed || getCSSVariable('--chart-completed');
          }
          // Ensure we always have a background color
          if (!bg) bg = colors.pending || '#4a5050';
          // Return with black outline for doughnut/pie tooltip swatches
          return { borderColor: '#000000', borderWidth: 1, backgroundColor: bg };
        }
        // Otherwise defer to original behaviour if present
        if (typeof originalLabelColor === 'function') return originalLabelColor(context);
  // Fallback default for other chart types: prefer pointBackgroundColor then dataset color
  const ds2 = context.dataset || {};
  const bg2 = ds2.pointBackgroundColor || ds2.backgroundColor || ds2.borderColor || getThemeChartColors().completed || '#10B981';
  // For non-doughnut charts keep a subtle white outline for contrast
  return { borderColor: '#fff', borderWidth: 2, backgroundColor: bg2 };
      } catch (e) {
        return { borderColor: '#000', borderWidth: 2, backgroundColor: getThemeChartColors().pending || '#4a5050' };
      }
    };
  }
} catch (e) { console.warn('Could not set default tooltip labelColor override', e); }

// Ensure the given doughnut canvas is wrapped with the required DOM structure
// so the circular shadow element (.doughnut-shadow) exists for the CSS animation.
function ensureDoughnutWrapper(canvas) {
  try {
    if (!canvas || !canvas.parentElement) return;
    // If already wrapped, nothing to do
    if (canvas.parentElement.classList && canvas.parentElement.classList.contains('doughnut-wrapper')) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'doughnut-wrapper';
    // create the shadow element placed beneath the canvas
    const shadow = document.createElement('div');
    shadow.className = 'doughnut-shadow';
    // Insert wrapper in place of the canvas
    const parent = canvas.parentElement;
    parent.replaceChild(wrapper, canvas);
    // append shadow then canvas into wrapper
    wrapper.appendChild(shadow);
    wrapper.appendChild(canvas);
  } catch (e) {
    // silently ignore DOM issues
    console.warn('ensureDoughnutWrapper failed', e);
  }
}

// Convert an arbitrary string (date label) to a pleasant HSL color.
// We map a simple hash of the string to a hue and return an hsl() color string.
function stringToHslColor(str, s = 66, l = 46) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash; // convert to 32bit int
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, ${s}%, ${l}%)`;
}

// Apply the color derived from the supplied date string to the two targets
function applyDateColorToElements(dateString) {
  try {
    const color = stringToHslColor(dateString);
    const hero = document.getElementById('heroTagline');
    const habitTitle = document.getElementById('habitTitle');
    if (hero) hero.style.color = color;
    if (habitTitle) habitTitle.style.color = color;
  } catch (e) {
    console.warn('applyDateColorToElements failed', e);
  }
}

// Apply the dashboard 'Budget Spent' stat color (CSS variable --stat-viridian-bg)
// to the page tagline, habit title, and the nav brand text.
// Track if already applied to prevent flickering
let _statColorApplied = false;

function applyStatColorToElements() {
  try {
    // Only apply once to prevent flickering on page navigation
    if (_statColorApplied) return;
    
    const statColor = getCSSVariable('--stat-viridian-bg') || '#33665e';
    const hero = document.getElementById('heroTagline');
    const habitTitle = document.getElementById('habitTitle');
    const navBrandText = document.querySelector('.nav-brand span');
    if (hero) hero.style.color = statColor;
    if (habitTitle) habitTitle.style.color = statColor;
    if (navBrandText) navBrandText.style.color = statColor;
    
    _statColorApplied = true;
  } catch (e) { console.warn('applyStatColorToElements failed', e); }
}

async function refreshCharts() {
  try {
    const chartTextColor = getChartTextColor();
    const chartGridColor = getChartGridColor();
  // Read CSS variables: keep legend boxes unchanged, but allow tooltip boxes
  // (the small square inside the Chart.js tooltip) to be larger when needed.
  const legendBoxSize = parseInt(getCSSVariable('--legend-box-size')) || 12;
  const tooltipBoxSize = parseInt(getCSSVariable('--tooltip-box-size')) || (legendBoxSize + 6);
    
    // --- Daily Task Progress (doughnut) ---
    const taskEl = document.getElementById('taskProgressChart');
    const tasksRes = await fetch('/api/tasks');
    const tasks = await tasksRes.json();
    const completedToday = (tasks || []).filter(t => t.completed).length;
    const pendingToday = Math.max((tasks || []).length - completedToday, 0);

    const totalTasksCount = completedToday + pendingToday;
    let taskData, taskOptions;
      if (taskEl) {
        if (totalTasksCount === 0 && !document.body.classList.contains('light-theme')) {
          // Green Dark Mode empty-state: single uniform grey ring per design
          const colors = getThemeChartColors();
          // empty-state: single grey ring, no visible outline on swatches/tooltips
          taskData = { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#9CA3AF'], borderColor: ['#9CA3AF'], borderWidth: 0 }] };
          taskOptions = { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
        } else if (totalTasksCount === 0) {
          // Light theme / fallback: keep previous light empty appearance
          // light theme empty-state: keep flat grey, remove outline for swatches/tooltips
          taskData = { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#e6e6e6'], borderColor: ['#e6e6e6'], borderWidth: 0 }] };
          taskOptions = { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
        } else {
      // Completed -> theme-aware color, Pending -> theme-aware color
      const colors = getThemeChartColors();
      
      // Use flat base colors - the ringInnerShadePlugin will add the radial depth gradient uniformly
      taskData = { 
        labels: ['Completed', 'Pending'], 
        datasets: [{ 
          data: [completedToday, pendingToday], 
          backgroundColor: [colors.completed, colors.pending],
          borderColor: [colors.completed, colors.pending],
          borderWidth: 0
        }] 
      };
  // Disable Chart.js built-in legend (the smaller center legend)
  taskOptions = { plugins: { legend: { display: false } } };
      }
  // ensure header legend swatches match current dataset colors
  try { updateHeaderLegend('taskProgressChart', taskProgressChartInstance); } catch (e) { /* ignore */ }
      // Always destroy and recreate to replay animation on every refresh
      if (taskProgressChartInstance) {
        try { taskProgressChartInstance.destroy(); } catch (e) { /* ignore */ }
        taskProgressChartInstance = null;
      }
      // ensure wrapper/shadow exist so dark-mode CSS animation runs, then mark canvas
      try { ensureDoughnutWrapper(taskEl); taskEl.classList.add('doughnut-canvas'); } catch (e) {}
      try { const card = taskEl && taskEl.closest ? taskEl.closest('.chart-card') : null; if (card) card.classList.add('no-external-shadow'); } catch (e) {}
      
      // Small delay to let canvas fully reset after destroy (prevents 100% flash on rapid navigation)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      taskProgressChartInstance = new Chart(taskEl, {
          type: 'doughnut',
          data: taskData,
          options: Object.assign({
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1,
            // Clockwise rotation animation
            animation: {
              animateRotate: true,
              animateScale: false,
              duration: 1000,
              easing: 'easeOutQuart'
            },
            cutout: '62%',
            plugins: {
              legend: { position: 'bottom', align: 'center', labels: { boxWidth: legendBoxSize, color: chartTextColor } },
              tooltip: { enabled: false }
            }
          }, taskOptions)
        });
      try { if (taskProgressChartInstance && taskProgressChartInstance.legend) taskProgressChartInstance.legend.draw = function(){}; } catch (e) {}
      // Tooltip hide-on-leave handled globally by hideTooltipOnLeavePlugin
      try { updateHeaderLegend('taskProgressChart', taskProgressChartInstance); } catch (e) { /* ignore */ }
    }

    // --- Daily Habit Progress (doughnut) ---
    const habitDashEl = document.getElementById('habitProgressChart');
    const habitsRes = await fetch('/api/habits');
    const habits = await habitsRes.json();
    const habitList = Object.values(habits || {});
    const _d = new Date();
    const today = _d.getFullYear() + '-' + String(_d.getMonth() + 1).padStart(2, '0') + '-' + String(_d.getDate()).padStart(2, '0');
    const completedHabitsToday = habitList.reduce((acc, h) => acc + ((h.completed_dates || []).includes(today) ? 1 : 0), 0);
    const pendingHabitsToday = Math.max(habitList.length - completedHabitsToday, 0);

    const totalHabitsCount = completedHabitsToday + pendingHabitsToday;
    let habitData, habitOptions;
      if (habitDashEl) {
        if (totalHabitsCount === 0 && !document.body.classList.contains('light-theme')) {
          // Green Dark Mode empty-state: single uniform grey ring per design
          const colors = getThemeChartColors();
          // empty-state: single grey ring, no visible outline on swatches/tooltips
          habitData = { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#9CA3AF'], borderColor: ['#9CA3AF'], borderWidth: 0 }] };
          habitOptions = { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
        } else if (totalHabitsCount === 0) {
          // Light theme / fallback: keep previous light empty appearance
          // light theme empty-state: keep flat grey, remove outline for swatches/tooltips
          habitData = { labels: ['No data'], datasets: [{ data: [1], backgroundColor: ['#e6e6e6'], borderColor: ['#e6e6e6'], borderWidth: 0 }] };
          habitOptions = { responsive: true, plugins: { legend: { display: false }, tooltip: { enabled: false } } };
        } else {
      // Completed -> theme-aware color, Pending -> theme-aware color
      const colors = getThemeChartColors();
      
      // Use flat base colors - the ringInnerShadePlugin will add the radial depth gradient uniformly
      habitData = { 
        labels: ['Completed', 'Pending'], 
        datasets: [{ 
          data: [completedHabitsToday, pendingHabitsToday], 
          backgroundColor: [colors.completed, colors.pending],
          borderColor: [colors.completed, colors.pending],
          borderWidth: 0
        }] 
      };
  // Disable Chart.js built-in legend (the smaller center legend)
  habitOptions = { plugins: { legend: { display: false } } };
      }
  // ensure header legend swatches match current dataset colors
  try { updateHeaderLegend('habitProgressChart', habitProgressChartInstance); } catch (e) { /* ignore */ }
      // Always destroy and recreate to replay animation on every refresh
      if (habitProgressChartInstance) {
        try { habitProgressChartInstance.destroy(); } catch (e) { /* ignore */ }
        habitProgressChartInstance = null;
      }
      try { ensureDoughnutWrapper(habitDashEl); habitDashEl.classList.add('doughnut-canvas'); } catch (e) {}
      try { const card2 = habitDashEl && habitDashEl.closest ? habitDashEl.closest('.chart-card') : null; if (card2) card2.classList.add('no-external-shadow'); } catch (e) {}
      habitProgressChartInstance = new Chart(habitDashEl, {
          type: 'doughnut',
          data: habitData,
          options: Object.assign({
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 1,
            // Clockwise rotation animation
            animation: {
              animateRotate: true,
              animateScale: false,
              duration: 1000,
              easing: 'easeOutQuart'
            },
            cutout: '62%',
            plugins: { 
              legend: { position: 'bottom', align: 'center', labels: { boxWidth: legendBoxSize, color: chartTextColor } },
              tooltip: { enabled: false }
            }
          }, habitOptions)
        });
      try { if (habitProgressChartInstance && habitProgressChartInstance.legend) habitProgressChartInstance.legend.draw = function(){}; } catch (e) {}
      // Tooltip hide-on-leave handled globally by hideTooltipOnLeavePlugin
      // sync header legend colors
      try { updateHeaderLegend('habitProgressChart', habitProgressChartInstance); } catch (e) { /* ignore */ }
      // Shading animation will be started by the Chart.js rotation animation
      // onComplete handler (synchronized to avoid concurrent geometry anims).
      try { habitProgressChartInstance._ringShadeAnim = null; } catch (e) { /* ignore */ }
    }

    // --- Weekly Task & Habit charts (separate) ---
    const weeklyTaskEl = document.getElementById('weeklyTaskChart');
    const weeklyHabitEl = document.getElementById('weeklyHabitChart');
    const statsRes = await fetch('/api/stats?period=week');
    const stats = await statsRes.json(); // array of {date, completed, total}

    const weekdayLabels = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const tasksCompletedByWeekday = Array(7).fill(0);
    const tasksTotalByWeekday = Array(7).fill(0);
    const weekDateSet = new Set();
    (stats || []).forEach(s => { weekDateSet.add(s.date); try { const idx = new Date(s.date).getDay(); tasksCompletedByWeekday[idx] = s.completed || 0; tasksTotalByWeekday[idx] = s.total || 0; } catch(e){} });

    const habitsCompletedByWeekday = Array(7).fill(0);
    habitList.forEach(h => { (h.completed_dates || []).forEach(d => { if (weekDateSet.has(d)) { try { const idx = new Date(d).getDay(); habitsCompletedByWeekday[idx] += 1; } catch(e){} } }); });

    // Get current day of week (0 = Sunday, 6 = Saturday)
    const currentDate = new Date();
    const currentDayIndex = currentDate.getDay();
    
    // Clear future days data (set to null so they won't show on chart)
    const displayTasksCompleted = [...tasksCompletedByWeekday];
    const displayHabitsCompleted = [...habitsCompletedByWeekday];
    for (let i = currentDayIndex + 1; i < 7; i++) {
      displayTasksCompleted[i] = null;
      displayHabitsCompleted[i] = null;
    }

    // Tasks chart (single-series: Tasks Completed)
    if (weeklyTaskEl) {
      try { if (weeklyChartInstance) { weeklyChartInstance.destroy(); weeklyChartInstance = null; } } catch (e) {}
      const lineColor = getChartLineColor();
      const colors = getThemeChartColors();
      const lineColorRgba = document.body.classList.contains('light-theme') ? 'rgba(218,112,214,0.12)' : 'rgba(41,171,135,0.08)';
      
      weeklyChartInstance = new Chart(weeklyTaskEl, {
        type: 'line',
        data: {
          labels: weekdayLabels,
          datasets: [
            {
              label: 'Tasks Completed',
              data: displayTasksCompleted,
              // theme-aware line color
              borderColor: lineColor,
              borderWidth: 2,
              backgroundColor: lineColorRgba, // translucent fill under the line
              fill: true,
              tension: 0.2,
              pointRadius: 5,
              pointStyle: 'circle',
              // point styling: theme-aware fill with no border
              pointBackgroundColor: lineColor,
              pointBorderColor: lineColor,
              pointBorderWidth: 0,
              spanGaps: false, // don't connect lines across null values
              // hitRadius is set via elements.point in options as required
              // hoverRadius configured via elements.point as well
            }
          ]
        },
        // no outline plugin: draw a single clean teal line with white-bordered points
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { left: 12, right: 12, top: 12, bottom: 12 } },
          // Disable the built-in legend; we'll render a custom legend in the header row
          plugins: {
            legend: { display: false },
            tooltip: { enabled: false }
          },
          // Interaction: index mode across x-axis, do not require an exact intersect
          interaction: { mode: 'index', axis: 'x', intersect: false },
          // point-specific sizing for hit detection and hover — hoverRadius same as radius (no pop-up)
          elements: { point: { radius: 5, hitRadius: 14, hoverRadius: 5 } },
          scales: {
            x: { offset: true, grid: { color: chartGridColor }, ticks: { autoSkip: false, color: chartTextColor } },
            y: { beginAtZero: true, suggestedMax: Math.max(1, ...tasksCompletedByWeekday.filter(v => v !== null)) + 1, grid: { color: chartGridColor }, ticks: { stepSize: 1, color: chartTextColor, callback: function(v){ return Number.isInteger(v) ? v : ''; } } }
          },
          // hover/point sizing handled in elements.point above
        }
      });

      // update task stat boxes
      const totalTasksEl = document.getElementById('totalTasks');
      const completedTotalEl = document.getElementById('completedTasks');
      const tasksCompletedTotal = tasksCompletedByWeekday.reduce((a,b)=>a+b,0);
      const tasksTotal = tasksTotalByWeekday.reduce((a,b)=>a+b,0);
      const tasksMissed = tasksTotal - tasksCompletedTotal;
      if (totalTasksEl) totalTasksEl.textContent = tasksCompletedTotal; // Show completed count
      if (completedTotalEl) completedTotalEl.textContent = tasksMissed; // Show missed count
    }

    // Habits chart
    if (weeklyHabitEl) {
      try { if (habitChartInstance) { habitChartInstance.destroy(); habitChartInstance = null; } } catch (e) {}
      const totalWeeklyHabits = habitList.length || 0;
      const barColor = getChartBarColor();
      const colors = getThemeChartColors();
      
      habitChartInstance = new Chart(weeklyHabitEl, {
        type: 'bar',
        data: {
          labels: weekdayLabels,
          datasets: [
            // bar color is theme-aware with no outline
            { label: 'Habits Completed', data: displayHabitsCompleted, backgroundColor: barColor, borderColor: barColor, borderWidth: 0, borderRadius: 4, barPercentage: 0.6, categoryPercentage: 0.7, maxBarThickness: 40 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { left: 12, right: 12, top: 12, bottom: 12 } },
          // disable the built-in legend (we render a custom one in the header row)
          plugins: { 
            legend: { display: false },
            tooltip: { enabled: false }
          },
          scales: {
            x: { offset: true, grid: { color: chartGridColor }, ticks: { autoSkip: false, color: chartTextColor } },
            y: { beginAtZero: true, suggestedMax: Math.max(1, ...habitsCompletedByWeekday.filter(v => v !== null)) + 1, grid: { color: chartGridColor }, ticks: { stepSize: 1, color: chartTextColor, callback: function(v){ return Number.isInteger(v)?v:'' } } }
          }
        }
      });

      // update habit stat boxes
      const activeHabitsEl = document.getElementById('activeHabits');
      const habitsCompletedEl = document.getElementById('habitsCompleted');
      const distinctHabitsCompleted = habitList.reduce((acc, h) => acc + ((h.completed_dates || []).some(d => weekDateSet.has(d)) ? 1 : 0), 0);
      const habitsMissed = totalWeeklyHabits - distinctHabitsCompleted;
      if (activeHabitsEl) activeHabitsEl.textContent = distinctHabitsCompleted; // Show completed count
      if (habitsCompletedEl) habitsCompletedEl.textContent = habitsMissed; // Show missed count
    }

    // merged daily habit/task chart (if present)
    const habitEl = document.getElementById('habitChart');
    if (habitEl) {
      try { if (mergedHabitTaskChartInstance) { mergedHabitTaskChartInstance.destroy(); mergedHabitTaskChartInstance = null; } } catch (e) {}
      const statsRes2 = await fetch('/api/stats?period=week');
      const taskStats2 = await statsRes2.json();
      const habitsRes2 = await fetch('/api/habits');
      const habits2 = await habitsRes2.json();
      const habitList2 = Object.values(habits2 || {});
      const labels2 = taskStats2.map(w => { try { return new Date(w.date).toLocaleDateString(undefined, { weekday: 'long' }); } catch (e) { return w.date; } });
      const taskData = taskStats2.map(w => w.completed);
      const habitData = taskStats2.map(w => { const dateStr = w.date; return habitList2.reduce((acc, h) => acc + ((h.completed_dates || []).includes(dateStr) ? 1 : 0), 0); });
      const mergedBarColor = getChartBarColor();
      const colors = getThemeChartColors();
      
      mergedHabitTaskChartInstance = new Chart(habitEl, {
        type: 'bar',
        data: {
          labels: labels2,
          datasets: [
            { label: 'Tasks Completed', data: taskData, backgroundColor: mergedBarColor, borderColor: colors.outline, borderWidth: 1 },
            { label: 'Habits Completed', data: habitData, backgroundColor: mergedBarColor, borderColor: colors.outline, borderWidth: 1 }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          layout: { padding: { left: 12, right: 12, top: 12, bottom: 12 } },
          scales: { 
            x: { grid: { color: chartGridColor }, ticks: { color: chartTextColor } },
            y: { beginAtZero: true, grid: { color: chartGridColor }, ticks: { stepSize: 1, color: chartTextColor, callback: function(value) { return Number.isInteger(value) ? value : ''; } } } 
          },
          plugins: { legend: { onClick: function() {}, labels: { boxWidth: 20, color: chartTextColor } }, tooltip: { enabled: false } }
        }
      });
    }
  } catch (err) {
    console.error('Error refreshing charts:', err);
  }
}

function updateHeaderLegend(canvasId, chartInstance) {
  try {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !chartInstance) return;
    // find the nearest chart-card so we can locate the header legend whether
    // it's inside .chart-container or placed as a direct child of .chart-card
    const card = canvas.closest('.chart-card');
    if (!card) return;
    const legend = card.querySelector('.chart-legend');
    if (!legend) return;
    
    const swatchCompleted = legend.querySelector('.legend-swatch:not(.pending-swatch)');
    const swatchPending = legend.querySelector('.legend-swatch.pending-swatch');
    const ds = chartInstance.data && chartInstance.data.datasets && chartInstance.data.datasets[0];
    if (!ds) return;
    const bg = ds.backgroundColor;
    // In Green Dark Mode the legend colors are static theme colors and must
    // never change based on dataset colors (even on empty-state grey ring).
    // Use CSS variables where available so designers can tweak in CSS.
    if (!document.body.classList.contains('light-theme')) {
      try {
        const lc = getCSSVariable('--legend-completed') || '#10B981';
        const lp = getCSSVariable('--legend-pending') || '#4a5050';
        if (swatchCompleted) swatchCompleted.style.backgroundColor = lc;
        if (swatchPending) swatchPending.style.backgroundColor = lp;
      } catch (e) {
        if (swatchCompleted) swatchCompleted.style.backgroundColor = '#10B981';
        if (swatchPending) swatchPending.style.backgroundColor = '#4a5050';
      }
      // Ensure swatches have no border so DOM legend squares match canvas/tooltips
      try {
        if (swatchCompleted) swatchCompleted.style.border = 'none';
        if (swatchPending) swatchPending.style.border = 'none';
      } catch (e) { /* non-critical */ }
      // bind clicks and return early — we don't want dataset colors to override
      bindHeaderLegendClicks(canvas.closest('.chart-card'), chartInstance);
      return;
    }
    if (Array.isArray(bg)) {
      if (swatchCompleted && bg[0]) swatchCompleted.style.backgroundColor = bg[0];
      if (swatchPending && bg[1]) swatchPending.style.backgroundColor = bg[1];
    } else if (typeof bg === 'string') {
      if (swatchCompleted) swatchCompleted.style.backgroundColor = bg;
    }
    // Ensure swatches have no border so header squares match the tooltip/canvas fills
    try {
      if (swatchCompleted) swatchCompleted.style.border = 'none';
      if (swatchPending) swatchPending.style.border = 'none';
    } catch (e) { /* ignore */ }
    // bind click handlers so header legend toggles dataset visibility like Chart.js legend
    bindHeaderLegendClicks(card, chartInstance);
  } catch (e) {
    console.warn('updateHeaderLegend error', e);
  }
}

function bindHeaderLegendClicks(card, chartInstance) {
  try {
    const legend = card.querySelector('.chart-legend');
    if (!legend || !chartInstance) return;
    // If this legend belongs to the dashboard doughnuts, make it non-interactive.
    // We intentionally keep the header HTML but suppress click/keyboard affordances
    // so the layout/text remains unchanged.
    const canvasId = chartInstance && chartInstance.canvas && chartInstance.canvas.id;
    const swatches = legend.querySelectorAll('.legend-swatch, .legend-label');
    if (canvasId === 'taskProgressChart' || canvasId === 'habitProgressChart') {
      swatches.forEach(el => {
        try {
          el.style.cursor = 'default';
        } catch (e) {}
        // remove any click handler that might have been bound earlier
        try { el.onclick = null; } catch (e) {}
        try { el.removeEventListener && el.removeEventListener('click', () => {}); } catch (e) {}
        // accessibility: mark as disabled and remove from tab order
        try { el.setAttribute('aria-disabled', 'true'); el.tabIndex = -1; } catch (e) {}
      });
      return;
    }

    // single dataset doughnut: toggle visibility of dataset[0]
    swatches.forEach(el => {
      el.style.cursor = 'pointer';
      el.onclick = () => {
        const ds = chartInstance.data.datasets[0];
        ds.hidden = !ds.hidden;
        chartInstance.update();
        // visually indicate hidden state by dimming swatch
        const sw1 = legend.querySelector('.legend-swatch:not(.pending-swatch)');
        const sw2 = legend.querySelector('.legend-swatch.pending-swatch');
        if (ds.hidden) {
          if (sw1) sw1.style.opacity = '0.35';
          if (sw2) sw2.style.opacity = '0.35';
        } else {
          if (sw1) sw1.style.opacity = '1';
          if (sw2) sw2.style.opacity = '1';
        }
      };
    });
  } catch (e) { console.warn('bindHeaderLegendClicks', e); }
}

// Force-remove tooltip color-box outline for a specific chart instance (dashboard doughnuts)
function clearDashboardTooltipOutline(chartInstance) {
  try {
    if (!chartInstance) return;
    // build a labelColor callback that returns a flat fill with no border
    const cb = function(context) {
      try {
        const colors = getThemeChartColors();
        // Prefer dataset color when available
        const ds = context.dataset || {};
        let bg = null;
        if (Array.isArray(ds.backgroundColor)) {
          bg = ds.backgroundColor[context.dataIndex];
        } else if (ds.backgroundColor) {
          bg = ds.backgroundColor;
        }
        // Fallback to theme mapping by label (pending/completed)
        if (!bg) {
          const label = context.label ? String(context.label).toLowerCase() : '';
          if (label.includes('pending')) bg = colors.pending || getCSSVariable('--chart-pending');
          else bg = colors.completed || getCSSVariable('--chart-completed');
        }
        if (!bg) bg = colors.pending || getCSSVariable('--chart-pending') || '#4a5050';
        return { borderColor: '#000', borderWidth: 2, backgroundColor: bg };
      } catch (e) { return { borderColor: '#000', borderWidth: 2, backgroundColor: getThemeChartColors().pending || '#4a5050' }; }
    };
    chartInstance.options = chartInstance.options || {};
    chartInstance.options.plugins = chartInstance.options.plugins || {};
    chartInstance.options.plugins.tooltip = chartInstance.options.plugins.tooltip || {};
    chartInstance.options.plugins.tooltip.callbacks = chartInstance.options.plugins.tooltip.callbacks || {};
    chartInstance.options.plugins.tooltip.callbacks.labelColor = cb;
    try { chartInstance.update(); } catch (e) {}
  } catch (e) { /* ignore */ }
}

// Expose so other pages (tasks.js) can call to refresh charts after mutations
window.refreshCharts = refreshCharts;

// Run on load to populate charts
function initISTClock() {
  const hoursEl = document.getElementById('hours');
  const minutesEl = document.getElementById('minutes');
  const secondsEl = document.getElementById('seconds');
  const dateEl = document.getElementById('date-display');
  if (!hoursEl || !minutesEl || !secondsEl || !dateEl) return null;

  const timeFormatter = new Intl.DateTimeFormat([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, timeZone: 'Asia/Kolkata' });
  const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'long', day: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });

  function pad(v) { return String(v).padStart(2, '0'); }

  function update() {
    const now = new Date();
    // Use Intl to get Asia/Kolkata time parts
    const parts = timeFormatter.formatToParts(now);
    const h = parts.find(p => p.type === 'hour')?.value || '00';
    const m = parts.find(p => p.type === 'minute')?.value || '00';
    const s = parts.find(p => p.type === 'second')?.value || '00';
    hoursEl.textContent = h;
    minutesEl.textContent = m;
    secondsEl.textContent = s;
    dateEl.textContent = dateFormatter.format(now);
  }

  update();
  const id = setInterval(update, 1000);
  // cleanup on unload
  window.addEventListener('beforeunload', () => clearInterval(id));
  return id;
}

// ============ THEME TOGGLE ============
function initThemeToggle() {
  const themeToggle = document.getElementById('themeToggle');
  if (!themeToggle) return;

  // Load saved theme from localStorage
  const savedTheme = localStorage.getItem('theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    themeToggle.classList.add('active');
  }

  // Toggle theme on click
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    themeToggle.classList.toggle('active');
    
    // Save theme preference
    const currentTheme = document.body.classList.contains('light-theme') ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme);
    
    // Update chart colors immediately for existing charts (from CSS variables)
    try {
      const colors = getThemeChartColors();
      
      // Update task progress chart
      if (taskProgressChartInstance && taskProgressChartInstance.data.datasets[0]) {
        const ds = taskProgressChartInstance.data.datasets[0];
        if (Array.isArray(ds.backgroundColor) && ds.backgroundColor.length === 2) {
          ds.backgroundColor[0] = colors.completed;
          ds.backgroundColor[1] = colors.pending;
          // Keep segment borders invisible so tooltip/legend swatches show as flat fills
          ds.borderColor = [colors.completed, colors.pending];
          ds.borderWidth = 0;
          taskProgressChartInstance.update();
          updateHeaderLegend('taskProgressChart', taskProgressChartInstance);
        }
      }
      
      // Update habit progress chart
      if (habitProgressChartInstance && habitProgressChartInstance.data.datasets[0]) {
        const ds = habitProgressChartInstance.data.datasets[0];
        if (Array.isArray(ds.backgroundColor) && ds.backgroundColor.length === 2) {
          ds.backgroundColor[0] = colors.completed;
          ds.backgroundColor[1] = colors.pending;
          // Keep segment borders invisible so tooltip/legend swatches show as flat fills
          ds.borderColor = [colors.completed, colors.pending];
          ds.borderWidth = 0;
          habitProgressChartInstance.update();
          updateHeaderLegend('habitProgressChart', habitProgressChartInstance);
        }
      }
    } catch (e) {
      console.warn('Could not update chart colors:', e);
    }
    
    // Refresh charts to update text colors and rebuild if needed
    try {
      if (window.refreshCharts) {
        window.refreshCharts();
      }
    } catch (e) {
      console.warn('Could not refresh charts:', e);
    }
    // Reset typography flag to allow re-application for new theme
    _typographyApplied = false;
    // Apply Green Dark Mode typography/color tweaks immediately after toggle
    try { applyGreenDarkModeTypography(); } catch (e) { console.warn('applyGreenDarkModeTypography failed', e); }
  });
}

// Apply typography and color updates for Green Dark Mode only.
// - Copy font-family, font-weight, and letter-spacing from the date display to the hero tagline
// - Set colors for hero tagline and nav brand (text + icon) to #A7CFC2
// - Remove underline from nav-brand and suppress any logo shadows
// This function toggles styles on/off depending on the current theme and is safe to call on every toggle.
// Track if typography has been applied to prevent flickering
let _typographyApplied = false;
let _lastThemeState = null;

function applyGreenDarkModeTypography() {
  try {
    const isLight = document.body.classList.contains('light-theme');
    
    // Only re-apply if theme changed or first time
    if (_typographyApplied && _lastThemeState === isLight) return;

    const hero = document.getElementById('heroTagline');
    const dateEl = document.getElementById('date-display');
    const navBrand = document.querySelector('.nav-brand');
    const navBrandSpan = navBrand ? navBrand.querySelector('span') : null;
    const navBrandIcon = navBrand ? navBrand.querySelector('i') : null;

    // If we are in Light Mode, remove any inline styles we applied earlier
    if (isLight) {
      if (hero) {
        hero.style.color = '';
        // revert font styles only if we set them previously
        hero.style.fontFamily = '';
        hero.style.fontWeight = '';
        hero.style.letterSpacing = '';
      }
      if (navBrandSpan) { navBrandSpan.style.color = ''; }
      if (navBrandIcon) { navBrandIcon.style.color = ''; }
      if (navBrand) { navBrand.style.textDecoration = ''; navBrand.style.textShadow = ''; navBrand.style.boxShadow = ''; navBrand.classList.remove('gd-no-hover'); }
      _typographyApplied = true;
      _lastThemeState = isLight;
      return;
    }

    // Green Dark Mode: apply styles
    const brandColor = '#A7CFC2';
    if (hero && dateEl) {
      const ds = getComputedStyle(dateEl);
      // copy family/weight/letter-spacing; keep size/position unchanged
      hero.style.fontFamily = ds.fontFamily || '';
      hero.style.fontWeight = ds.fontWeight || '';
      hero.style.letterSpacing = ds.letterSpacing || '';
      hero.style.color = brandColor;
    } else if (hero) {
      // If no date element, still apply color
      hero.style.color = brandColor;
    }

    if (navBrandSpan) {
      navBrandSpan.style.color = brandColor;
    }
    if (navBrandIcon) {
      navBrandIcon.style.color = brandColor;
    }
    if (navBrand) {
      navBrand.style.textDecoration = 'none';
      navBrand.style.textShadow = 'none';
      navBrand.style.boxShadow = 'none';
      // ensure hover doesn't change color in dark mode for the logo
      navBrand.classList.add('gd-no-hover');
    }
    
    _typographyApplied = true;
    _lastThemeState = isLight;
  } catch (e) {
    console.warn('applyGreenDarkModeTypography error', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Remove preload class after page is loaded to enable smooth transitions
  // Add it to body first to prevent flickering
  document.body.classList.add('preload');
  
  // Remove preload class after a short delay to allow initial layout to settle
  setTimeout(() => {
    document.body.classList.remove('preload');
  }, 50);
  
  // Initialize theme toggle
  initThemeToggle();
  // Ensure Chart.js tooltip default box size follows our CSS variable so
  // any charts created afterwards inherit the larger hover color box.
  try {
    const _legendBoxSize = parseInt(getCSSVariable('--legend-box-size')) || 12;
    const _tooltipBoxSize = parseInt(getCSSVariable('--tooltip-box-size')) || (_legendBoxSize + 6);
    if (window.Chart && Chart.defaults && Chart.defaults.plugins && Chart.defaults.plugins.tooltip) {
      Chart.defaults.plugins.tooltip.boxWidth = _tooltipBoxSize;
      Chart.defaults.plugins.tooltip.boxHeight = _tooltipBoxSize;
      // Disable tooltip animation so the small color box doesn't animate
      // (keeps the color square visually constant on hover)
      try { Chart.defaults.plugins.tooltip.animation = false; } catch (e) { /* ignore */ }
    }
  } catch (e) { /* ignore */ }

  // refreshCharts is async — after it completes, ensure dashboard doughnut
  // instances explicitly have tooltip color boxes with no outline.
  try {
    refreshCharts().then(() => {
      try { clearDashboardTooltipOutline(taskProgressChartInstance); } catch (e) {}
      try { clearDashboardTooltipOutline(habitProgressChartInstance); } catch (e) {}
    }).catch(() => {});
  } catch (e) { try { refreshCharts(); } catch (e) {} }
  // apply the dashboard 'Budget Spent' stat color to headings/brand
  try { applyStatColorToElements(); } catch (e) { console.warn('applyStatColorToElements failed on DOMContentLoaded', e); }
  // apply Green Dark Mode typography tweaks (if dark mode active)
  try { applyGreenDarkModeTypography(); } catch (e) { console.warn('applyGreenDarkModeTypography failed on DOMContentLoaded', e); }
  try { initISTClock(); } catch (e) { console.warn('IST clock init failed', e); }
  // Make the four top summary cards non-interactive: prevent navigation but allow text selection
  try {
    const summaryCards = document.querySelectorAll('.quick-stats a.stat-viridian');
    summaryCards.forEach(a => {
      // Remove href to prevent navigation while keeping as anchor for styling
      a.removeAttribute('href');
      // Make them non-focusable via keyboard
      try { a.tabIndex = -1; } catch (e) {}
      // mark as disabled for assistive tech
      a.setAttribute('aria-disabled', 'true');
      // Set cursor to default (not pointer) since they're not clickable
      a.style.cursor = 'default';
    });
  } catch (e) { /* ignore if DOM not as expected */ }
  // Sync dashboard monthly budget from localStorage if present.
  try {
    initMonthlyBudget();
  } catch (e) { /* ignore localStorage */ }
});

// Clock widget removed — related width-sync/responsive JS cleaned up.

// --- Cross-tab communication: BroadcastChannel with localStorage fallback ---
// Allows other open tabs/windows to refresh charts when data changes
let _mlt_broadcast = null;
try {
  if ('BroadcastChannel' in window) {
    _mlt_broadcast = new BroadcastChannel('mlt_channel');
    _mlt_broadcast.onmessage = (ev) => {
      try {
        if (ev.data && ev.data.type === 'refresh') refreshCharts();
      } catch (e) {
        console.error('mlt broadcast handler error', e);
      }
    };
  }
} catch (e) {
  console.warn('BroadcastChannel unavailable:', e);
  _mlt_broadcast = null;
}

// storage event fallback: other tabs set localStorage key to notify
window.addEventListener('storage', (ev) => {
  if (!ev) return;
  if (ev.key === 'mlt_refresh' && ev.newValue) {
    // ignore our own set if needed; just refresh
    refreshCharts();
  }
});

// Also refresh charts when page is shown (handles back/forward cache)
window.addEventListener('pageshow', (event) => {
  try {
    // Force refresh charts to replay animation
    refreshCharts();
  } catch (e) { console.error('pageshow refresh failed', e); }
});

function notifyDataChanged() {
  // Refresh locally
  try { refreshCharts(); } catch (e) { console.error(e); }
  // Broadcast to other tabs
  try {
    if (_mlt_broadcast) {
      _mlt_broadcast.postMessage({ type: 'refresh', ts: Date.now() });
      return;
    }
  } catch (e) {
    console.warn('broadcast postMessage failed', e);
  }
  // Fallback: write to localStorage (other tabs will see storage event)
  try {
    localStorage.setItem('mlt_refresh', Date.now().toString());
    // clean up key to avoid clutter (other tabs will have already received event)
    setTimeout(() => { try { localStorage.removeItem('mlt_refresh'); } catch (e) {} }, 500);
  } catch (e) {
    console.warn('localStorage fallback failed', e);
  }
}

// expose notifier so pages can call it after mutations
window.notifyDataChanged = notifyDataChanged;

// === Task Tracker ===
function addTask() {
  const taskInput = document.getElementById('taskInput');
  const taskList = document.getElementById('taskList');
  if (taskInput.value.trim() === '') return;

  const li = document.createElement('li');
  li.innerHTML = `${taskInput.value}<button onclick="completeTask(this)">✔️</button>`;
  taskList.appendChild(li);
  taskInput.value = '';
}
function completeTask(btn) {
  btn.parentElement.classList.toggle('completed');
}

// === Notes ===

// === Weather (using OpenWeatherMap API) ===
async function getWeather() {
  const city = document.getElementById('cityInput').value.trim();
  const resultDiv = document.getElementById('weatherResult');
  if (!city) return;

  resultDiv.innerHTML = 'Loading...';
  try {
    const apiKey = 'YOUR_API_KEY_HERE'; // Replace later
    const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}&units=metric`);
    const data = await res.json();

    if (data.cod !== 200) {
      resultDiv.innerHTML = `<p>City not found 😕</p>`;
      return;
    }

    resultDiv.innerHTML = `
      <h3>${data.name}, ${data.sys.country}</h3>
      <p>🌡️ Temperature: ${data.main.temp}°C</p>
      <p>💧 Humidity: ${data.main.humidity}%</p>
      <p>🌬️ Wind: ${data.wind.speed} m/s</p>
      <p>☁️ Condition: ${data.weather[0].description}</p>
    `;
  } catch (err) {
    resultDiv.innerHTML = `<p>Error fetching weather!</p>`;
  }
}
