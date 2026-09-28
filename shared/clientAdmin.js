/* shared/clientAdmin.js -- 2026-09-28 (L2/L3 client-group tiers)

   L2 "Client Super User": can view AND (after the usual explicit "enable editing" click) edit
   every organisation in their client group -- the org a grant names plus every org whose
   parent_org_id chain leads back to it. No billing, licensing, org creation or platform settings.
   L3 "Client Overseer": the same organisations, read-only.

   Grants live in client_admin_grants (managed by the full Super Admin in Configuration). The
   real enforcement is row-level security (policies added by run sheet part 3); this file only
   tells a module whether to show the "Client view" bar and which organisations to list in it.
   Fails soft: before part 3 runs, the RPCs don't exist and everyone is simply "not a client admin". */
(function(){
  window.northLoadClientAdmin = async function(sb){
    try{
      const { data, error } = await sb.rpc('client_admin_level');
      if(error || !data) return { level:null, loadOrgs:null };
      return {
        level: data,
        loadOrgs: async function(){
          const r = await sb.rpc('client_admin_org_list');
          return (r.error ? [] : (r.data||[])).map(o=>({ id:o.id, name:o.name }));
        }
      };
    }catch(e){ return { level:null, loadOrgs:null }; }
  };
})();
