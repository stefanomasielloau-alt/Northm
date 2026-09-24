// North Strategy module — editable grid layout + widget-swap engine.
// 2026-09-23: rolled out across all 33 of Strategy's grid pages/tabs (see
// PAGE_GRID_CONTAINERS below for the full list) and live on main/production
// -- this comment used to say "pilot: Home page only, not yet on main",
// true when this file was first written, stale by the time the rollout
// actually finished. Corrected so a future read of this file doesn't
// undersell what's already shipped.
//
// Ordo.html has no virtual DOM: render() fully replaces #main's innerHTML
// every time ANY app state changes (dropdown, page nav, org switch — see
// render() in the main script). So this can't init GridStack once on page
// load like the static mockup did — it has to be safe to call again every
// time a page's HTML is rebuilt, against a brand-new set of DOM nodes, and
// it always re-applies the last known layout + widget choices so nothing
// appears to reset just because something elsewhere in the app changed.
//
// Two independent, separately-persisted things per box:
//  - WHERE it is / how big (GridStack's own x/y/w/h, saved by gs-id via
//    localStorage key northm_ordo_grid_<pageId>)
//  - WHAT'S in it (the widget id assigned to that box, saved separately via
//    localStorage key northm_ordo_widgets_<pageId>) — swapping content never
//    touches position/size and vice versa.
//
// window.northGridAfterRender(pageId) is called by render() in Ordo.html
// right after it sets #main's innerHTML (wrapped in try/catch there, so a
// bug in here can never break the app's core render loop). Add a branch
// here — not in render() itself — to wire up more pages later; each new
// page just needs its own entry in WIDGET_LIBRARIES plus the matching
// <div class="grid-stack" id="ordo-grid-<pageId>"> + per-box widget
// functions in Ordo.html, following the Home page as the template.
(function () {
  // ---- Widget library: one entry per page, once that page is wired up ----
  // Each widget's fn() returns the box's inner HTML (no .grid-stack-item
  // wrapper) by calling the real render function already used elsewhere in
  // the app, so a swapped-in widget shows real, live data — never a stub.
  var WIDGET_LIBRARIES = {
    home: {
      defaults: { box1: 'kpis', box2: 'quicklinks', box3: 'validations', box4: 'recent' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gates, regions/pods, campaigns, validations', fn: function () { return window.homeWidgetKpis(); } },
        quicklinks: { label: 'Quick links', hint: 'Shortcuts to Overview / Configure / Plan / Measure pages', fn: function () { return window.homeWidgetQuickLinks(); } },
        validations: { label: 'Validations', hint: 'Blocking and advisory validation messages', fn: function () { return window.homeWidgetValidations(); } },
        recent: { label: 'Recent activity', hint: 'Latest entries from the audit log', fn: function () { return window.homeWidgetRecentActivity(); } }
      }
    },
    drivers: {
      defaults: { box1: 'kpis', box2: 'global', box3: 'ratelibrary', box4: 'segmentmult', box5: 'streamcontrib', box6: 'streamsegcheck', box7: 'regioncontrib', box8: 'podsharedrivers' },
      boxSizes: { box1: 12, box2: 4, box3: 8, box4: 6, box5: 6, box6: 6, box7: 6, box8: 6 }, // first-ever default only; drag/resize overrides after that
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Win target, revenue, deal size, implied wins, end-to-end rate', fn: function () { return window.driversWidgetKpis(); } },
        global: { label: 'Global drivers', hint: 'Editable base assumptions (deal size, revenue, win target, entry volume)', fn: function () { return window.driversWidgetGlobal(); } },
        ratelibrary: { label: 'Rate library', hint: 'Published vs observed rate per gate, with evidence and adopt-observed action', fn: function () { return window.driversWidgetRateLibrary(); } },
        segmentmult: { label: 'Segment rate multipliers', hint: 'Rate multiplier and mix by segment', fn: function () { return window.driversWidgetSegmentMultipliers(); } },
        streamcontrib: { label: 'Stream marketing contribution', hint: 'Marketing-attributed wins by stream', fn: function () { return window.driversWidgetStreamContribution(); } },
        // 2026-09-23: 3 widgets recovered from the North V2 reference mockup that
        // never made it into the live library -- see the matching comment above
        // driversWidgetStreamSegmentCheck() in Ordo.html for scope notes.
        streamsegcheck: { label: 'Stream & segment mix check', hint: 'Sanity-check that stream mix and segment mix both total 100%', fn: function () { return window.driversWidgetStreamSegmentCheck(); } },
        regioncontrib: { label: 'Region contribution (net new)', hint: 'Region share of ACV target, modeled — no FY-phased driver configured yet', fn: function () { return window.driversWidgetRegionContribution(); } },
        podsharedrivers: { label: 'Pod marketing % share drivers', hint: 'Equal-split vs. each pod\'s allocated share, by region', fn: function () { return window.driversWidgetPodShareDrivers(); } }
      }
    },
    // Planning engine is tab-based (UI.planTab): each tab gets its OWN grid,
    // keyed 'plan_<tab>' rather than just 'plan' -- see the __northGridSubId
    // override in northGridAfterRender below. Layout/widget-assignment
    // localStorage is therefore independent per tab.
    plan_top: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'bystream', box4: 'waterfall' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gate-by-gate volumes required, top-down', fn: function () { return window.planTopWidgetKpis(); } },
        funnel: { label: 'Funnel (top-down)', hint: 'Funnel chart of volume required at each gate', fn: function () { return window.planTopWidgetFunnel(); } },
        bystream: { label: 'By stream', hint: 'Top-down volumes and ACV broken out by stream', fn: function () { return window.planTopWidgetByStream(); } },
        waterfall: { label: 'Marketing contribution build-up', hint: 'Waterfall of marketing-attributed wins by stream', fn: function () { return window.planTopWidgetWaterfall(); } }
      }
    },
    plan_bot: {
      defaults: { box1: 'kpis', box2: 'entryvolume', box3: 'delivers', box4: 'waterfall' },
      boxSizes: { box1: 12, box2: 4, box3: 8, box4: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Gate-by-gate volumes delivered, bottom-up', fn: function () { return window.planBotWidgetKpis(); } },
        entryvolume: { label: 'Entry volume by stream', hint: 'Editable total entry volume, split by stream mix', fn: function () { return window.planBotWidgetEntryVolume(); } },
        delivers: { label: 'What entry volume delivers', hint: 'Funnel and by-stream table for bottom-up volumes', fn: function () { return window.planBotWidgetDelivers(); } },
        waterfall: { label: 'Marketing contribution build-up (bottom-up)', hint: 'Waterfall of marketing-attributed wins by stream, bottom-up', fn: function () { return window.planBotWidgetWaterfall(); } }
      }
    },
    plan_streamcmp: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'By stream comparison table', hint: 'Top-down vs bottom-up wins/ACV/gap by stream', fn: function () { return window.planStreamcmpWidgetTable(); } },
        chart: { label: 'Wins by stream chart', hint: 'Line chart of top-down vs bottom-up wins by stream', fn: function () { return window.planStreamcmpWidgetChart(); } }
      }
    },
    plan_rec: {
      defaults: { box1: 'kpis', box2: 'table', box3: 'chart' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Entry/exit gap between top-down and bottom-up', fn: function () { return window.planRecWidgetKpis(); } },
        table: { label: 'By-gate comparison table', hint: 'Top-down vs bottom-up by gate, with gap % and status', fn: function () { return window.planRecWidgetTable(); } },
        chart: { label: 'Gate comparison chart', hint: 'Line chart of top-down vs bottom-up by gate', fn: function () { return window.planRecWidgetChart(); } }
      }
    },
    plan_phase: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Phased plan table', hint: 'Volumes phased by seasonality, with entry lead-time', fn: function () { return window.planPhaseWidgetTable(); } },
        chart: { label: 'Seasonality chart', hint: 'Bar chart of seasonality-weighted wins by period', fn: function () { return window.planPhaseWidgetChart(); } }
      }
    },
    // Geography & pods: boxes 6-8 (pod breakdown / rate override / stream mix
    // override) only render while a region is selected, and box 9 (rep
    // breakdown) only while that region has a pod -- pageGeo() itself decides
    // which boxes exist each render; this library just lists what CAN appear.
    geo: {
      defaults: { box1: 'kpis', box2: 'gapanalysis', box3: 'streamfunnel', box4: 'winschart', box5: 'acvchart', box6: 'podbreakdown', box7: 'rateoverride', box8: 'streammixoverride', box9: 'repbreakdown' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 6, box5: 6, box6: 12, box7: 12, box8: 12, box9: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'ACV target, projected revenue, variance, AE headcount, wins needed', fn: function () { return window.geoWidgetKpis(); } },
        gapanalysis: { label: 'Gap analysis by region', hint: 'Editable ACV target per region vs demand potential', fn: function () { return window.geoWidgetGapAnalysis(); } },
        streamfunnel: { label: 'Region × stream funnel', hint: 'Demand potential by region and stream, every gate', fn: function () { return window.geoWidgetStreamFunnel(); } },
        winschart: { label: 'Wins needed by region', hint: 'Bar chart of wins needed per region', fn: function () { return window.geoWidgetWinsChart(); } },
        acvchart: { label: 'ACV target vs demand potential', hint: 'Stacked chart of ACV target by region', fn: function () { return window.geoWidgetAcvChart(); } },
        podbreakdown: { label: 'Pod breakdown', hint: 'Editable pod shares for the selected region', fn: function () { return window.geoWidgetPodBreakdown(); } },
        rateoverride: { label: 'Rate override', hint: 'Per-gate rate override for the selected region', fn: function () { return window.geoWidgetRateOverride(); } },
        streammixoverride: { label: 'Stream mix override', hint: 'Per-stream mix override for the selected region', fn: function () { return window.geoWidgetStreamMixOverride(); } },
        repbreakdown: { label: 'Rep breakdown', hint: 'Editable rep shares for the selected pod', fn: function () { return window.geoWidgetRepBreakdown(); } }
      }
    },
    activity: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'entrychart', box4: 'costchart' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Wins planned, gate volumes required, total and per-win cost', fn: function () { return window.activityWidgetKpis(); } },
        funnel: { label: 'Activity funnel', hint: 'Editable win target per activity, grouped by route, with cost and capacity fit', fn: function () { return window.activityWidgetFunnel(); } },
        entrychart: { label: 'Entry volume by activity', hint: 'Bar chart of entry-gate volume per activity', fn: function () { return window.activityWidgetEntryChart(); } },
        costchart: { label: 'Cost per win by activity', hint: 'Bar chart of cost per win, activities with tracked cost only', fn: function () { return window.activityWidgetCostChart(); } }
      }
    },
    segment: {
      defaults: { box1: 'kpis', box2: 'derivedplan', box3: 'entrychart', box4: 'acvchart', box5: 'observedrate' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Blended rate multiplier, deal size, addressable/engaged accounts, mix total', fn: function () { return window.segmentWidgetKpis(); } },
        derivedplan: { label: 'Derived plan by segment', hint: 'Wins, gate volumes, deal size and ACV per segment', fn: function () { return window.segmentWidgetDerivedPlan(); } },
        entrychart: { label: 'Entry volume required by segment', hint: 'Bar chart of entry-gate volume per segment', fn: function () { return window.segmentWidgetEntryChart(); } },
        acvchart: { label: 'ACV contribution by segment', hint: 'Waterfall of ACV contribution per segment', fn: function () { return window.segmentWidgetAcvChart(); } },
        observedrate: { label: 'Observed rate by segment', hint: 'Historical observed rate per gate, by segment, with evidence', fn: function () { return window.segmentWidgetObservedRate(); } }
      }
    },
    actuals: {
      defaults: { box1: 'kpis', box2: 'planvsactual', box3: 'trendchart', box4: 'regionchart', box5: 'monthlydetail' },
      boxSizes: { box1: 12, box2: 12, box3: 6, box4: 6, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Actual vs plan per gate, plus actual cost', fn: function () { return window.actualsWidgetKpis(); } },
        planvsactual: { label: 'Plan vs actual', hint: 'By-gate plan/actual/variance table with status', fn: function () { return window.actualsWidgetPlanVsActual(); } },
        trendchart: { label: 'Multi-year trend', hint: 'Line chart of actual vs plan across FY25-FY27', fn: function () { return window.actualsWidgetTrendChart(); } },
        regionchart: { label: 'Actual by region', hint: 'Bar chart of actual wins by region', fn: function () { return window.actualsWidgetRegionChart(); } },
        monthlydetail: { label: 'Monthly detail', hint: 'Month-by-month gate volumes, cost and ACV for the selected FY', fn: function () { return window.actualsWidgetMonthlyDetail(); } }
      }
    },
    // Insight is tab-based (UI.insightTab), same treatment as Planning engine:
    // one grid per tab, keyed 'insight_<tab>'.
    insight_season: {
      defaults: { box1: 'indexchart', box2: 'monthlychart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        indexchart: { label: 'Seasonality index chart', hint: 'Bar chart of the seasonality index by fiscal month', fn: function () { return window.insightSeasonWidgetIndexChart(); } },
        monthlychart: { label: 'Monthly actuals by FY', hint: 'Line chart of monthly exit-gate actuals across FY25/FY26', fn: function () { return window.insightSeasonWidgetMonthlyChart(); } }
      }
    },
    insight_vel: {
      defaults: { box1: 'dayschart', box2: 'stagelag' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        dayschart: { label: 'Days to reach each gate', hint: 'Bar chart of cumulative days to each gate', fn: function () { return window.insightVelWidgetDaysChart(); } },
        stagelag: { label: 'Stage lag table', hint: 'Editable median days per stage, with cumulative days and latest entry date', fn: function () { return window.insightVelWidgetStageLag(); } }
      }
    },
    insight_lift: {
      defaults: { box1: 'table', box2: 'heatmap' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Observed rate vs baseline table', hint: 'Observed rate by activity vs the all-activity baseline, with lift and evidence', fn: function () { return window.insightLiftWidgetTable(); } },
        heatmap: { label: 'Rate heat map', hint: 'Heat map of observed rate by activity x gate', fn: function () { return window.insightLiftWidgetHeatmap(); } }
      }
    },
    insight_scen: {
      defaults: { box1: 'table', box2: 'chart' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Scenario comparison table', hint: 'Rate multiplier and gate volumes by scenario, vs Forecast', fn: function () { return window.insightScenWidgetTable(); } },
        chart: { label: 'Entry volume by scenario chart', hint: 'Bar chart of entry-gate volume required by scenario', fn: function () { return window.insightScenWidgetChart(); } }
      }
    },
    insight_ready: {
      defaults: { box1: 'sufficiency', box2: 'dimensionality' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        sufficiency: { label: 'Data sufficiency by gate', hint: 'Observation counts and confidence per gate, with what they support', fn: function () { return window.insightReadyWidgetSufficiency(); } },
        dimensionality: { label: 'Dimensionality table', hint: 'Member counts and cumulative addressable cells by dimension', fn: function () { return window.insightReadyWidgetDimensionality(); } }
      }
    },
    // Campaign, cost & capacity: boxes 5-7 (business case / pre-entry chain /
    // pod allocation) only render while a campaign is selected, and box 6
    // additionally only while that campaign's activity has a pre-entry chain
    // -- pageCampaign() builds the box list dynamically each render, same
    // approach as Geography & pods.
    campaign: {
      defaults: { box1: 'kpis', box2: 'calendar', box3: 'table', box4: 'costbucketchart', box5: 'businesscase', box6: 'prechain', box7: 'podallocation', box8: 'portfolio', box9: 'capacity' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12, box5: 12, box6: 12, box7: 12, box8: 12, box9: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Budgeted, committed, actual spend, peak concurrency, cost per win', fn: function () { return window.campaignWidgetKpis(); } },
        calendar: { label: 'Campaign calendar', hint: 'Concurrency and straight-lined spend over the next 12 months', fn: function () { return window.campaignWidgetCalendar(); } },
        table: { label: 'Campaigns in scope', hint: 'Full campaign table with budget, spend, conversion and cost/win', fn: function () { return window.campaignWidgetTable(); } },
        costbucketchart: { label: 'Spend by cost bucket', hint: 'Bar chart of spend by cost bucket', fn: function () { return window.campaignWidgetCostBucketChart(); } },
        businesscase: { label: 'Business case', hint: 'Budget to projected wins for a selected campaign', fn: function () { return window.campaignWidgetBusinessCase(); } },
        prechain: { label: 'Pre-entry chain', hint: 'Channel-specific stages feeding into the entry gate for the selected campaign', fn: function () { return window.campaignWidgetPreChain(); } },
        podallocation: { label: 'Pod allocation', hint: 'Optional split of a campaign across pods by percentage', fn: function () { return window.campaignWidgetPodAllocation(); } },
        portfolio: { label: 'Portfolio business case', hint: 'Roll-up of every campaign business case in scope', fn: function () { return window.campaignWidgetPortfolio(); } },
        capacity: { label: 'Capacity check', hint: 'Monthly capacity vs plan need by activity, with utilisation and status', fn: function () { return window.campaignWidgetCapacity(); } }
      }
    },
    // Dashboard: all 5 boxes always render (no conditional omission, unlike
    // Geography & pods / Campaign & cost) -- the drift card handles its own
    // empty state internally when no snapshot exists yet.
    dashboard: {
      defaults: { box1: 'kpis', box2: 'funnel', box3: 'costbucketchart', box4: 'regions', box5: 'drift' },
      boxSizes: { box1: 12, box2: 6, box3: 6, box4: 12, box5: 12 },
      widgets: {
        kpis: { label: 'KPI summary', hint: 'Exit gate plan vs actual, budgeted, committed, actual spend, ACV vs demand potential', fn: function () { return window.dashboardWidgetKpis(); } },
        funnel: { label: 'Funnel — plan vs actual', hint: 'Gate-by-gate plan vs actual table with variance and status', fn: function () { return window.dashboardWidgetFunnel(); } },
        costbucketchart: { label: 'Spend by cost bucket', hint: 'Bar chart of spend by cost bucket', fn: function () { return window.dashboardWidgetCostBucketChart(); } },
        regions: { label: 'Regions at a glance', hint: 'Per-region ACV target vs demand potential table', fn: function () { return window.dashboardWidgetRegions(); } },
        drift: { label: 'Plan drift vs baseline snapshot', hint: 'Target and budget drift since a named snapshot', fn: function () { return window.dashboardWidgetDrift(); } }
      }
    },
    // Quick calculator: mostly interactive inputs, but the top-down and
    // bottom-up assumption/result pairs render as single boxes (each pair
    // was already one `grid g2` unit in the original layout, sharing state
    // between its two halves) rather than splitting further.
    calculator: {
      defaults: { box1: 'topdown', box2: 'bottomup', box3: 'bystream', box4: 'scenarios', box5: 'reference' },
      boxSizes: { box1: 12, box2: 12, box3: 12, box4: 12, box5: 12 },
      widgets: {
        topdown: { label: 'Top-down: assumptions & result', hint: 'Target wins, deal size, rate and cost/lead -> leads needed, cost, ROI', fn: function () { return window.calcWidgetTopDown(); } },
        bottomup: { label: 'Bottom-up: from volume', hint: 'Given expected entry volume, wins/cost/revenue run forward instead of backward', fn: function () { return window.calcWidgetBottomUp(); } },
        bystream: { label: 'By stream', hint: 'Top-down/bottom-up split across configured streams by mix share', fn: function () { return window.calcWidgetByStream(); } },
        scenarios: { label: 'Scenarios', hint: 'Save, load and remove named calculator scenarios', fn: function () { return window.calcWidgetScenarios(); } },
        reference: { label: 'Reference — real gate chain', hint: 'Blended assumption vs the detailed engine\'s actual per-gate rates', fn: function () { return window.calcWidgetReference(); } }
      }
    },
    // Admin & config: a settings/CRUD page, not an analysis page, so this is
    // the "awkward fit" treatment -- one grid per TAB (admin_<tab>, same
    // __northGridSubId mechanism as Planning engine/Insight), boxes are each
    // tab's existing card groupings. No conditional box omission (unlike
    // Geography & pods / Campaign & cost) -- every admin tab's cards always
    // render, since this is configuration state, not a drill-down view.
    admin_gates: {
      defaults: { box1: 'set', box2: 'preview', box3: 'presets' },
      boxSizes: { box1: 12, box2: 6, box3: 6 },
      widgets: {
        set: { label: 'Gate set', hint: 'Editable funnel gate chain: name, code, rate, order', fn: function () { return window.adminGatesWidgetSet(); } },
        preview: { label: 'Chain preview', hint: 'Funnel visualisation of the current gate chain', fn: function () { return window.adminGatesWidgetPreview(); } },
        presets: { label: 'Gate naming presets', hint: 'Starter gate-chain presets and where gates are used', fn: function () { return window.adminGatesWidgetPresets(); } }
      }
    },
    admin_geo: {
      defaults: { box1: 'regions', box2: 'pods', box3: 'reps' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        regions: { label: 'Regions', hint: 'Editable regions table with AE heads, ACV target, pod allocation', fn: function () { return window.adminGeoWidgetRegions(); } },
        pods: { label: 'Pods', hint: 'Editable pods table grouped by region', fn: function () { return window.adminGeoWidgetPods(); } },
        reps: { label: 'Reps', hint: 'Editable reps table grouped by pod', fn: function () { return window.adminGeoWidgetReps(); } }
      }
    },
    admin_streams: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Streams', hint: 'Editable stream mix, marketing contribution and derived wins', fn: function () { return window.adminStreamsWidgetTable(); } }
      }
    },
    admin_acts: {
      defaults: { box1: 'table', box2: 'prechains' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        table: { label: 'Activities', hint: 'Editable activities table: route, cost/lead, capacity, active state', fn: function () { return window.adminActsWidgetTable(); } },
        prechains: { label: 'Pre-Lead chains', hint: 'Optional per-activity channel-specific stages before the Lead gate', fn: function () { return window.adminActsWidgetPreChains(); } }
      }
    },
    admin_segs: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Segments', hint: 'Editable segments table: mix, rate/deal multipliers, addressable/engaged', fn: function () { return window.adminSegsWidgetTable(); } }
      }
    },
    admin_camps: {
      defaults: { box1: 'cursuslink', box2: 'programmes', box3: 'table' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        cursuslink: { label: 'Campaign Planning link', hint: 'Export/import bridge to the separate Campaign Planning tool', fn: function () { return window.adminCampsWidgetCursusLink(); } },
        programmes: { label: 'Programme roll-up', hint: 'Programmes with campaign count, budget, committed, actual', fn: function () { return window.adminCampsWidgetProgrammes(); } },
        table: { label: 'Campaigns', hint: 'Full editable campaigns table', fn: function () { return window.adminCampsWidgetTable(); } }
      }
    },
    admin_buckets: {
      defaults: { box1: 'sharedconfig', box2: 'localautosave', box3: 'costbuckets' },
      boxSizes: { box1: 6, box2: 6, box3: 12 },
      widgets: {
        sharedconfig: { label: 'Shared configuration', hint: 'Link and import from the cross-tool Configuration app', fn: function () { return window.adminBucketsWidgetSharedConfig(); } },
        localautosave: { label: 'Local autosave', hint: 'Clear this browser\'s local autosave', fn: function () { return window.adminBucketsWidgetLocalAutosave(); } },
        costbuckets: { label: 'Cost buckets', hint: 'Editable cost bucket list with campaign usage count', fn: function () { return window.adminBucketsWidgetCostBuckets(); } }
      }
    },
    admin_time: {
      defaults: { box1: 'fiscalcalendar', box2: 'periodmap' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        fiscalcalendar: { label: 'Fiscal calendar', hint: 'FY start month, reporting grain, current FY', fn: function () { return window.adminTimeWidgetFiscalCalendar(); } },
        periodmap: { label: 'Period map', hint: 'How loaded months resolve to FY/quarter/half/seasonality', fn: function () { return window.adminTimeWidgetPeriodMap(); } }
      }
    },
    admin_ver: {
      defaults: { box1: 'table' },
      boxSizes: { box1: 12 },
      widgets: {
        table: { label: 'Versions & scenarios', hint: 'Version/scenario list with lock state and rate multiplier', fn: function () { return window.adminVerWidgetTable(); } }
      }
    },
    admin_users: {
      defaults: { box1: 'moved', box2: 'requirecommit' },
      boxSizes: { box1: 12, box2: 12 },
      widgets: {
        moved: { label: 'Roles & users (moved)', hint: 'Pointer to Configuration, where roles & users now live', fn: function () { return window.adminUsersWidgetMoved(); } },
        requirecommit: { label: 'Requires commit on plan edits', hint: 'Per-role toggle, Strategy/Campaign Planning only', fn: function () { return window.adminUsersWidgetRequireCommit(); } }
      }
    },
    admin_feeds: {
      defaults: { box1: 'connections', box2: 'loadrules', box3: 'adjacencies' },
      boxSizes: { box1: 12, box2: 6, box3: 6 },
      widgets: {
        connections: { label: 'Connections', hint: 'Feed connections table with rows, rejects, unassigned, state', fn: function () { return window.adminFeedsWidgetConnections(); } },
        loadrules: { label: 'Load rules', hint: 'The feed loading invariants (staging, idempotent keys, etc.)', fn: function () { return window.adminFeedsWidgetLoadRules(); } },
        adjacencies: { label: 'Future adjacencies', hint: 'Reserved join keys for not-yet-integrated tools', fn: function () { return window.adminFeedsWidgetAdjacencies(); } }
      }
    },
    admin_audit: {
      defaults: { box1: 'log' },
      boxSizes: { box1: 12 },
      widgets: {
        log: { label: 'Audit log', hint: 'This session\'s driver and dimension change log', fn: function () { return window.adminAuditWidgetLog(); } }
      }
    },
    snapshots: {
      defaults: { box1: 'save', box2: 'saved', box3: 'compare' },
      boxSizes: { box1: 12, box2: 12, box3: 12 },
      widgets: {
        save: { label: 'Save a snapshot', hint: 'Name and save the current whole plan as a snapshot', fn: function () { return window.snapshotsWidgetSave(); } },
        saved: { label: 'Saved snapshots', hint: 'Saved snapshot list -- revert, overlay, or remove', fn: function () { return window.snapshotsWidgetSaved(); } },
        compare: { label: 'Compare vs snapshots & actual', hint: 'Gate-by-gate current plan vs up to 3 recent snapshots vs actual', fn: function () { return window.snapshotsWidgetCompare(); } }
      }
    },
    // Relationships: a single interactive pan/zoom/drag canvas, not a set of
    // independent lenses -- one box, no real widget picker, wrapped purely
    // for structural consistency with the rest of the app.
    relationships: {
      defaults: { box1: 'graph' },
      boxSizes: { box1: 12 },
      widgets: {
        graph: { label: 'Relationship graph', hint: 'Campaign -> owner / business-unit node graph, drag to pin, click to focus', fn: function () { return window.relationshipsWidgetGraph(); } }
      }
    }
  };

  /* 2026-09-23 (Stef: "I think we should have a Strategy wide categorized
     library of tiles and widgets ... you can choose from regardless of
     screen"): human-readable category label per page/tab, used only by the
     swap picker's cross-page "browse the full library" section below --
     purely a display label, has no effect on WIDGET_LIBRARIES/defaults/
     rendering. Taxonomy is "by originating page" per Stef's own answer, so
     this is literally just PAGE_GRID_CONTAINERS' keys given a name a human
     would recognize, matching the nav sidebar and each page's own tab
     labels verbatim (ADMIN_TABS in Ordo.html, and the Planning engine /
     Insight tab button labels in pagePlan()/pageInsight()). */
  var PAGE_LABELS = {
    home: 'Home',
    dashboard: 'Dashboard',
    calculator: 'Quick calculator',
    drivers: 'Drivers & rates',
    plan_top: 'Planning engine — Top-down',
    plan_bot: 'Planning engine — Bottom-up',
    plan_streamcmp: 'Planning engine — Compare by stream',
    plan_rec: 'Planning engine — Reconciliation',
    plan_phase: 'Planning engine — Time phasing',
    geo: 'Geography & pods',
    segment: 'Segment & audience',
    activity: 'Activity plan',
    campaign: 'Campaign & cost',
    actuals: 'Actuals & history',
    insight_season: 'Insight — Seasonality',
    insight_vel: 'Insight — Velocity',
    insight_lift: 'Insight — Activity lift',
    insight_scen: 'Insight — Scenario compare',
    insight_ready: 'Insight — Data sufficiency',
    snapshots: 'Snapshots',
    relationships: 'Relationships',
    admin_gates: 'Admin & config — Funnel gates',
    admin_geo: 'Admin & config — Geography',
    admin_streams: 'Admin & config — Streams',
    admin_acts: 'Admin & config — Activities',
    admin_segs: 'Admin & config — Segments',
    admin_camps: 'Admin & config — Campaigns',
    admin_buckets: 'Admin & config — Cost buckets',
    admin_time: 'Admin & config — Time',
    admin_ver: 'Admin & config — Versions',
    admin_users: 'Admin & config — Roles & users',
    admin_feeds: 'Admin & config — Data feeds',
    admin_audit: 'Admin & config — Audit log'
  };

  /* Flat, page-qualified index over WIDGET_LIBRARIES for cross-page browsing
     and lookup: [{key:'plan_top.kpis', pageId, category, label, hint, fn}].
     Built once at load time (108 widgets across 33 pages -- cheap, done
     once, not rebuilt per picker open) rather than walking WIDGET_LIBRARIES
     fresh on every openSwapPicker() call. */
  var ALL_WIDGETS = [];
  Object.keys(WIDGET_LIBRARIES).forEach(function (pid) {
    var lib = WIDGET_LIBRARIES[pid];
    Object.keys(lib.widgets).forEach(function (wid) {
      var w = lib.widgets[wid];
      ALL_WIDGETS.push({ key: pid + '.' + wid, pageId: pid, category: PAGE_LABELS[pid] || pid, label: w.label, hint: w.hint, fn: w.fn });
    });
  });

  /* Resolves a widgetId that may be either a plain, page-local id (unchanged
     meaning: "the box's own page's own widget catalog", exactly as every
     widget assignment worked before today) or a page-qualified compound id
     "sourcePageId.localId" (new: a cross-page pick from the library browser
     below) into {label, hint, fn} -- or null if neither resolves. Centralised
     here so both the live swap-click path (applyWidgetSwap) and the
     initial-render path (initGrid's pre-pack pass below) resolve a pick
     identically, and so a page's own initial-render HTML in Ordo.html never
     needed to learn about compound ids at all -- it still only ever
     generates its own page's default widget on first paint; initGrid()
     patches in the real pick (same-page or cross-page) right after. */
  // 2026-09-24: rewrites a normal Google Docs/Sheets/Slides SHARE link (the kind you get from
  // the "Copy link" button, ".../edit?usp=sharing" etc) into that doc's embeddable form. Passes
  // any URL it doesn't recognise straight through unchanged -- covers an Office Online / SharePoint
  // embed URL a person already generated themselves, or any other doc host. Requires the doc to
  // be shared "Anyone with the link can view" (or wider) -- North has no Google credentials of its
  // own to authenticate a private doc with.
  function toEmbeddableDocUrl(url) {
    var u = String(url || '');
    var m = u.match(/docs\.google\.com\/document\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://docs.google.com/document/d/' + m[1] + '/preview';
    m = u.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://docs.google.com/spreadsheets/d/' + m[1] + '/preview';
    m = u.match(/docs\.google\.com\/presentation\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return 'https://docs.google.com/presentation/d/' + m[1] + '/embed';
    return u;
  }
  // 2026-09-24: renders arbitrary JSON (from an API-type widget's live fetch, or a webhook-type
  // widget's last stored payload) as something readable -- a table for an array of flat objects,
  // a key/value table for a flat object, pretty-printed JSON as a last resort. Deliberately simple
  // (no nested-table recursion) -- first pass, good enough for typical API/webhook payloads.
  function renderJsonPayload(data) {
    var esc = function (v) { return String(v == null ? '' : v).replace(/</g, '&lt;'); };
    if (data == null) return '<div class="mini" style="opacity:.6">No data yet.</div>';
    try {
      if (Array.isArray(data) && data.length && data[0] && typeof data[0] === 'object') {
        var cols = Object.keys(data[0]).slice(0, 6);
        var rows = data.slice(0, 20);
        var html = '<table class="tbl" style="width:100%;font-size:12px"><thead><tr>' +
          cols.map(function (c) { return '<th>' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
        rows.forEach(function (row) {
          html += '<tr>' + cols.map(function (c) {
            var v = row[c];
            return '<td>' + esc(typeof v === 'object' ? JSON.stringify(v) : v) + '</td>';
          }).join('') + '</tr>';
        });
        html += '</tbody></table>';
        if (data.length > 20) html += '<div class="mini">+' + (data.length - 20) + ' more rows</div>';
        return html;
      }
      if (typeof data === 'object') {
        var keys = Object.keys(data).slice(0, 20);
        return '<table class="tbl" style="width:100%;font-size:12px">' + keys.map(function (k) {
          var v = data[k];
          return '<tr><td style="font-weight:600;padding-right:8px">' + esc(k) + '</td><td>' +
            esc(typeof v === 'object' ? JSON.stringify(v) : v) + '</td></tr>';
        }).join('') + '</table>';
      }
      return '<div class="mini">' + esc(data) + '</div>';
    } catch (e) {
      try { return '<pre style="white-space:pre-wrap;font-size:11px">' + esc(JSON.stringify(data, null, 2)) + '</pre>'; }
      catch (e2) { return '<div class="mini">Could not display this data.</div>'; }
    }
  }
  // 2026-09-24: best-effort live fetch for an 'api'-type external widget. Most public APIs block
  // a direct browser request (CORS) -- that shows as a readable message rather than a blank tile,
  // since there's no way around it without a server-side proxy (a real, separate piece of work).
  function renderApiWidget(containerId, cw) {
    fetch(cw.url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = renderJsonPayload(data);
    }).catch(function (err) {
      var el = document.getElementById(containerId);
      if (el) el.innerHTML = '<div class="mini" style="color:#c33">Could not load this API (' +
        String(err && err.message || err).replace(/</g, '&lt;') +
        '). Most public APIs block a direct browser request (CORS) -- this usually needs a small server-side proxy.</div>';
    });
  }

  function resolveWidget(pageId, widgetId) {
    if (!widgetId) return null;
    var dot = widgetId.indexOf('.');
    if (dot === -1) {
      var lib = WIDGET_LIBRARIES[pageId];
      return lib ? (lib.widgets[widgetId] || null) : null;
    }
    var prefix = widgetId.slice(0, dot);
    // 2026-09-24 (Stef: "ADDING External Widgets/connectors"): a custom widget added
    // via Admin & config > Widget library, stored in CFG.customWidgets and picked
    // via a compound id of the same 'category.identifier' shape every other
    // cross-page pick already uses -- 'external.' isn't a real page id in
    // WIDGET_LIBRARIES, so it's checked first. CFG lives in Ordo.html's own global
    // scope, not this file's, but is reachable here as a bare identifier by the
    // time any widget actually renders (long after Ordo.html's own script block has
    // run) -- same reasoning as every widget fn() below already relies on.
    if (prefix === 'external') {
      var cwId = widgetId.slice(dot + 1);
      var cw = (typeof CFG !== 'undefined' && CFG.customWidgets || []).filter(function (w) { return w.id === cwId; })[0];
      if (!cw) return null;
      var cwType = cw.type || 'iframe';
      var cwEsc = function (v) { return String(v == null ? '' : v).replace(/"/g, '&quot;'); };
      return {
        label: cw.name, hint: cw.hint || '',
        // 2026-09-24 (Stef: "Need provision for API based widgets, webhook etc .. even a simple
        // doc/gsheet xls/gsheet etc view/insert"): four types share this one resolver now.
        // iframe/gdoc are both a plain embed (gdoc just rewrites a normal Google share link into
        // its embeddable form first). api/webhook both display JSON data via renderJsonPayload --
        // api fetches it live client-side each time the tile renders (best-effort; most public
        // APIs block direct browser fetches with CORS, handled below as a readable error rather
        // than a silent blank tile); webhook has no live fetch at all, it just displays whatever
        // CFG.customWidgets already loaded into cw.latestPayload -- that field is written by an
        // external system POSTing to a small Supabase Edge Function (prepared separately, see
        // 2026-09-24-migration-custom-widgets-add-webhook-columns.sql / functions/widget-webhook),
        // not by anything in this file. "Insert/write back" to a doc is NOT built -- it needs a
        // real Google OAuth app (client id/secret, consent flow, token storage), a decision Stef
        // hasn't made yet; flagged separately, not guessed at here.
        fn: function () {
          if (cwType === 'api') {
            var apiBoxId = 'extw_' + cwId.replace(/[^a-zA-Z0-9]/g, '') + '_' + Math.random().toString(36).slice(2, 8);
            setTimeout(function () { renderApiWidget(apiBoxId, cw); }, 0);
            return '<div class="card" style="height:100%"><div class="bd" style="height:100%;overflow:auto;padding:8px">' +
              '<div id="' + apiBoxId + '" class="mini">Loading…</div></div></div>';
          }
          if (cwType === 'webhook') {
            return '<div class="card" style="height:100%"><div class="bd" style="height:100%;overflow:auto;padding:8px">' +
              renderJsonPayload(cw.latestPayload) + '</div></div>';
          }
          var src = (cwType === 'gdoc') ? toEmbeddableDocUrl(cw.url) : cw.url;
          return '<div class="card" style="height:100%"><div class="bd" style="padding:0;height:100%">' +
            '<iframe src="' + cwEsc(src) + '" style="width:100%;height:100%;min-height:220px;border:0" ' +
            'title="' + cwEsc(cw.name) + '"></iframe></div></div>';
        }
      };
    }
    var srcLib = WIDGET_LIBRARIES[prefix];
    return srcLib ? (srcLib.widgets[widgetId.slice(dot + 1)] || null) : null;
  }

  /* Swaps a box's rendered content only -- no resize. Used by the initGrid()
     pre-pack pass below (where packItems()'s own height-fit measurement runs
     right after and would otherwise measure the wrong, stale content), and
     by applyWidgetSwap (which layers its own resize pass on top, needed
     there because nothing else runs afterward on a live click). Kept as one
     shared function rather than copy-pasted so the two callers can't drift. */
  function fillBoxContent(item, widgetInfo) {
    var inner = item.querySelector('.gs-inner');
    var handle = inner ? inner.querySelector('.gs-item-handle') : null;
    if (!inner || !handle) return;
    while (inner.lastChild && inner.lastChild !== handle) inner.removeChild(inner.lastChild);
    var html = widgetInfo ? widgetInfo.fn() : '<div class="card"><div class="bd">Unknown widget.</div></div>';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    while (tmp.firstChild) inner.appendChild(tmp.firstChild);
  }

  var GRIDS = {}; // pageId -> live GridStack instance, kept for the swap handler to resize a box after its content changes

  function gridStorageKey(pageId) { return 'northm_ordo_grid_' + pageId; }
  function widgetStorageKey(pageId) { return 'northm_ordo_widgets_' + pageId; }

  function getWidgetAssignments(pageId) {
    var lib = WIDGET_LIBRARIES[pageId];
    if (!lib) return {};
    var out = Object.assign({}, lib.defaults);
    try {
      var saved = JSON.parse(localStorage.getItem(widgetStorageKey(pageId)) || 'null');
      if (saved && typeof saved === 'object') Object.assign(out, saved);
    } catch (e) {}
    return out;
  }
  function setWidgetAssignment(pageId, boxId, widgetId) {
    var current = getWidgetAssignments(pageId);
    current[boxId] = widgetId;
    try { localStorage.setItem(widgetStorageKey(pageId), JSON.stringify(current)); } catch (e) {}
  }

  /* 2026-09-24 (Stef: "what if I want to ADD it to the page... where is the Add
     button"): custom boxes -- tiles a person adds beyond a page's own fixed
     box1..boxN slots. Every native box's markup comes from Ordo.html's own
     per-page render function (hardcoded box count/sizes, per the "no way to add
     a genuinely NEW box" note this replaces), so a custom box has no HTML of its
     own anywhere -- initGrid() below synthesizes its DOM node from scratch on
     every render, the same shape (.grid-stack-item > .grid-stack-item-content)
     the wrapping loop already expects, and its content is always painted via
     fillBoxContent()/resolveWidget() since nothing else ever renders it. The id
     list itself is a third, small localStorage key per page (alongside the
     existing position and widget-assignment keys) -- just which custom box ids
     exist on this page; their position comes from the normal grid-layout key
     like any other box, and their widget comes from the normal widget-assignment
     key like any other box. */
  function customBoxStorageKey(pageId) { return 'northm_ordo_customboxes_' + pageId; }
  function getCustomBoxIds(pageId) {
    try {
      var saved = JSON.parse(localStorage.getItem(customBoxStorageKey(pageId)) || 'null');
      return Array.isArray(saved) ? saved : [];
    } catch (e) { return []; }
  }
  function addCustomBoxId(pageId, boxId) {
    var ids = getCustomBoxIds(pageId);
    if (ids.indexOf(boxId) === -1) ids.push(boxId);
    try { localStorage.setItem(customBoxStorageKey(pageId), JSON.stringify(ids)); } catch (e) {}
  }
  // 2026-09-24 (Stef: "would delete rather than hide be better?" for a custom tile):
  // fully removes a custom box -- prunes its id from the bookkeeping list AND clears
  // its widget assignment, so nothing is left for a later render to recreate empty
  // (see the Reset layout fix above) or for the self-heal branch below to keep finding
  // and re-pruning. Shared by the self-heal branch and the Hide button's custom-tile
  // path below, so both go through one place.
  function removeCustomBox(pageId, boxId) {
    var prunedIds = getCustomBoxIds(pageId).filter(function (id) { return id !== boxId; });
    try { localStorage.setItem(customBoxStorageKey(pageId), JSON.stringify(prunedIds)); } catch (e) {}
    var all = getWidgetAssignments(pageId);
    delete all[boxId];
    try { localStorage.setItem(widgetStorageKey(pageId), JSON.stringify(all)); } catch (e) {}
  }
  // Adds a brand-new tile to pageId showing widgetId, then re-renders (a new DOM
  // node has to appear, same as Hide/Unhide -- see the __northGridReenterEdit
  // comment below for why that needs a full render rather than an in-place patch).
  function addNewTile(pageId, widgetId) {
    var boxId = 'custom_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    addCustomBoxId(pageId, boxId);
    setWidgetAssignment(pageId, boxId, widgetId);
    window.__northGridReenterEdit = pageId;
    if (typeof window.render === 'function') { window.render(); }
  }
  window.__northAddNewTile = addNewTile;
  // Exposed so Ordo.html's own Admin & config > Widget library page (2026-09-24) can build
  // its "which page does this file under" dropdown from the same category list the pickers
  // use, instead of hand-duplicating it and risking drift.
  window.PAGE_LABELS = PAGE_LABELS;
  // Exposed for the same reason as PAGE_LABELS above -- Ordo.html's Widget library page
  // (2026-09-24 tile-view upgrade) reads the real 108-widget catalog to render one tile per
  // widget (name + hint + icon), instead of hand-duplicating it.
  window.WIDGET_LIBRARIES = WIDGET_LIBRARIES;

  function initGrid(pageId, containerId) {
    var gridEl = document.getElementById(containerId);
    if (!gridEl || typeof GridStack === 'undefined') return;

    /* 2026-09-23 (Stef's real-use request: "finish the hide/unhide tiles"): a box
       assigned the sentinel widget id '__hidden__' (set by the Hide button below)
       is removed from the DOM entirely before GridStack ever sees it -- simplest
       possible way to make a box disappear without touching every page's own
       render loop (there are 20+ of them across Ordo.html). Ordo.html's own render
       still emits an "Unknown widget" placeholder for a hidden box (it doesn't
       know about the sentinel), but that markup never becomes visible -- it's
       stripped right here, before layout runs. */
    var hiddenNow = getWidgetAssignments(pageId);

    // Synthesize a DOM node for every custom box this page has (see addNewTile()
    // above) that isn't already sitting in the markup -- it never will be, since
    // Ordo.html's own per-page render function only knows about its fixed native
    // boxes. A hidden custom box is skipped entirely here, same as a hidden
    // native box gets removed just below -- both end up simply absent from the
    // grid either way.
    var customIds = getCustomBoxIds(pageId);
    customIds.forEach(function (boxId) {
      if (hiddenNow[boxId] === '__hidden__') return;
      if (gridEl.querySelector('.grid-stack-item[gs-id="' + boxId + '"]')) return;
      var el = document.createElement('div');
      el.className = 'grid-stack-item';
      el.setAttribute('gs-id', boxId);
      el.setAttribute('gs-w', '6');
      var content = document.createElement('div');
      content.className = 'grid-stack-item-content';
      el.appendChild(content);
      gridEl.appendChild(el);
    });
    var customIdSet = {};
    customIds.forEach(function (id) { customIdSet[id] = true; });

    var items = Array.prototype.slice.call(gridEl.querySelectorAll('.grid-stack-item')).filter(function (item) {
      var boxId = item.getAttribute('gs-id');
      if (hiddenNow[boxId] === '__hidden__') { item.remove(); return false; }
      // 2026-09-24 (Stef: "Once a widget is hidden the tile placeholder remains .. this should
      // also disappear"): a custom tile showing an External widget that's since been removed
      // from the library (Admin & config > Widget library) used to just sit there forever
      // showing "Unknown widget" -- resolveWidget()'s 'external.' branch returns null once
      // CFG.customWidgets no longer has that id, but nothing ever cleaned the box itself up. A
      // custom box only exists because a widget was explicitly added to it, so if that widget's
      // gone there's nothing left for the box to show -- self-heal by removing it the same way
      // an explicitly-hidden box disappears, and prune it from bookkeeping so it doesn't try to
      // recreate itself empty next render either. (Doesn't yet cover a NATIVE box that had one
      // of its default widgets swapped for an since-removed external widget -- rarer path,
      // native boxes need to fall back to their own default rather than simply vanish; not
      // handled in this pass.)
      var widgetIdNow = hiddenNow[boxId];
      if (customIdSet[boxId] && widgetIdNow && widgetIdNow.indexOf('external.') === 0 && !resolveWidget(pageId, widgetIdNow)) {
        item.remove();
        removeCustomBox(pageId, boxId);
        delete customIdSet[boxId];
        return false;
      }
      return true;
    });
    items.forEach(function (item) {
      var c = item.querySelector('.grid-stack-item-content');
      if (c && !c.querySelector('.gs-inner')) {
        var wrap = document.createElement('div');
        wrap.className = 'gs-inner';
        var h = document.createElement('div');
        h.className = 'gs-item-handle';
        var boxIdForHandle = item.getAttribute('gs-id');
        // 2026-09-24 (Stef: "would delete rather than hide be better?"): a custom tile
        // (added via + Add tile) has no page default to fall back to the way a native
        // box does, so its Hide button now deletes it outright instead -- see the click
        // handler below. Native boxes keep the original hide/unhide behaviour, since
        // Unhide genuinely restores something meaningful for those.
        var hideBtnHtml = customIdSet[boxIdForHandle]
          ? '<button type="button" class="gs-hide-btn" data-gs-hide="' + boxIdForHandle + '" title="Delete this tile — it was added from the widget library and can be added again the same way">🗑 Delete tile</button>'
          : '<button type="button" class="gs-hide-btn" data-gs-hide="' + boxIdForHandle + '" title="Hide this tile — bring it back later from + Add / unhide tile">✕ Hide</button>';
        // 2026-09-24 (Stef: "I don't like the fit height, I prefer the ability to drag
        // it as I need"): the manual per-tile "Fit height" button tried here was pulled
        // back out at his request -- drag-to-resize (the corner handles, "e/se/s/sw/w")
        // is the real answer and was already wired up via grid.enableResize()/the
        // 'resizable' handles option, just easy to miss since GridStack only shows a
        // handle on hover of that exact corner pixel. fitBoxHeight() itself is kept --
        // applyWidgetSwap() below still uses it to auto-grow/shrink a box right after a
        // widget swap, which was never in question.
        h.innerHTML = '<span>⠿⠿ drag to move · drag corner to resize</span>' +
          '<button type="button" class="gs-swap-btn" data-gs-swap="' + boxIdForHandle + '">⇄ Swap widget</button>' +
          hideBtnHtml;
        wrap.appendChild(h);
        while (c.firstChild) wrap.appendChild(c.firstChild);
        c.appendChild(wrap);
      }
    });

    var grid = GridStack.init({
      column: 12, cellHeight: 12, margin: 10, float: true, animate: false,
      disableDrag: true, disableResize: true,
      handle: '.gs-item-handle', resizable: { handles: 'e, se, s, sw, w' }
    }, gridEl);
    GRIDS[pageId] = grid;

    var settled = false;
    var restoredSaved = false;
    var missingFromSaved = [];
    var savedLayout = null;
    try {
      savedLayout = JSON.parse(localStorage.getItem(gridStorageKey(pageId)) || 'null');
      if (savedLayout && savedLayout.length) {
        // 2026-09-24 fix (Stef: "the hide button hides the widget but not the area,
        // we need to remove that area"): the saved layout is whatever was on screen
        // the last time this page's positions were saved -- it still lists a box's
        // old x/y/w/h after Hide has just removed that box's DOM node (above) and
        // marked it '__hidden__'. grid.load() syncs the grid to match exactly what
        // it's given, which includes recreating a blank placeholder for any id it's
        // told about that isn't currently in the DOM -- so the hidden box's empty
        // slot came right back the moment this ran. Confirmed live: without this,
        // a box that's genuinely removed still gets an empty ghost box reinserted
        // by the very next line. Dropping hidden ids from the layout before handing
        // it to grid.load() stops that reinsertion for good.
        savedLayout = savedLayout.filter(function (s) { return hiddenNow[s.id] !== '__hidden__'; });
      }
      if (savedLayout && savedLayout.length) {
        grid.load(savedLayout);
        restoredSaved = true;
        var savedIds = {};
        savedLayout.forEach(function (s) { savedIds[s.id] = true; });
        missingFromSaved = items.filter(function (el) { return !savedIds[el.getAttribute('gs-id')]; });
      }
    } catch (e) {}

    /* 2026-09-23 (Stef: "I think we should have a Strategy wide categorized
       library of tiles and widgets ... you can choose from regardless of
       screen"): a box picked from the cross-page library (see openSwapPicker
       below) is saved as a page-qualified compound id ("sourcePageId.
       localId"), which Ordo.html's own per-page render functions never
       learned to understand -- each one only ever knows its OWN page's
       plain widget ids (by design: "leave existing widgets as they are on
       their current screens" -- nothing about a page's own default
       rendering changed today). So on first paint after a reload, a box
       with a cross-page pick still shows the page's original default
       content; this patches in the real pick right here, before packItems()
       below does its own height-fit measurement, so that pass measures the
       actual final content instead of the stale default and doesn't need a
       second, wasted layout pass afterward. A same-page (plain-id) pick
       needs no patch -- Ordo.html's own render already got it right, same
       as it always has; resolveWidget() only does real work for the dot. */
    var assignedNow = getWidgetAssignments(pageId);
    items.forEach(function (item) {
      var boxId = item.getAttribute('gs-id');
      var widgetId = assignedNow[boxId];
      // A custom box (see addNewTile() above) has no native content from
      // Ordo.html's own render at all, so it always needs painting here,
      // plain id or compound -- unlike a native box, which only needs this
      // for a compound (cross-page) pick.
      if (widgetId && (widgetId.indexOf('.') !== -1 || customIdSet[boxId])) {
        fillBoxContent(item, resolveWidget(pageId, widgetId));
      }
    });

    /* 2026-09-23 (Stef's real-use report: "Reset ALL layouts still doesn't
       work" / "two widgets stuck on/in each other" on Planning engine, and a
       floating box overlapping the table on Activity plan): this loop used to
       ASSUME every pair of consecutive sub-12-width boxes was an even 6/6
       split -- it hardcoded the second box's x to 6 regardless of the first
       box's actual width. Any page with an unequal pair (drivers' box2/box3
       is 4/8, so was plan_bot's) placed the second box at x=6 with w=8,
       running it to column 14 -- 2 columns past the 12-column grid, visually
       overlapping/overflowing into whatever the next row held. This is also
       exactly the code path Reset ALL layouts forces (clearing the saved
       layout makes every page fall back to this fresh-placement logic), which
       is why resetting didn't fix it -- it re-triggered the same bug.
       Replaced with a real row-packer: walk items left to right, add each to
       the current row while its width still fits within the 12 columns used
       so far, start a new row once it wouldn't fit (or immediately for a
       w>=12 item, which always gets its own row) -- placing each item at the
       actual x its own width and its row-mates' widths add up to, not a
       hardcoded 0/6 split. Handles 2, 3 or more boxes per row correctly, not
       just even pairs. Extracted into its own function 2026-09-23 (Stef:
       "I can't add the missing tile" on Planning engine > Bottom-up) so it
       can also pack just the boxes a stale saved layout doesn't cover yet --
       see below. */
    function packItems(els, startY) {
      var unitPx = 12 + 10;
      function initialGuess(px) { return Math.max(1, Math.ceil(px / unitPx)); }
      function fitHeight(el, targetPx) {
        var h = initialGuess(targetPx);
        for (var guard = 0; guard < 10; guard++) {
          grid.update(el, { h: Math.min(h, 400) });
          var got = measureRealContentHeight(el);
          if (got >= targetPx - 1) break;
          h += Math.max(1, Math.ceil((targetPx - got) / unitPx));
        }
        return Math.min(h, 400);
      }
      var cursorUnits = startY;
      var i = 0;
      while (i < els.length) {
        var rowItems = [];
        var usedW = 0;
        while (i < els.length) {
          var wCandidate = parseInt(els[i].getAttribute('gs-w'), 10) || 12;
          if (wCandidate >= 12) {
            if (rowItems.length === 0) { rowItems.push(els[i]); i += 1; }
            break;
          }
          if (usedW + wCandidate > 12) break;
          rowItems.push(els[i]); usedW += wCandidate; i += 1;
        }
        var rowY = cursorUnits;
        var x = 0;
        var rowH = 0;
        rowItems.forEach(function (el) {
          var w = parseInt(el.getAttribute('gs-w'), 10) || 12;
          var innerH = measureRealContentHeight(el);
          grid.update(el, { x: x, y: rowY, w: w, h: initialGuess(innerH) });
          var h = fitHeight(el, innerH);
          rowH = Math.max(rowH, h);
          x += w;
        });
        cursorUnits += rowH;
      }
    }

    if (!restoredSaved) {
      requestAnimationFrame(function () {
        packItems(items, 0);
        settled = true;
      });
    } else if (missingFromSaved.length) {
      /* 2026-09-23 (Stef: "I can't add the missing tile" on Planning engine >
         Bottom-up): a page's saved grid layout can predate a box that didn't
         exist in it yet -- either a genuinely new widget slot added to a page
         (like today's 3 new Drivers widgets), or, as happened here, a box
         that used to be silently trapped inside a sibling's unclosed div (see
         the planBotWidgetDelivers() fix earlier today) and so was invisible
         to GridStack the last time this page's layout was saved.
         Confirmed live exactly what grid.load(savedLayout) above does to a
         box it doesn't know about: it doesn't just leave it unpositioned, it
         REMOVES it from the DOM outright (querySelectorAll count drops from
         4 to 3 the instant load() runs) -- GridStack syncs the grid to
         exactly match the given layout. That's why Stef's box4 (Marketing
         contribution build-up) never came back even after the div fix
         shipped, and why "+ Add / unhide tile" couldn't bring it back either
         -- it was never marked hidden via the '__hidden__' sentinel, load()
         had physically deleted it, a different problem the hide/unhide
         feature doesn't cover. The element reference in missingFromSaved
         (captured before load() ran) is still a valid, live DOM node --
         just detached -- so re-appending it and re-registering it with
         GridStack's own makeWidget() (confirmed live: this is what it's
         for) brings it back as a real tracked grid item again, and only
         then can packItems() give it a position. Packs as new rows appended
         below everything the saved layout already placed. */
      requestAnimationFrame(function () {
        missingFromSaved.forEach(function (el) {
          if (!gridEl.contains(el)) { gridEl.appendChild(el); }
          grid.makeWidget(el);
        });
        var maxY = 0;
        savedLayout.forEach(function (s) { maxY = Math.max(maxY, (s.y || 0) + (s.h || 0)); });
        packItems(missingFromSaved, maxY);
        settled = true;
      });
    } else {
      settled = true;
    }

    grid.on('change', function () {
      if (!settled) return;
      try { localStorage.setItem(gridStorageKey(pageId), JSON.stringify(grid.save(false))); } catch (e) {}
    });

    // Shared, single instance of these two controls lives in the ctxbar (the
    // grey Role/Version/FY/Grain bar), not per-page markup -- moved there
    // 2026-09-23 per Stef's request so they sit inline with those selectors
    // instead of inside each page's own header. window.northGridAfterRender
    // below shows/hides them depending on whether the CURRENT page has a
    // grid wired up at all.
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var editing = false;
    function refreshAddBtn() {
      if (!addBtn) return;
      var lib = WIDGET_LIBRARIES[pageId];
      var assigned = getWidgetAssignments(pageId);
      var hiddenCount = lib ? Object.keys(lib.defaults).filter(function (b) { return assigned[b] === '__hidden__'; }).length : 0;
      // 2026-09-24: no longer disabled when nothing's hidden -- the picker this
      // opens now also offers "add a tile from the library" (any of the 108
      // widgets, on any page), which is always available regardless of hidden
      // count. See openUnhidePicker()'s own comment for the full story.
      addBtn.disabled = false;
      addBtn.textContent = hiddenCount ? ('+ Add / unhide tile (' + hiddenCount + ' hidden)') : '+ Add tile';
      addBtn.title = '';
    }
    function setEditing(on) {
      editing = on;
      gridEl.classList.toggle('grid-edit-mode', on);
      grid.enableMove(on);
      grid.enableResize(on);
      if (toggleBtn) {
        toggleBtn.textContent = on ? '✓ Done editing' : '⠿ Edit layout';
        toggleBtn.classList.toggle('active', on);
      }
      if (addBtn) addBtn.style.display = on ? '' : 'none';
      if (on) refreshAddBtn();
    }
    // "+ Add / unhide tile" -- 2026-09-23 (Stef: "finish the hide/unhide tiles",
    // confirmed direction: "in edit mode it should be seen as an option to add or
    // unhide"; then: "move it to next to the layout buttons"). Shared, single
    // instance in the ctxbar (#grid-addtile), same as Edit layout/Reset layout --
    // not created per-page anymore. Opens openUnhidePicker(), which lists every
    // box on THIS page currently set to the '__hidden__' sentinel (bring back a
    // hidden slot) AND, as of 2026-09-24, lets a person add a genuinely new tile
    // from the full cross-page widget library -- see addNewTile() and the custom
    // box synthesis in initGrid() above for how a box with no native markup from
    // Ordo.html's own per-page render still gets a real, persisted place on the
    // grid.
    var addBtn = document.getElementById('grid-addtile');
    if (addBtn) addBtn.onclick = function () { openUnhidePicker(pageId); };

    /* 2026-09-23 (Stef: "doesn't allow me to add or unhide"): the actual bug --
       Hide and Unhide both go through a full window.render(), which rebuilds
       this whole grid from scratch and starts a fresh, non-editing initGrid()
       call every time. That silently kicked the page OUT of edit mode on every
       single hide/unhide click -- the Add/unhide button (and every box's Hide/
       Swap buttons) vanished the instant you used them once, making it look like
       they plain didn't work. Swap never had this problem because it patches the
       one box's content in place without a full re-render. Hide/unhide DO need a
       full re-render (a box has to appear/disappear from the grid, which needs
       Ordo.html's own per-page loop to run again), so instead this flag says
       "re-enter edit mode for THIS page after the next render" -- set right
       before calling render() by the Hide button and the unhide picker below,
       consumed once here, after addBtn actually exists to show. */
    if (window.__northGridReenterEdit === pageId) {
      window.__northGridReenterEdit = null;
      setEditing(true);
    }

    if (toggleBtn) toggleBtn.onclick = function () { setEditing(!editing); };
    if (resetBtn) resetBtn.onclick = function () {
      try {
        localStorage.removeItem(gridStorageKey(pageId));
        localStorage.removeItem(widgetStorageKey(pageId));
        // 2026-09-24 fix (Stef: "Tile placeholder remains after reset layout clicked"):
        // this used to leave the page's custom-box id list untouched. A custom tile has
        // no default state to reset TO, so leaving its id behind meant the synthesis loop
        // just above in initGrid() recreated it as a brand-new, completely empty DOM node
        // on the very next render (its widget assignment was just wiped above, so nothing
        // ever got painted into it either) -- Reset layout was silently reviving custom
        // tiles as blank boxes instead of clearing them. Clearing this key too makes
        // Reset layout mean what it says: every custom tile on this page is gone, same as
        // its position and widget picks.
        localStorage.removeItem(customBoxStorageKey(pageId));
      } catch (e) {}
      initGrid(pageId, containerId); // re-run in place, no need for a full app render
    };
    // "Reset ALL layouts" (#grid-reset-all) is bound once, globally, at the bottom
    // of this file -- not here. It used to be rebound on every initGrid() call,
    // which meant it only ever worked on whichever grid page render() last ran on,
    // and silently had no listener at all on a page with no grid. See that binding
    // for the full story.

    gridEl.querySelectorAll('.gs-swap-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        openSwapPicker(pageId, btn.getAttribute('data-gs-swap'));
      };
    });
    gridEl.querySelectorAll('.gs-hide-btn').forEach(function (btn) {
      btn.onclick = function (e) {
        e.stopPropagation();
        var boxId = btn.getAttribute('data-gs-hide');
        if (customIdSet[boxId]) {
          removeCustomBox(pageId, boxId);
        } else {
          setWidgetAssignment(pageId, boxId, '__hidden__');
        }
        window.__northGridReenterEdit = pageId;
        if (typeof window.render === 'function') { window.render(); }
      };
    });
  }

  // ---- Swap picker modal --------------------------------------------------
  function closeSwapPicker() {
    var m = document.getElementById('gs-swap-modal');
    if (m) m.remove();
  }

  function openSwapPicker(pageId, boxId) {
    closeSwapPicker();
    var lib = WIDGET_LIBRARIES[pageId];
    if (!lib) return;
    var assigned = getWidgetAssignments(pageId);
    var currentId = assigned[boxId];

    var overlay = document.createElement('div');
    overlay.id = 'gs-swap-modal';
    overlay.className = 'gs-swap-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) closeSwapPicker(); };

    // 2026-09-23: matches Ordo.html's own esc() convention for generated HTML
    // attribute values (see pageAdmin()'s "Admin &amp; configuration" heading)
    // -- widget labels/hints are all internally-authored plain English, never
    // untrusted input, but escaping & and " here is cheap and keeps this code
    // consistent with how the rest of the app treats anything going into an
    // HTML attribute.
    function attrEsc(str) { return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
    function rowHtml(wid, w, on) {
      return '<button type="button" class="gs-swap-row' + (on ? ' on' : '') + '" data-wid="' + wid + '" data-search="' +
        attrEsc((w.label + ' ' + w.hint).toLowerCase()) + '">' +
        '<span class="gs-swap-row-label">' + w.label + (on ? ' ✓' : '') + '</span>' +
        '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
    }

    var rows = Object.keys(lib.widgets).map(function (wid) {
      return rowHtml(wid, lib.widgets[wid], wid === currentId);
    }).join('');

    /* 2026-09-23 (Stef: "I think we should have a Strategy wide categorized
       library of tiles and widgets ... one place where widgets can be
       connected / setup / configured ... you can choose from regardless of
       screen"): everything below "This page" is new -- every OTHER page's
       widgets, grouped by category (PAGE_LABELS, "by originating page" per
       Stef's own answer), each pick stored as a page-qualified compound id
       and resolved by resolveWidget()/applyWidgetSwap() above. Existing
       widgets keep rendering on their current screens exactly as before
       (per Stef's own answer, "leave existing widgets as they are") --
       this only ADDS the ability to also place any of them somewhere else;
       nothing about where a widget lives by default has changed. A plain
       text filter is included since this list is 100+ rows once every page
       is in it -- browsing that many without one would be the opposite of
       the "efficiency in how someone uses North" Stef asked to keep in
       mind. */
    var libraryGroups = Object.keys(PAGE_LABELS).filter(function (pid) {
      return pid !== pageId && WIDGET_LIBRARIES[pid];
    }).map(function (pid) {
      var otherLib = WIDGET_LIBRARIES[pid];
      var groupRows = Object.keys(otherLib.widgets).map(function (wid) {
        return rowHtml(pid + '.' + wid, otherLib.widgets[wid], (pid + '.' + wid) === currentId);
      }).join('');
      return '<div class="gs-swap-category" data-search="' + attrEsc(PAGE_LABELS[pid].toLowerCase()) + '">' + PAGE_LABELS[pid] + '</div>' + groupRows;
    }).join('') + ((typeof CFG !== 'undefined' && CFG.customWidgets && CFG.customWidgets.length) ?
      '<div class="gs-swap-category" data-search="external widgets">External widgets</div>' +
      CFG.customWidgets.map(function (w) {
        var fullId = 'external.' + w.id;
        return rowHtml(fullId, { label: w.name, hint: w.hint || '' }, fullId === currentId);
      }).join('') : '');

    overlay.innerHTML =
      '<div class="gs-swap-panel">' +
      '<div class="gs-swap-head">Swap this box’s content<button type="button" class="gs-swap-close" aria-label="Close">✕</button></div>' +
      '<div class="gs-swap-list">' + rows +
      '<button type="button" class="gs-swap-row gs-swap-disabled" disabled>' +
      '<span class="gs-swap-row-label">+ Connect an external source</span>' +
      '<span class="gs-swap-row-hint">Not built yet — mocked to show the direction (a URL, a live API, another system). No real connection here.</span>' +
      '</button>' +
      '</div>' +
      '<div class="gs-swap-section-head">Browse the full widget library' +
      '<input type="text" class="cel txt gs-swap-filter" placeholder="Filter by name or page…" id="gs-swap-filter-input"></div>' +
      '<div class="gs-swap-list" id="gs-swap-library-list">' + libraryGroups + '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.gs-swap-close').onclick = closeSwapPicker;
    function wireRow(row) {
      row.onclick = function () {
        var wid = row.getAttribute('data-wid');
        setWidgetAssignment(pageId, boxId, wid);
        applyWidgetSwap(pageId, boxId, wid);
        closeSwapPicker();
      };
    }
    overlay.querySelectorAll('.gs-swap-row[data-wid]').forEach(wireRow);

    var filterInput = overlay.querySelector('#gs-swap-filter-input');
    var libraryList = overlay.querySelector('#gs-swap-library-list');
    if (filterInput && libraryList) {
      filterInput.oninput = function () {
        var q = filterInput.value.trim().toLowerCase();
        var lastCategoryShown = null;
        Array.prototype.forEach.call(libraryList.children, function (el) {
          if (el.classList.contains('gs-swap-category')) {
            // Decide category visibility after seeing whether any of its rows matched -- a category with a matching name is always shown even if no individual row text matched.
            lastCategoryShown = el;
            el.style.display = q && el.getAttribute('data-search').indexOf(q) === -1 ? 'none' : '';
          } else {
            var match = !q || el.getAttribute('data-search').indexOf(q) !== -1 || (lastCategoryShown && lastCategoryShown.getAttribute('data-search').indexOf(q) !== -1);
            el.style.display = match ? '' : 'none';
            if (match && lastCategoryShown) lastCategoryShown.style.display = '';
          }
        });
      };
    }
  }

  // ---- Unhide / add-tile picker -------------------------------------------
  // Reuses the swap picker's overlay/panel/list/row markup and CSS for visual
  // consistency -- same modal shape, different content and action.
  function closeUnhidePicker() {
    var m = document.getElementById('gs-unhide-modal');
    if (m) m.remove();
  }

  function openUnhidePicker(pageId) {
    closeUnhidePicker();
    var lib = WIDGET_LIBRARIES[pageId];
    if (!lib) return;
    var assigned = getWidgetAssignments(pageId);
    var hiddenBoxIds = Object.keys(lib.defaults).filter(function (b) { return assigned[b] === '__hidden__'; });
    // 2026-09-24 (Stef: "what if I want to ADD it to the page... where is the
    // Add button"): a hidden CUSTOM box (one added via the library section
    // below, then hidden) belongs in this same unhide list -- restoring it
    // just clears its '__hidden__' sentinel back to whatever widget it held,
    // same mechanism as a native box, via the same row click handler below.
    var customIds = getCustomBoxIds(pageId);
    var hiddenCustomIds = customIds.filter(function (b) { return assigned[b] === '__hidden__'; });

    var overlay = document.createElement('div');
    overlay.id = 'gs-unhide-modal';
    overlay.className = 'gs-swap-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) closeUnhidePicker(); };

    function attrEsc(str) { return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;'); }
    var nativeRows = hiddenBoxIds.map(function (boxId) {
      var defaultWidgetId = lib.defaults[boxId];
      var w = lib.widgets[defaultWidgetId] || { label: defaultWidgetId, hint: '' };
      return '<button type="button" class="gs-swap-row" data-gs-unhide="' + boxId + '" data-gs-unhide-widget="' + defaultWidgetId + '">' +
        '<span class="gs-swap-row-label">' + w.label + '</span>' +
        '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
    }).join('');
    // A hidden custom box's own widget id gets overwritten by '__hidden__' when
    // it's hidden (same as a native box), so what it held before isn't
    // recoverable from current state alone -- not worth the extra storage for
    // a first pass. It's simply not offered back through Unhide; picking it
    // again from the library below makes a fresh tile instead, which is the
    // same net result for the person (hiddenCustomIds is currently unused for
    // that reason, kept only so a future pass can wire real recovery in).
    var rows = nativeRows || '<div class="gs-swap-row gs-swap-disabled">Nothing hidden on this page right now.</div>';

    var libraryGroups = Object.keys(PAGE_LABELS).map(function (pid) {
      var pidLib = WIDGET_LIBRARIES[pid];
      if (!pidLib) return '';
      var prefix = pid === pageId ? '' : pid + '.';
      var groupRows = Object.keys(pidLib.widgets).map(function (wid) {
        var w = pidLib.widgets[wid];
        var fullId = prefix + wid;
        return '<button type="button" class="gs-swap-row" data-gs-addwidget="' + fullId + '" data-search="' +
          attrEsc((w.label + ' ' + w.hint).toLowerCase()) + '">' +
          '<span class="gs-swap-row-label">' + w.label + '</span>' +
          '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
      }).join('');
      return '<div class="gs-swap-category" data-search="' + attrEsc(PAGE_LABELS[pid].toLowerCase()) + '">' + PAGE_LABELS[pid] + (pid === pageId ? ' (this page)' : '') + '</div>' + groupRows;
    }).join('') + ((typeof CFG !== 'undefined' && CFG.customWidgets && CFG.customWidgets.length) ?
      '<div class="gs-swap-category" data-search="external widgets">External widgets</div>' +
      CFG.customWidgets.map(function (w) {
        var fullId = 'external.' + w.id;
        return '<button type="button" class="gs-swap-row" data-gs-addwidget="' + fullId + '" data-search="' +
          attrEsc((w.name + ' ' + (w.hint || '')).toLowerCase()) + '">' +
          '<span class="gs-swap-row-label">' + w.name + '</span>' +
          '<span class="gs-swap-row-hint">' + (w.hint || '') + '</span></button>';
      }).join('') : '');

    overlay.innerHTML =
      '<div class="gs-swap-panel">' +
      '<div class="gs-swap-head">Add / unhide a tile<button type="button" class="gs-swap-close" aria-label="Close">✕</button></div>' +
      (hiddenBoxIds.length ? '<div class="gs-swap-section-head">Unhide</div><div class="gs-swap-list">' + rows + '</div>' : '') +
      '<div class="gs-swap-section-head">Add a tile from the library' +
      '<input type="text" class="cel txt gs-swap-filter" placeholder="Filter by name or page…" id="gs-unhide-filter-input"></div>' +
      '<div class="gs-swap-list" id="gs-unhide-library-list">' + libraryGroups + '</div>' +
      '</div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.gs-swap-close').onclick = closeUnhidePicker;
    overlay.querySelectorAll('.gs-swap-row[data-gs-unhide]').forEach(function (row) {
      row.onclick = function () {
        var boxId = row.getAttribute('data-gs-unhide');
        setWidgetAssignment(pageId, boxId, lib.defaults[boxId]);
        window.__northGridReenterEdit = pageId;
        closeUnhidePicker();
        if (typeof window.render === 'function') { window.render(); }
      };
    });
    overlay.querySelectorAll('.gs-swap-row[data-gs-addwidget]').forEach(function (row) {
      row.onclick = function () {
        var wid = row.getAttribute('data-gs-addwidget');
        closeUnhidePicker();
        addNewTile(pageId, wid);
      };
    });
    var filterInput = overlay.querySelector('#gs-unhide-filter-input');
    var libraryList = overlay.querySelector('#gs-unhide-library-list');
    if (filterInput && libraryList) {
      filterInput.oninput = function () {
        var q = filterInput.value.trim().toLowerCase();
        var lastCategoryShown = null;
        Array.prototype.forEach.call(libraryList.children, function (el) {
          if (el.classList.contains('gs-swap-category')) {
            lastCategoryShown = el;
            el.style.display = q && el.getAttribute('data-search').indexOf(q) === -1 ? 'none' : '';
          } else {
            var match = !q || el.getAttribute('data-search').indexOf(q) !== -1 || (lastCategoryShown && lastCategoryShown.getAttribute('data-search').indexOf(q) !== -1);
            el.style.display = match ? '' : 'none';
            if (match && lastCategoryShown) lastCategoryShown.style.display = '';
          }
        });
      };
    }
  }

  // 2026-09-24 (Stef: "the padding issue seems to be exacerbated by the bar at the top of
  // each tile, which you use to drag .. that seems to be the contributing difference in
  // height"): exactly right. Every height fit below works by measuring .gs-inner's actual
  // rendered height -- but .gs-inner also contains the drag/hide handle bar, which is only
  // visible (display:flex, ~28px) while the grid is in edit mode. Several actions that
  // trigger a fresh fit -- Hide, Unhide, + Add tile, a widget swap -- re-enter edit mode as
  // part of that same action, right before the fit runs, so a height fit that happened to
  // land during one of those baked the handle's height into the box permanently. Once
  // editing ends and the handle goes back to display:none, that space never gets reclaimed
  // -- it just sits there as a gap. Hiding the handle for the instant of measurement (put
  // back exactly as it was straight after) makes every fit match how the tile actually
  // looks day to day, whether or not editing happened to be on when it ran.
  function measureRealContentHeight(item) {
    var inner = item.querySelector('.gs-inner');
    if (!inner) return 0;
    var handle = inner.querySelector('.gs-item-handle');
    var prevDisplay = handle ? handle.style.display : null;
    if (handle) handle.style.display = 'none';
    var h = inner.getBoundingClientRect().height;
    if (handle) handle.style.display = prevDisplay;
    return h;
  }

  // 2026-09-24: extracted from applyWidgetSwap()'s own tail (below) so the same
  // measure-and-grow-until-it-fits loop can also run on demand from the new per-box
  // "⤢ Fit height" button, not just right after a widget swap.
  function fitBoxHeight(pageId, boxId) {
    var grid = GRIDS[pageId];
    var gridEl = grid ? grid.el : null;
    if (!gridEl) return;
    var item = gridEl.querySelector('.grid-stack-item[gs-id="' + boxId + '"]');
    if (!item) return;
    var targetPx = measureRealContentHeight(item);
    if (!targetPx) return;
    var unitPx = 12 + 10;
    var h = Math.max(1, Math.ceil(targetPx / unitPx));
    for (var guard = 0; guard < 10; guard++) {
      grid.update(item, { h: Math.min(h, 400) });
      var got = measureRealContentHeight(item);
      if (got >= targetPx - 1) break;
      h += Math.max(1, Math.ceil((targetPx - got) / unitPx));
    }
  }

  function applyWidgetSwap(pageId, boxId, widgetId) {
    var grid = GRIDS[pageId];
    var gridEl = grid ? grid.el : null;
    if (!gridEl) return;
    var item = gridEl.querySelector('.grid-stack-item[gs-id="' + boxId + '"]');
    if (!item) return;
    // 2026-09-23 (Stef's widget-library request): widgetId can now be a
    // page-qualified compound id from a cross-page pick, not just a plain
    // id from this page's own WIDGET_LIBRARIES entry -- resolveWidget()
    // handles both forms; see its own comment above for why.
    fillBoxContent(item, resolveWidget(pageId, widgetId));
    // Content height likely changed — grow/shrink this one box to fit, same
    // measure-and-step approach as the initial layout pass, without moving or
    // resizing any other box. (2026-09-24: now shared with the manual "Fit height"
    // button via fitBoxHeight() above, instead of keeping its own copy of this loop.)
    requestAnimationFrame(function () { fitBoxHeight(pageId, boxId); });
  }

  // pageId -> its <div class="grid-stack"> container id. A page appears here
  // only once it's actually been wired up (its own widget functions + grid
  // markup added to Ordo.html) -- this list is also what drives whether the
  // shared Edit layout / Reset layout buttons in the ctxbar show at all.
  var PAGE_GRID_CONTAINERS = {
    home: 'ordo-grid-home',
    drivers: 'ordo-grid-drivers',
    plan_top: 'ordo-grid-plan-top',
    plan_bot: 'ordo-grid-plan-bot',
    plan_streamcmp: 'ordo-grid-plan-streamcmp',
    plan_rec: 'ordo-grid-plan-rec',
    plan_phase: 'ordo-grid-plan-phase',
    geo: 'ordo-grid-geo',
    activity: 'ordo-grid-activity',
    segment: 'ordo-grid-segment',
    actuals: 'ordo-grid-actuals',
    insight_season: 'ordo-grid-insight-season',
    insight_vel: 'ordo-grid-insight-vel',
    insight_lift: 'ordo-grid-insight-lift',
    insight_scen: 'ordo-grid-insight-scen',
    insight_ready: 'ordo-grid-insight-ready',
    campaign: 'ordo-grid-campaign',
    dashboard: 'ordo-grid-dashboard',
    calculator: 'ordo-grid-calculator',
    admin_gates: 'ordo-grid-admin-gates',
    admin_geo: 'ordo-grid-admin-geo',
    admin_streams: 'ordo-grid-admin-streams',
    admin_acts: 'ordo-grid-admin-acts',
    admin_segs: 'ordo-grid-admin-segs',
    admin_camps: 'ordo-grid-admin-camps',
    admin_buckets: 'ordo-grid-admin-buckets',
    admin_time: 'ordo-grid-admin-time',
    admin_ver: 'ordo-grid-admin-ver',
    admin_users: 'ordo-grid-admin-users',
    admin_feeds: 'ordo-grid-admin-feeds',
    admin_audit: 'ordo-grid-admin-audit',
    snapshots: 'ordo-grid-snapshots',
    relationships: 'ordo-grid-relationships'
  };

  // A page whose grid identity is finer than its top-level pageId (e.g. a
  // tabbed page with one independent grid per tab) sets window.__northGridSubId
  // to the real key just before returning its HTML. We consume it once here
  // so render()'s generic `northGridAfterRender(p.id)` call still works
  // unmodified for every page, tabbed or not.
  window.northGridAfterRender = function (pageId) {
    var effectiveId = pageId;
    if (window.__northGridSubId) { effectiveId = window.__northGridSubId; window.__northGridSubId = null; }
    var toggleBtn = document.getElementById('grid-edit-toggle');
    var resetBtn = document.getElementById('grid-reset');
    var addTileBtn = document.getElementById('grid-addtile');
    var containerId = PAGE_GRID_CONTAINERS[effectiveId];
    var show = !!containerId;
    if (toggleBtn) toggleBtn.style.display = show ? '' : 'none';
    if (resetBtn) resetBtn.style.display = show ? '' : 'none';
    // grid-addtile only ever shows WHILE editing (per Stef: "in edit mode it
    // should be seen as an option to add or unhide") -- initGrid()'s setEditing()
    // controls that. Here we only need to force it off on a page with no grid at
    // all, so it doesn't stay visible (stale, from a previous grid page) when
    // initGrid() never runs this time to otherwise manage it.
    if (addTileBtn && !show) addTileBtn.style.display = 'none';
    if (containerId) initGrid(effectiveId, containerId);
  };
  window.northGetWidgetAssignments = getWidgetAssignments;

  /* 2026-09-23 (Stef's real-use report: "Reset ALL layouts did nothing"): the
     original resetAllBtn.onclick was wired up INSIDE initGrid(), so it only ever
     got attached on a page/tab whose grid container successfully initialized --
     on any page with no registered grid for the currently-active effectiveId
     (e.g. mid-navigation, or a page whose subId never resolves), the button sat
     there with no listener at all and a click genuinely did nothing.
     2026-09-23 (Stef: "not sure we need a Reset all Layouts button on every
     screen ... too easy to accidently click. Move it to Admin & configuration"):
     the button itself has since moved from the static, always-visible ctxbar
     into Admin & config > Audit log's dynamically-rendered tab content (see
     Ordo.html's pageAdmin(), UI.adminTab==='audit'). That content gets replaced
     on every render(), so a bind-once-to-a-DOM-element approach (as used when
     this lived in the static ctxbar) would silently stop working the moment the
     tab re-renders -- same failure shape as the original bug above, just from a
     different cause. Exposed as a plain global function instead and called
     directly via onclick="northResetAllLayouts()", the same way every other
     admin-tab action button (addGate(), removeRegion(), preset(), etc.) is
     wired -- resolved against global scope at click time, so it works correctly
     regardless of when or how many times that tab's HTML has been rebuilt. */
  window.northResetAllLayouts = function () {
    try {
      Object.keys(localStorage).forEach(function (k) {
        // 2026-09-24 fix: this used to leave every page's northm_ordo_customboxes_*
        // key behind -- the same gap already fixed on the per-page Reset layout
        // button (see resetBtn.onclick above) was still open here, at global scope,
        // for every custom tile on every page at once. A custom tile has no default
        // to reset TO, so leaving its id behind here meant it came back everywhere
        // as an empty, unrecoverable placeholder the next time each page rendered.
        if (k.indexOf('northm_ordo_grid_') === 0 || k.indexOf('northm_ordo_widgets_') === 0 || k.indexOf('northm_ordo_customboxes_') === 0) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}
    if (typeof window.render === 'function') { window.render(); }
  };
})();
