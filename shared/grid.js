// North Strategy module — editable grid layout + widget-swap engine.
// PILOT (2026-09-23): wired up for the Home page only (pageId 'home'),
// on branch feature/strategy-grid-layout. Not yet on main / production.
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
    var items = Array.prototype.slice.call(gridEl.querySelectorAll('.grid-stack-item')).filter(function (item) {
      var boxId = item.getAttribute('gs-id');
      if (hiddenNow[boxId] === '__hidden__') { item.remove(); return false; }
      return true;
    });
    items.forEach(function (item) {
      var c = item.querySelector('.grid-stack-item-content');
      if (c && !c.querySelector('.gs-inner')) {
        var wrap = document.createElement('div');
        wrap.className = 'gs-inner';
        var h = document.createElement('div');
        h.className = 'gs-item-handle';
        h.innerHTML = '<span>⠿⠿ drag to move · drag corner to resize</span>' +
          '<button type="button" class="gs-swap-btn" data-gs-swap="' + item.getAttribute('gs-id') + '">⇄ Swap widget</button>' +
          '<button type="button" class="gs-hide-btn" data-gs-hide="' + item.getAttribute('gs-id') + '" title="Hide this tile — bring it back later from + Add / unhide tile">✕ Hide</button>';
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
        grid.load(savedLayout);
        restoredSaved = true;
        var savedIds = {};
        savedLayout.forEach(function (s) { savedIds[s.id] = true; });
        missingFromSaved = items.filter(function (el) { return !savedIds[el.getAttribute('gs-id')]; });
      }
    } catch (e) {}

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
        var content = el.querySelector('.grid-stack-item-content');
        var h = initialGuess(targetPx);
        for (var guard = 0; guard < 10; guard++) {
          grid.update(el, { h: Math.min(h, 400) });
          var got = content.getBoundingClientRect().height;
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
          var inner = el.querySelector('.gs-inner');
          var innerH = inner ? inner.getBoundingClientRect().height : 0;
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
      addBtn.disabled = hiddenCount === 0;
      addBtn.textContent = hiddenCount ? ('+ Add / unhide tile (' + hiddenCount + ' hidden)') : '+ Add / unhide tile';
      addBtn.title = hiddenCount ? '' : 'Nothing hidden on this page right now';
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
    // not created per-page anymore. Lists every box on THIS page currently set to
    // the '__hidden__' sentinel and restores whichever one is picked back to its
    // default widget. There's no way to add a genuinely NEW box beyond a page's
    // fixed box1..boxN slots without a bigger structural change (every page's box
    // count/sizes are hardcoded in its own render function in Ordo.html) -- so
    // "add" here means "bring back a hidden slot," not "create an arbitrary extra
    // tile." Button is disabled with an explanatory title when nothing on the
    // page is currently hidden.
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
        setWidgetAssignment(pageId, btn.getAttribute('data-gs-hide'), '__hidden__');
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

    var rows = Object.keys(lib.widgets).map(function (wid) {
      var w = lib.widgets[wid];
      var on = wid === currentId;
      return '<button type="button" class="gs-swap-row' + (on ? ' on' : '') + '" data-wid="' + wid + '">' +
        '<span class="gs-swap-row-label">' + w.label + (on ? ' ✓' : '') + '</span>' +
        '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
    }).join('');

    overlay.innerHTML =
      '<div class="gs-swap-panel">' +
      '<div class="gs-swap-head">Swap this box’s content<button type="button" class="gs-swap-close" aria-label="Close">✕</button></div>' +
      '<div class="gs-swap-list">' + rows +
      '<button type="button" class="gs-swap-row gs-swap-disabled" disabled>' +
      '<span class="gs-swap-row-label">+ Connect an external source</span>' +
      '<span class="gs-swap-row-hint">Not built yet — mocked to show the direction (a URL, a live API, another system). No real connection here.</span>' +
      '</button>' +
      '</div></div>';

    document.body.appendChild(overlay);
    overlay.querySelector('.gs-swap-close').onclick = closeSwapPicker;
    overlay.querySelectorAll('.gs-swap-row[data-wid]').forEach(function (row) {
      row.onclick = function () {
        var wid = row.getAttribute('data-wid');
        setWidgetAssignment(pageId, boxId, wid);
        applyWidgetSwap(pageId, boxId, wid);
        closeSwapPicker();
      };
    });
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

    var overlay = document.createElement('div');
    overlay.id = 'gs-unhide-modal';
    overlay.className = 'gs-swap-overlay';
    overlay.onclick = function (e) { if (e.target === overlay) closeUnhidePicker(); };

    var rows = hiddenBoxIds.map(function (boxId) {
      var defaultWidgetId = lib.defaults[boxId];
      var w = lib.widgets[defaultWidgetId] || { label: defaultWidgetId, hint: '' };
      return '<button type="button" class="gs-swap-row" data-gs-unhide="' + boxId + '">' +
        '<span class="gs-swap-row-label">' + w.label + '</span>' +
        '<span class="gs-swap-row-hint">' + w.hint + '</span></button>';
    }).join('') || '<div class="gs-swap-row gs-swap-disabled">Nothing hidden on this page right now.</div>';

    overlay.innerHTML =
      '<div class="gs-swap-panel">' +
      '<div class="gs-swap-head">Add / unhide a tile<button type="button" class="gs-swap-close" aria-label="Close">✕</button></div>' +
      '<div class="gs-swap-list">' + rows + '</div></div>';

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
  }

  function applyWidgetSwap(pageId, boxId, widgetId) {
    var lib = WIDGET_LIBRARIES[pageId];
    var grid = GRIDS[pageId];
    var gridEl = grid ? grid.el : null;
    if (!lib || !gridEl) return;
    var item = gridEl.querySelector('.grid-stack-item[gs-id="' + boxId + '"]');
    if (!item) return;
    var inner = item.querySelector('.gs-inner');
    var handle = inner ? inner.querySelector('.gs-item-handle') : null;
    if (!inner || !handle) return;
    while (inner.lastChild && inner.lastChild !== handle) inner.removeChild(inner.lastChild);
    var w = lib.widgets[widgetId];
    var html = w ? w.fn() : '<div class="card"><div class="bd">Unknown widget.</div></div>';
    var tmp = document.createElement('div');
    tmp.innerHTML = html;
    while (tmp.firstChild) inner.appendChild(tmp.firstChild);
    // Content height likely changed — grow/shrink this one box to fit, same
    // measure-and-step approach as the initial layout pass, without moving
    // or resizing any other box.
    requestAnimationFrame(function () {
      var content = item.querySelector('.grid-stack-item-content');
      var targetPx = inner.getBoundingClientRect().height;
      var unitPx = 12 + 10;
      var h = Math.max(1, Math.ceil(targetPx / unitPx));
      for (var guard = 0; guard < 10; guard++) {
        grid.update(item, { h: Math.min(h, 400) });
        var got = content.getBoundingClientRect().height;
        if (got >= targetPx - 1) break;
        h += Math.max(1, Math.ceil((targetPx - got) / unitPx));
      }
    });
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
        if (k.indexOf('northm_ordo_grid_') === 0 || k.indexOf('northm_ordo_widgets_') === 0) {
          localStorage.removeItem(k);
        }
      });
    } catch (e) {}
    if (typeof window.render === 'function') { window.render(); }
  };
})();
