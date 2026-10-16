// node "Claude outputs/2026-10-16-pipelineContribution-test.js"
const P = require('../shared/pipelineContribution.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const rates = { USD: 1.5, GBP: 2 }; const conv = (a, c) => a * (rates[c] || 1);
const deals = [
  { id: 'd1', name: 'A', value: 1000, currency: 'AUD', stage: 'Closed Won', close_date: '2026-08-10', campaign_id: 'c1' },
  { id: 'd2', name: 'B', value: 1000, currency: 'USD', stage: 'Closed Won', close_date: '2026-08-20', campaign_id: 'c2', partner_id: 'p1', attribution_source: 'partner_sourced' },
  { id: 'd3', name: 'C', value: 500, currency: 'GBP', stage: 'Closed Won', close_date: '2026-09-01', campaign_id: null },
  { id: 'd4', name: 'D', value: 700, currency: 'AUD', stage: 'Closed Lost', close_date: '2026-08-15', campaign_id: 'c1' },
  { id: 'd5', name: 'E', value: 900, currency: 'AUD', stage: 'Negotiation', close_date: '2026-12-01', campaign_id: 'c1' },
  { id: 'd6', name: 'F', value: 400, currency: 'AUD', stage: 'Closed Won', close_date: '2025-01-01', campaign_id: 'c1' },
  { id: 'd7', name: 'G', value: 300, currency: 'AUD', stage: 'won', close_date: null, campaign_id: 'c1' },
  { id: 'd8', name: 'H', value: 200, currency: 'AUD', stage: 'Closed Won', close_date: '2026-08-01', campaign_id: 'c1', partner_id: 'p1', attribution_source: 'house_sourced' },
];
const touches = [{ deal_id: 'd1', campaign_id: 'c3', role: 'influenced', weight: 1 }, { deal_id: 'd1', campaign_id: 'c1', role: 'sourced', weight: 3 }];
const camps = [{ id: 'c1', name: 'One' }, { id: 'c2', name: 'Two' }, { id: 'c3', name: 'Three' }];
const r = P.compute({ deals, touches, campaigns: camps, from: '2026-07-01', to: '2026-09-30', convert: conv, spend: { c1: 500, c2: 500, c3: 0 } });
ok(r.wonCount === 4 && r.wonTotal === 1000 + 1500 + 1000 + 200, 'won total in period, converted ' + r.wonTotal);
ok(r.credited === 2700, 'credited excludes unattributed ' + r.credited);
ok(r.creditedPct === 73, 'pct ' + r.creditedPct);
ok(r.unattributed.count === 1 && r.unattributed.value === 1000 && r.unattributed.deals[0].id === 'd3', 'unattributed listed');
ok(r.partnerSourced.value === 1500 && r.partnerSourced.count === 1, 'partner sourced separate');
ok(r.marketingSourced.value === 1200 && r.marketingSourced.count === 2, 'house_sourced with partner stays marketing');
ok(r.lost.value === 700 && r.lost.count === 1, 'lost separate');
ok(r.openInfluenced.value === 900, 'open influenced');
ok(r.noCloseDate === 1, 'won with no close date counted as missing');
const c1 = r.byCampaign.find(c => c.campaignId === 'c1'), c3 = r.byCampaign.find(c => c.campaignId === 'c3');
ok(c1.value === 950 && c3.value === 250, 'weighted split 3:1 + d8 ' + c1.value + ' ' + c3.value);
ok(r.byCampaign.reduce((s, c) => s + c.value, 0) === r.credited, 'no double counting');
ok(r.multiTouchDeals === 1, 'multi-touch count');
ok(r.spend === 1000 && r.returnOnSpend === 2.7, 'return on spend ' + r.returnOnSpend);
const s = P.compute({ deals, touches, campaigns: camps, from: '2026-07-01', to: '2026-09-30', convert: conv, model: 'sourced_only' });
ok(s.byCampaign.find(c => c.campaignId === 'c1').value === 1200 && !s.byCampaign.find(c => c.campaignId === 'c3'), 'sourced only ignores touches');
const sc = P.compute({ deals, touches, campaigns: camps, from: '2026-07-01', to: '2026-09-30', convert: conv, scope: ['c1'] });
ok(sc.credited === 950 && sc.outOfScope === 1750, 'scope ' + sc.credited + ' ' + sc.outOfScope);
const all = P.compute({ deals, convert: conv });
ok(all.wonCount === 6 && all.noCloseDate === 0, 'all time includes no-date deals');
const z = P.compute({ deals: [] });
ok(z.wonTotal === 0 && z.creditedPct === 0 && z.returnOnSpend === null, 'zero deals');
ok(P.stageKind('Closed-Won') === 'won' && P.stageKind('closed_lost') === 'lost' && P.stageKind('Proposal') === 'open', 'stage kinds');
ok(/never counted twice/.test(r.rule), 'rule text');
console.log(pass + ' passed, ' + fail + ' failed'); process.exit(fail ? 1 : 0);
