/* orgSwitcher.js -- backlog item 6 (2026-09-08): multi-org membership +
 * an org switcher usable in every North module.
 *
 * Shared across all 9 module files + index.html, same convention as
 * moduleFooter.js/convertToMain.js/currencyOptions.js/charts.js.
 *
 * How it fits into the existing per-file boot flow: every module already
 * does `_myProfile = prof; _orgId = prof.org_id;` right after fetching
 * the caller's profiles row, then goes on to load that org's data. This
 * file adds ONE call -- `initOrgSwitcher();` -- right after that line.
 * It does not touch _orgId or how any module loads its data: switching
 * org calls switch_active_org() (server-side RPC, Northm migration
 * 2026-09-08-item6-multi-org-membership-and-switcher.sql), which flips
 * profiles.org_id/role_id, then reloads the page -- at which point the
 * module's own existing profile fetch just naturally re-resolves against
 * the new org. Nothing per-module needed to change beyond that one line.
 *
 * Depends on globals each module already defines before calling
 * initOrgSwitcher(): `sb` (the Supabase client), `_myProfile`, `esc()`.
 * Safe because these are referenced only inside functions below, never
 * at parse time -- by the time initOrgSwitcher() actually runs (from
 * each module's boot sequence, after those globals are set), they exist.
 */

let _myOrgMemberships = [];

async function _loadMyOrgMemberships(){
  if(!_myProfile) return [];
  const { data, error } = await sb.from('profile_orgs')
    .select('org_id, organizations(name)')
    .eq('profile_id', _myProfile.id);
  if(error){ console.error('orgSwitcher: failed to load memberships', error); return []; }
  return (data||[]).map(r => ({ org_id: r.org_id, name: r.organizations ? r.organizations.name : r.org_id }));
}

function _orgSwitcherHtml(){
  if(_myOrgMemberships.length < 2) return '';
  const current = _myOrgMemberships.find(m => m.org_id === _orgId);
  const currentName = current ? current.name : '...';
  const options = _myOrgMemberships
    .slice()
    .sort((a,b) => a.name.localeCompare(b.name))
    .map(m => `<option value="${esc(m.org_id)}" ${m.org_id===_orgId?'selected':''}>${esc(m.name)}</option>`)
    .join('');
  return `<div class="tn-orgswitch" style="display:flex;align-items:center;gap:6px;margin-right:10px;" title="You belong to ${_myOrgMemberships.length} organizations -- switch which one is active">
    <span style="font-size:11px;opacity:.65;">Org</span>
    <select onchange="switchActiveOrgUi(this.value)" style="font-size:12px;padding:2px 6px;border-radius:6px;border:1px solid var(--line,#ccc);background:var(--surface,#fff);max-width:160px;">
      ${options}
    </select>
  </div>`;
}

async function switchActiveOrgUi(newOrgId){
  if(!newOrgId || newOrgId === _orgId) return;
  const { error } = await sb.rpc('switch_active_org', { p_org_id: newOrgId });
  if(error){
    console.error('orgSwitcher: switch failed', error);
    if(typeof toast === 'function') toast('Could not switch organization: ' + error.message);
    else alert('Could not switch organization: ' + error.message);
    return;
  }
  // Simplest, safest way to make every module's existing (unchanged)
  // data-loading code pick up the new org -- a full reload re-runs the
  // normal boot sequence, which re-fetches profiles and gets the new
  // org_id/role_id back.
  location.reload();
}

async function initOrgSwitcher(){
  _myOrgMemberships = await _loadMyOrgMemberships();
  if(_myOrgMemberships.length < 2) return; // nothing to switch between -- stay silent, no UI clutter for single-org users (the overwhelming majority today)
  const acct = document.getElementById('tnAcct');
  if(!acct || !acct.parentNode) return;
  let mount = document.getElementById('tnOrgSwitchMount');
  if(!mount){
    mount = document.createElement('div');
    mount.id = 'tnOrgSwitchMount';
    acct.parentNode.insertBefore(mount, acct);
  }
  mount.innerHTML = _orgSwitcherHtml();
}
