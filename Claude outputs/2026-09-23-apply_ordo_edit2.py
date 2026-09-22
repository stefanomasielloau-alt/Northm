import sys, io

path = sys.argv[1]
with io.open(path, 'r', encoding='utf-8') as f:
    src = f.read()

orig_len = len(src)

# --- A. move Edit layout / Reset layout buttons into the ctxbar (grey bar) -
old_ctxbar = """<div class="ctxbar" id="ctxbar">
  <div class="ctx"><span class="lbl">Role</span><select id="cRole" class="num"></select></div>
  <div class="ctx"><span class="lbl">Version</span><select id="cVer"></select></div>
  <div class="ctx"><span class="lbl">FY</span><select id="cFy"></select></div>
  <div class="ctx"><span class="lbl">Grain</span><select id="cGrain"></select></div>
</div>"""
assert src.count(old_ctxbar) == 1, "ctxbar anchor not found exactly once"
new_ctxbar = """<div class="ctxbar" id="ctxbar">
  <div class="ctx"><span class="lbl">Role</span><select id="cRole" class="num"></select></div>
  <div class="ctx"><span class="lbl">Version</span><select id="cVer"></select></div>
  <div class="ctx"><span class="lbl">FY</span><select id="cFy"></select></div>
  <div class="ctx"><span class="lbl">Grain</span><select id="cGrain"></select></div>
  <div class="sp" style="flex:1"></div>
  <button class="btn sm" id="grid-edit-toggle" type="button" style="display:none">⠿ Edit layout</button>
  <button class="btn sm" id="grid-reset" type="button" style="display:none">Reset layout</button>
</div>"""
src = src.replace(old_ctxbar, new_ctxbar, 1)

# --- B. remove the old per-page buttons from pageHome()'s own header -------
old_home_buttons = """    <button class="btn" id="grid-edit-toggle-home" type="button">⠿ Edit layout</button>
    <button class="btn" id="grid-reset-home" type="button">Reset layout</button>
    <button class="btn pri" onclick="go('dashboard')">Open dashboard</button></div>`;"""
assert src.count(old_home_buttons) == 1, "pageHome button anchor not found exactly once"
new_home_buttons = """    <button class="btn pri" onclick="go('dashboard')">Open dashboard</button></div>`;"""
src = src.replace(old_home_buttons, new_home_buttons, 1)

with io.open(path, 'w', encoding='utf-8') as f:
    f.write(src)

print("OK, chars before:", orig_len, "after:", len(src), "delta:", len(src) - orig_len)
