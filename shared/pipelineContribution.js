/* shared/pipelineContribution.js  (2026-10-16)
   "Contribution to closed pipeline" -- North's headline marketing KPI.
   Spec: claude/2026-10-10-contribution-to-closed-pipeline-kpi-spec.md. Stef's answers (16 Oct):
   Closed Won only; multi-touch credit; org base currency; partner-sourced reported separately; tile on the Board report.

   Pure helpers -- no DOM, no database. Loaded with <script src="shared/pipelineContribution.js">, also require()-able for tests.

     NorthPipelineContribution.compute(input) -> result
       input.deals     [{id,name,value,currency,stage,close_date,campaign_id,partner_id,attribution_source}]
       input.touches   [{deal_id,campaign_id,role:'sourced'|'influenced',weight}]  (deal_campaign_touches; [] if not set up)
       input.campaigns [{id,name}]                    names for the by-campaign list
       input.from/to   'YYYY-MM-DD' (inclusive) -- period by deal close date; omit both for all time
       input.convert   (amount, currency) -> number in the org's base currency (Strategy passes convertToMain(...).converted)
       input.model     'multi_touch' (default) | 'sourced_only'
       input.scope     optional array of campaign ids (e.g. the regions the viewer can see); credit to other campaigns is not counted
       input.spend     optional {campaignId: actual spend in base currency} for return on spend

     The rule (also returned as result.rule, shown on screen):
       - Closed Won deals whose close date is in the period. Closed Lost is shown separately, never mixed in.
       - Each deal's value is split across the campaigns that touched it, in proportion to their weights (the deal's own
         campaign counts as "sourced", weight 1, unless a touch row sets another weight). Shares always add up to the deal's
         value once -- a deal is never counted twice.
       - Partner-sourced = the deal's attribution source is "partner sourced" (or a partner is set and it isn't "house sourced").
         Everything else with a campaign is marketing-sourced. Shown separately.
       - Closed Won deals with no campaign at all are "Unattributed" and listed so they can be linked. */
(function(){
  var G = typeof window !== 'undefined' ? window : globalThis;

  function stageKind(s){
    var t = String(s || '').toLowerCase().replace(/[\s_-]+/g, ' ').trim();
    if(/^(closed )?won$/.test(t)) return 'won';
    if(/^(closed )?lost$/.test(t)) return 'lost';
    return 'open';
  }
  function isPartnerSourced(d){
    var src = String(d.attribution_source || '').toLowerCase();
    if(src === 'partner_sourced') return true;
    if(src === 'house_sourced') return false;
    return !!d.partner_id;
  }
  function inPeriod(date, from, to){
    if(!from && !to) return true;
    if(!date) return false;
    var x = String(date).slice(0, 10);
    if(from && x < from) return false;
    if(to && x > to) return false;
    return true;
  }
  function num(v){ var n = Number(v); return isFinite(n) ? n : 0; }
  function r2(n){ return Math.round(n * 100) / 100; }

  /* -> [{campaignId, role, weight, share}] shares add up to 1 (empty if the deal has no campaign) */
  function creditSplit(deal, touches, model){
    var m = {}, order = [];
    function put(cid, role, w){
      if(!cid) return;
      if(!m[cid]){ m[cid] = {campaignId: cid, role: role, weight: w}; order.push(cid); }
      else { m[cid].weight = w; if(role === 'sourced') m[cid].role = 'sourced'; }
    }
    if(deal.campaign_id) put(deal.campaign_id, 'sourced', 1);
    if(model !== 'sourced_only'){
      (touches || []).forEach(function(t){
        if(!t || t.deal_id !== deal.id || !t.campaign_id) return;
        var w = num(t.weight); if(!(w > 0)) w = 1;
        put(t.campaign_id, t.role === 'sourced' ? 'sourced' : 'influenced', w);
      });
    }
    var tot = 0; order.forEach(function(c){ tot += m[c].weight; });
    return order.map(function(c){ var o = m[c]; return {campaignId: c, role: o.role, weight: o.weight, share: tot ? o.weight / tot : 0}; });
  }

  function compute(input){
    input = input || {};
    var model = input.model === 'sourced_only' ? 'sourced_only' : 'multi_touch';
    var conv = typeof input.convert === 'function' ? input.convert : function(a){ return num(a); };
    var scope = Array.isArray(input.scope) ? input.scope.reduce(function(o, id){ o[id] = 1; return o; }, {}) : null;
    var names = {}; (input.campaigns || []).forEach(function(c){ if(c && c.id) names[c.id] = c.name || 'Campaign'; });
    var touches = input.touches || [];
    var res = {
      model: model, from: input.from || null, to: input.to || null,
      wonTotal: 0, wonCount: 0, credited: 0, creditedPct: 0,
      marketingSourced: {value: 0, count: 0}, partnerSourced: {value: 0, count: 0},
      unattributed: {value: 0, count: 0, deals: []}, outOfScope: 0,
      lost: {value: 0, count: 0}, openInfluenced: {value: 0, count: 0},
      noCloseDate: 0, multiTouchDeals: 0,
      byCampaign: [], deals: [], spend: null, returnOnSpend: null
    };
    var byC = {};
    (input.deals || []).forEach(function(d){
      if(!d) return;
      var kind = stageKind(d.stage), val = r2(num(conv(num(d.value), d.currency)));
      var split = creditSplit(d, touches, model);
      if(kind === 'open'){
        var inS = split.some(function(s){ return !scope || scope[s.campaignId]; });
        if(split.length && inS){ res.openInfluenced.value += val; res.openInfluenced.count++; }
        return;
      }
      if(!inPeriod(d.close_date, res.from, res.to)){ if(!d.close_date && (res.from || res.to) && kind === 'won') res.noCloseDate++; return; }
      if(kind === 'lost'){ res.lost.value += val; res.lost.count++; return; }
      res.wonTotal += val; res.wonCount++;
      var partner = isPartnerSourced(d);
      var row = {id: d.id, name: d.name || 'Deal', value: val, closeDate: d.close_date || null, partner: partner, credits: []};
      if(!split.length){
        res.unattributed.value += val; res.unattributed.count++;
        res.unattributed.deals.push({id: d.id, name: row.name, value: val, closeDate: row.closeDate});
      } else {
        if(split.length > 1) res.multiTouchDeals++;
        var bucket = partner ? res.partnerSourced : res.marketingSourced;
        bucket.value += val; bucket.count++;
        split.forEach(function(s){
          var amt = val * s.share;
          row.credits.push({campaignId: s.campaignId, name: names[s.campaignId] || 'Campaign', role: s.role, share: s.share, value: r2(amt)});
          if(scope && !scope[s.campaignId]){ res.outOfScope += amt; return; }
          res.credited += amt;
          var c = byC[s.campaignId] || (byC[s.campaignId] = {campaignId: s.campaignId, name: names[s.campaignId] || 'Campaign', value: 0, sourced: 0, influenced: 0, deals: 0, partner: 0});
          c.value += amt; c.deals++; c[s.role] += amt; if(partner) c.partner += amt;
        });
      }
      res.deals.push(row);
    });
    ['wonTotal', 'credited', 'outOfScope'].forEach(function(k){ res[k] = r2(res[k]); });
    [res.marketingSourced, res.partnerSourced, res.unattributed, res.lost, res.openInfluenced].forEach(function(o){ o.value = r2(o.value); });
    res.creditedPct = res.wonTotal ? Math.round(res.credited / res.wonTotal * 1000) / 10 : 0;
    res.byCampaign = Object.keys(byC).map(function(k){ var c = byC[k]; c.value = r2(c.value); c.sourced = r2(c.sourced); c.influenced = r2(c.influenced); c.partner = r2(c.partner); return c; })
      .sort(function(a, b){ return b.value - a.value; });
    res.deals.sort(function(a, b){ return b.value - a.value; });
    if(input.spend && typeof input.spend === 'object'){
      var sp = 0; res.byCampaign.forEach(function(c){ sp += num(input.spend[c.campaignId]); });
      res.spend = r2(sp); res.returnOnSpend = sp > 0 ? Math.round(res.credited / sp * 100) / 100 : null;
    }
    res.rule = ruleText(model);
    return res;
  }

  function ruleText(model){
    return model === 'sourced_only'
      ? 'Closed Won deals closed in the period, in the base currency. Each deal is credited to the campaign it is linked to (sourced only). Partner-sourced deals are shown separately; deals with no campaign are Unattributed. Closed Lost is not included.'
      : 'Closed Won deals closed in the period, in the base currency. Each deal’s value is shared across every campaign that touched it, by weight (its own campaign counts as sourced) — never counted twice. Partner-sourced deals are shown separately; deals with no campaign are Unattributed. Closed Lost is not included.';
  }

  G.NorthPipelineContribution = {compute: compute, creditSplit: creditSplit, stageKind: stageKind, isPartnerSourced: isPartnerSourced, inPeriod: inPeriod, ruleText: ruleText};
  if(typeof module !== 'undefined' && module.exports) module.exports = G.NorthPipelineContribution;
})();
