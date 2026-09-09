path = "Eventus.html"
with open(path, "r") as f:
    content = f.read()

def do(label, old, new, expected=1):
    n = content.count(old)
    if n != expected:
        raise SystemExit(f"'{label}' FAILED: expected {expected}, found {n}")
    return content.replace(old, new, expected)

# 1. UI state: add eventsView (cosmetic/consistency, not functionally required
# since JS allows dynamic prop assignment, but matches the pattern of every
# other UI.* flag being declared up front).
old = "const UI = { page:'home', helpOpen:false, eventId:null, rollupLevel:'programme', rollupProgrammeId:null, rollupCampaignId:null,\n  eventsFilter:'', eventsSortBy:null, eventsSortDir:'asc', eventsUpcomingOnly:false };"
new = "const UI = { page:'home', helpOpen:false, eventId:null, rollupLevel:'programme', rollupProgrammeId:null, rollupCampaignId:null,\n  eventsFilter:'', eventsSortBy:null, eventsSortDir:'asc', eventsUpcomingOnly:false, eventsView:'table' };"
content = do("UI eventsView", old, new)

# 2. select: add sort_order so it's actually fetched from the DB
old = "sb.from('eventus_events').select('id,name,type,status,start_date,end_date,country,venue,location,pax,requester,campaign_ref,campaign_id,budget,registered,attended,tracking_ref,is_template,budget_fx')"
new = "sb.from('eventus_events').select('id,name,type,status,start_date,end_date,country,venue,location,pax,requester,campaign_ref,campaign_id,budget,registered,attended,tracking_ref,is_template,budget_fx,sort_order')"
content = do("select sort_order", old, new)

# 3. CFG.events map: read sort_order back into sortOrder (same pattern already
# used for eventVenues on the line right below this one).
old = """  CFG.events = (eventsR.data||[]).map(e=>({
    id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start:e.start_date||'',end:e.end_date||'',
    country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
    campaignRef:e.campaign_ref||'',campaignId:e.campaign_id||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
    budgetFx:e.budget_fx||null,budgetCcy:(e.budget_fx&&e.budget_fx.originalCurrency)||'',
    trackingRef:e.tracking_ref||null,isTemplate:!!e.is_template
  }));"""
new = """  CFG.events = (eventsR.data||[]).map(e=>({
    id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start:e.start_date||'',end:e.end_date||'',
    country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
    campaignRef:e.campaign_ref||'',campaignId:e.campaign_id||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
    budgetFx:e.budget_fx||null,budgetCcy:(e.budget_fx&&e.budget_fx.originalCurrency)||'',
    trackingRef:e.tracking_ref||null,isTemplate:!!e.is_template,sortOrder:e.sort_order||0
  }));"""
content = do("CFG.events sortOrder", old, new)

# 4. saveToSupabase's eventus_events upsert payload: actually persist sortOrder
# back to the DB (same pattern already used for eventVenues' sort_order right
# below it) -- without this, drag-to-reorder would edit the in-memory row and
# render fine, but silently NOT survive a save/reload, since the upsert never
# sent the column.
old = """    upsertRows('eventus_events', CFG.events, e=>({
      id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start_date:e.start||null,end_date:e.end||null,
      country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
      campaign_ref:e.campaignRef||'',campaign_id:e.campaignId||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
      budget_fx:e.budgetFx||null,
      tracking_ref:e.trackingRef||null,is_template:!!e.isTemplate
    })),"""
new = """    upsertRows('eventus_events', CFG.events, e=>({
      id:e.id,name:e.name,type:e.type||'',status:e.status||'Planned',start_date:e.start||null,end_date:e.end||null,
      country:e.country||'',venue:e.venue||'',location:e.location||'',pax:e.pax||0,requester:e.requester||'',
      campaign_ref:e.campaignRef||'',campaign_id:e.campaignId||null,budget:e.budget||0,registered:e.registered||0,attended:e.attended||0,
      budget_fx:e.budgetFx||null,sort_order:e.sortOrder||0,
      tracking_ref:e.trackingRef||null,is_template:!!e.isTemplate
    })),"""
content = do("save payload sort_order", old, new)

with open(path, "w") as f:
    f.write(content)
print("FIX PATCH APPLIED OK")
