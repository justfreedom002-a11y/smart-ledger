(() => {
  const cfg = window.SMART_LEDGER_CONFIG || {};
  const $ = id => document.getElementById(id);
  const money = n => "RM " + Number(n || 0).toLocaleString("en-MY",{minimumFractionDigits:2,maximumFractionDigits:2});
  const today = () => new Date().toLocaleDateString("en-CA");
  const dateTime = () => new Date().toISOString();
  let sb, currentUser, profile, categories = [], users = [], reportCache = [], recordsCache = [];
  const setText = (id, text) => { $(id).textContent = text || ""; };
  const show = (id, yes=true) => $(id).classList.toggle("hidden", !yes);
  const err = e => (e && e.message) ? e.message : String(e || "Unknown error");
  function initClient() {
    if (!cfg.SUPABASE_URL || cfg.SUPABASE_URL.includes("PASTE_") || !cfg.SUPABASE_ANON_KEY || cfg.SUPABASE_ANON_KEY.includes("PASTE_")) {
      show("setupNotice", true);
      $("setupNotice").textContent = "Setup required: add your Supabase Project URL and publishable/anon key to config.js, then reload this page.";
      return false;
    }
    sb = window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY);
    return true;
  }
  function loginEmail(id) { return id.trim().toLowerCase() + "@smartledger.local"; }
  function localDate(iso) { return iso ? new Date(iso + "T12:00:00").toLocaleDateString("en-MY") : ""; }
  async function loadProfile() {
    const {data,error} = await sb.from("profiles").select("id, username, display_name, role, is_active").eq("id",currentUser.id).single();
    if (error) throw error;
    profile = data;
    if (!profile.is_active) { await sb.auth.signOut(); throw new Error("This account has been disabled. Contact your administrator."); }
    show("adminTab", profile.role === "admin");
    show("actionsHeader", true);
    if (profile.role === "admin") { await loadUserList(); setupUserFilters(); } else { setupUserFilters(); }
  }
  function setupUserFilters() {
    const filterIds = ["dashUser", "recordsUser", "reportUser"];
    filterIds.forEach(id => {
      const el = $(id);
      if (!el) return;
      if (profile.role !== "admin") {
        el.innerHTML = `<option value="${currentUser.id}">My records</option>`;
        el.value = currentUser.id;
        el.closest("label")?.classList.add("hidden");
        return;
      }
      el.closest("label")?.classList.remove("hidden");
      const currentLabel = profile.display_name || profile.username || "My records";
      el.innerHTML = `<option value="${currentUser.id}">My records (${escapeHtml(currentLabel)})</option><option value="all">All Users</option>` +
        users.filter(u => u.id !== currentUser.id).map(u => `<option value="${u.id}">${escapeHtml(u.display_name || u.username)} (${escapeHtml(u.username)})</option>`).join("");
      el.value = currentUser.id;
    });
  }
  function selectedUserId(elementId) {
    if (profile.role !== "admin") return currentUser.id;
    const value = $(elementId)?.value || currentUser.id;
    return value === "all" ? null : value;
  }
  async function loadCategories() {
    const {data,error} = await sb.from("categories").select("id,name,is_active").order("name");
    if (error) throw error;
    categories = data || [];
    const active = categories.filter(c => c.is_active);
    const options = '<option value="">All categories</option>' + active.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    $("recordsCategory").innerHTML = options;
    $("reportCategory").innerHTML = options;
    $("recordCategory").innerHTML = active.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("");
    renderCategoryList();
  }
  function escapeHtml(v) { return String(v ?? "").replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function setDefaultDates() {
    ["dashFrom","dashTo","recordsFrom","recordsTo","reportFrom","reportTo","recordDate"].forEach(id => $(id).value = today());
  }
  function openTab(tab) {
    document.querySelectorAll(".tab-panel").forEach(el=>el.classList.add("hidden"));
    $(tab).classList.remove("hidden");
    document.querySelectorAll(".tabs button[data-tab]").forEach(b=>b.classList.toggle("active",b.dataset.tab===tab));
    if(tab==="dashboard") loadDashboard();
    if(tab==="records") loadRecords();
    if(tab==="reports") generateReport();
  }
  async function getRecords(from,to,categoryId,userId) {
    let q = sb.from("records").select("id,category_id,code,amount,discount,record_date,created_at,created_by,is_void,voided_by,voided_at,profiles(username,display_name),categories(name)").gte("record_date",from).lte("record_date",to).order("record_date",{ascending:false}).order("created_at",{ascending:false});
    if(categoryId) q=q.eq("category_id",categoryId);
    // RLS protects the database; this filter controls the admin UI selection.
    if (profile.role !== "admin") q=q.eq("created_by",currentUser.id);
    else if (userId) q=q.eq("created_by",userId);
    const {data,error}=await q;
    if(error) throw error;
    return data || [];
  }
  function activeRecords(rows) { return rows.filter(r => !r.is_void); }
  function totals(rows) {
    return activeRecords(rows).reduce((a,r)=>{a.amount+=Number(r.amount||0);a.discount+=Number(r.discount||0);a.count++;return a;},{amount:0,discount:0,count:0});
  }
  async function loadDashboard() {
    try {
      const rows=activeRecords(await getRecords($("dashFrom").value||today(),$("dashTo").value||today(),null,selectedUserId("dashUser")));
      const by={}; rows.forEach(r=>{const k=r.category_id;by[k] ||= {name:r.categories?.name||"Unknown",amount:0,discount:0,count:0};by[k].amount+=Number(r.amount||0);by[k].discount+=Number(r.discount||0);by[k].count++;});
      const allCats=categories;
      $("dashboardRows").innerHTML=allCats.map(c=>{const x=by[c.id]||{amount:0,discount:0,count:0};return `<tr><td>${escapeHtml(c.name)}${c.is_active?"":' <span class="pill off">Inactive</span>'}</td><td>${money(x.amount)}</td><td>${money(x.discount)}</td><td>${x.count}</td></tr>`}).join("");
      const t=totals(rows);
      $("dashboardFoot").innerHTML=`<tr><td>Grand Total</td><td>${money(t.amount)}</td><td>${money(t.discount)}</td><td>${t.count}</td></tr>`;
      $("summaryCards").innerHTML=`<div class="card"><div class="label">Total Amount</div><div class="value">${money(t.amount)}</div></div><div class="card"><div class="label">Total Discount</div><div class="value">${money(t.discount)}</div></div><div class="card"><div class="label">Total Records</div><div class="value">${t.count}</div></div>`;
    } catch(e) { alert("Could not load dashboard: "+err(e)); }
  }
  async function saveRecord(e) {
    e.preventDefault(); setText("recordMessage","");
    const amount=$("recordAmount").value, discount=$("recordDiscount").value;
    const payload={category_id:$("recordCategory").value,code:$("recordCode").value.trim()||null,amount:amount===""?null:Number(amount),discount:discount===""?null:Number(discount),record_date:$("recordDate").value,created_by:currentUser.id};
    const {error}=await sb.from("records").insert(payload);
    if(error){setText("recordMessage","Save failed: "+err(error));return;}
    $("recordForm").reset(); $("recordDate").value=today(); setText("recordMessage","Saved successfully.");
    await loadDashboard();
  }
  async function loadRecords() {
    try {
      let rows=await getRecords($("recordsFrom").value||"2000-01-01",$("recordsTo").value||"2999-12-31",$("recordsCategory").value||null,selectedUserId("recordsUser"));
      const search=$("recordsSearch").value.trim().toLowerCase();
      if(search) rows=rows.filter(r=>(r.code||"").toLowerCase().includes(search));
      recordsCache=rows;
      $("recordsRows").innerHTML=rows.map(r=>{
        const canManage = profile.role === "admin" || r.created_by === currentUser.id;
        const status = r.is_void ? '<span class="pill off">VOID</span>' : '<span class="pill">Active</span>';
        const voidButton = canManage ? (r.is_void
          ? `<button class="secondary" data-undo-void="${r.id}">Undo Void</button>`
          : `<button class="secondary" data-void="${r.id}">Void</button>`) : "";
        const deleteButton = profile.role === "admin" ? ` <button class="danger" data-delete="${r.id}">Delete</button>` : "";
        return `<tr class="${r.is_void ? "void-record" : ""}"><td>${localDate(r.record_date)}</td><td>${escapeHtml(r.categories?.name||"")}</td><td>${escapeHtml(r.code||"-")}</td><td>${r.amount==null?"-":money(r.amount)}</td><td>${r.discount==null?"-":money(r.discount)}</td><td>${escapeHtml(r.profiles?.display_name||r.profiles?.username||"")}</td><td>${status} ${voidButton}${deleteButton}</td></tr>`;
      }).join("");
      setText("recordsMessage",`${rows.length} record(s), including void records`);
      $("recordsRows").querySelectorAll("[data-void]").forEach(b=>b.addEventListener("click",()=>setRecordVoid(b.dataset.void,true)));
      $("recordsRows").querySelectorAll("[data-undo-void]").forEach(b=>b.addEventListener("click",()=>setRecordVoid(b.dataset.undoVoid,false)));
      $("recordsRows").querySelectorAll("[data-delete]").forEach(b=>b.addEventListener("click",()=>deleteRecord(b.dataset.delete)));
    } catch(e) { setText("recordsMessage","Could not load records: "+err(e)); }
  }

  async function setRecordVoid(id, isVoid) {
    const action = isVoid ? "void" : "restore";
    const promptText = isVoid
      ? "Void this record? It will remain visible in Records but be excluded from totals and reports."
      : "Undo Void for this record? It will be included in totals and reports again.";
    if (!confirm(promptText)) return;
    try {
      const { error } = await sb.rpc("set_record_void", { p_record_id: id, p_is_void: isVoid });
      if (error) throw error;
      await loadRecords();
      await loadDashboard();
      await generateReport();
      setText("recordsMessage", isVoid ? "Record marked as VOID." : "Void removed; record restored.");
    } catch (e) {
      alert(`Could not ${action} record: ` + err(e));
    }
  }
  async function deleteRecord(id) {
    if(!confirm("Delete this record permanently?")) return;
    const {error}=await sb.from("records").delete().eq("id",id);
    if(error){alert("Delete failed: "+err(error));return;}
    await loadRecords(); await loadDashboard();
  }
  async function generateReport() {
    try {
      reportCache=activeRecords(await getRecords($("reportFrom").value||today(),$("reportTo").value||today(),$("reportCategory").value||null,selectedUserId("reportUser")));
      const t=totals(reportCache);
      const group={}; reportCache.forEach(r=>{const n=r.categories?.name||"Unknown";group[n] ||= {amount:0,discount:0,count:0};group[n].amount+=Number(r.amount||0);group[n].discount+=Number(r.discount||0);group[n].count++;});
      setText("reportTotals",`Records: ${t.count} · Total Amount: ${money(t.amount)} · Total Discount: ${money(t.discount)}`);
      $("reportRows").innerHTML=reportCache.map(r=>`<tr><td>${localDate(r.record_date)}</td><td>${new Date(r.created_at).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"})}</td><td>${escapeHtml(r.categories?.name||"")}</td><td>${escapeHtml(r.code||"-")}</td><td>${r.amount==null?"":money(r.amount)}</td><td>${r.discount==null?"":money(r.discount)}</td><td>${escapeHtml(r.profiles?.display_name||r.profiles?.username||"")}</td></tr>`).join("");
      const categoryFoot=Object.entries(group).map(([name,x])=>`<tr><td colspan="3">${escapeHtml(name)} subtotal</td><td></td><td>${money(x.amount)}</td><td>${money(x.discount)}</td><td>${x.count} records</td></tr>`).join("");
      $("reportFoot").innerHTML=categoryFoot+`<tr><td colspan="4">GRAND TOTAL</td><td>${money(t.amount)}</td><td>${money(t.discount)}</td><td>${t.count} records</td></tr>`;
    } catch(e) { setText("reportTotals","Could not generate report: "+err(e)); }
  }
  function exportCsv() {
    const rows=reportCache; const head=["Date","Time","Category","Code","Amount (RM)","Discount (RM)","Created By","Status"];
    const data=[head,...rows.map(r=>[r.record_date,new Date(r.created_at).toLocaleTimeString("en-MY",{hour:"2-digit",minute:"2-digit"}),r.categories?.name||"",r.code||"",r.amount??"",r.discount??"",r.profiles?.display_name||r.profiles?.username||"",r.is_void?"VOID":"Active"])];
    const t=totals(rows);
    const group={}; rows.forEach(r=>{const n=r.categories?.name||"Unknown";group[n] ||= {amount:0,discount:0,count:0};group[n].amount+=Number(r.amount||0);group[n].discount+=Number(r.discount||0);group[n].count++;});
    data.push([]);
    Object.entries(group).forEach(([name,x])=>data.push([name+" subtotal","","","",x.amount.toFixed(2),x.discount.toFixed(2),x.count+" records"]));
    data.push(["GRAND TOTAL","","","",t.amount.toFixed(2),t.discount.toFixed(2),t.count+" records"]);
    const csv="\uFEFF"+data.map(row=>row.map(v=>`"${String(v??"").replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"}); const url=URL.createObjectURL(blob); const a=document.createElement("a");a.href=url;a.download=`smart-ledger-${$("reportFrom").value}-to-${$("reportTo").value}.csv`;a.click();URL.revokeObjectURL(url);
  }
  async function createCategory(e) {
    e.preventDefault(); setText("categoryMessage","");
    const name=$("categoryName").value.trim(); if(!name)return;
    const {error}=await sb.from("categories").insert({name,created_by:currentUser.id});
    if(error){setText("categoryMessage","Failed: "+err(error));return;}
    $("categoryName").value="";setText("categoryMessage","Category created.");await loadCategories();await loadDashboard();
  }
  function renderCategoryList() {
    $("categoryList").innerHTML=categories.map(c=>`<div class="category-item"><span>${escapeHtml(c.name)} ${c.is_active?'<span class="pill">Active</span>':'<span class="pill off">Inactive</span>'}</span><div class="category-actions"><button class="secondary" data-toggle="${c.id}" data-active="${c.is_active}">${c.is_active?"Deactivate":"Activate"}</button><button class="danger" data-cat-delete="${c.id}" data-cat-name="${escapeHtml(c.name)}">Delete</button></div></div>`).join("");
    $("categoryList").querySelectorAll("[data-toggle]").forEach(b=>b.addEventListener("click",async()=>{const {error}=await sb.from("categories").update({is_active:b.dataset.active!=="true"}).eq("id",b.dataset.toggle);if(error){alert(err(error));return;}await loadCategories();await loadDashboard();}));
    $("categoryList").querySelectorAll("[data-cat-delete]").forEach(b=>b.addEventListener("click",async()=>{if(!confirm(`Permanently delete category “${b.dataset.catName}”? Categories with existing records cannot be deleted.`))return;const {count,error:checkError}=await sb.from("records").select("id",{count:"exact",head:true}).eq("category_id",b.dataset.catDelete);if(checkError){alert("Could not check category usage: "+err(checkError));return;}if(count>0){alert("This category has existing records and cannot be deleted. You can deactivate it instead.");return;}const {error}=await sb.from("categories").delete().eq("id",b.dataset.catDelete);if(error){alert("Delete failed: "+err(error));return;}await loadCategories();await loadDashboard();}));
  }
  async function loadUserList() {
    const {data,error}=await sb.from("profiles").select("id,username,display_name,role,is_active,created_at").order("created_at",{ascending:true});
    if(error){setText("manageUserMessage","Could not load users: "+err(error));return;}
    users = data || [];
    const userRows = users;
    setupUserFilters();
    setText("userCount",`Total users: ${users.length} · Active: ${users.filter(u=>u.is_active).length}`);
    $("userList").innerHTML=userRows.map(u=>`<div class="user-item user-management-item"><div class="user-meta"><strong>${escapeHtml(u.display_name||u.username)}</strong><div class="muted small">Login ID: ${escapeHtml(u.username)} · ${u.role==="admin"?"Admin":"User"} · ${u.is_active?"Active":"Inactive"}</div><div class="muted small">Created: ${u.created_at?new Date(u.created_at).toLocaleDateString("en-MY"):"—"}</div></div><input aria-label="Display name for ${escapeHtml(u.username)}" data-display-name="${u.id}" value="${escapeHtml(u.display_name||u.username)}" maxlength="80"><div class="user-actions"><button class="secondary" data-display-save="${u.id}">Save name</button>${u.id!==currentUser.id?`<button class="danger" data-user-delete="${u.id}" data-user-name="${escapeHtml(u.display_name||u.username)}" data-user-id="${escapeHtml(u.username)}">Delete user</button>`:`<span class="pill">Current account</span>`}</div></div>`).join("");
    $("userList").querySelectorAll("[data-display-save]").forEach(b=>b.addEventListener("click",()=>saveDisplayName(b.dataset.displaySave)));
    $("userList").querySelectorAll("[data-user-delete]").forEach(b=>b.addEventListener("click",()=>deleteUser(b.dataset.userDelete,b.dataset.userName,b.dataset.userId)));
  }
  async function callAdminFunction(name, payload) {
    const {data:{session}}=await sb.auth.getSession();
    if(!session) throw new Error("Your session has expired. Please log in again.");
    const res=await fetch(cfg.SUPABASE_URL+"/functions/v1/"+name,{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":cfg.SUPABASE_ANON_KEY},body:JSON.stringify(payload)});
    let body={}; try { body=await res.json(); } catch {}
    if(!res.ok) throw new Error(body.error||`Request failed (${res.status})`);
    return body;
  }
  async function saveDisplayName(userId) {
    const input=$("userList").querySelector(`[data-display-name="${userId}"]`); const displayName=input.value.trim();
    if(!displayName){setText("manageUserMessage","Display name cannot be blank.");return;}
    setText("manageUserMessage","Saving display name…");
    try { await callAdminFunction("update-user-display-name",{userId,displayName}); setText("manageUserMessage","Display name updated. Login ID and password are unchanged."); await loadUserList(); if(userId===currentUser.id){await loadProfile();} }
    catch(e){setText("manageUserMessage","Failed: "+err(e));}
  }
  async function deleteUser(userId, displayName, username) {
    if(!confirm(`Delete user “${displayName}” (login ID: ${username})? This cannot be undone. Users with historical records cannot be deleted.`)) return;
    setText("manageUserMessage","Deleting user…");
    try { await callAdminFunction("delete-user",{userId}); setText("manageUserMessage",`User “${displayName}” deleted.`); await loadUserList(); }
    catch(e){setText("manageUserMessage","Failed: "+err(e));}
  }
  async function createUser(e) {
    e.preventDefault(); setText("userMessage","Creating user…");
    const username=$("newUserId").value.trim().toLowerCase(), displayName=$("newUserDisplayName").value.trim(), password=$("newUserPassword").value;
    try {
      const {data:{session}}=await sb.auth.getSession();
      const res=await fetch(cfg.SUPABASE_URL+"/functions/v1/create-user",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+session.access_token,"apikey":cfg.SUPABASE_ANON_KEY},body:JSON.stringify({username,displayName,password})});
      const body=await res.json();
      if(!res.ok) throw new Error(body.error||"Could not create user");
      $("userForm").reset();setText("userMessage","User created successfully.");
    } catch(e){setText("userMessage","Failed: "+err(e));}
  }
  async function afterLogin() {
    try {
      await loadProfile(); await loadCategories(); setDefaultDates();
      show("loginView",false);show("mainView",true);show("logoutBtn",true);
      openTab("dashboard");
    } catch(e) { setText("loginError",err(e)); await sb.auth.signOut(); }
  }
  async function start() {
    if(!initClient()) return;
    $("loginForm").addEventListener("submit",async e=>{e.preventDefault();setText("loginError","");const id=$("loginId").value.trim();const {data,error}=await sb.auth.signInWithPassword({email:loginEmail(id),password:$("loginPassword").value});if(error){setText("loginError","Login failed. Check your ID and password.");return;}currentUser=data.user;await afterLogin();});
    $("logoutBtn").addEventListener("click",async()=>{await sb.auth.signOut();location.reload();});
    document.querySelectorAll("[data-tab]").forEach(b=>b.addEventListener("click",()=>openTab(b.dataset.tab)));
    $("recordForm").addEventListener("submit",saveRecord);$("dashApply").addEventListener("click",loadDashboard);
    $("dashToday").addEventListener("click",()=>{$("dashFrom").value=today();$("dashTo").value=today();loadDashboard();});
    $("recordsApply").addEventListener("click",loadRecords);$("generateReport").addEventListener("click",generateReport);$("exportCsv").addEventListener("click",exportCsv);
    ["dashUser"].forEach(id=>$(id).addEventListener("change",loadDashboard));
    ["recordsUser"].forEach(id=>$(id).addEventListener("change",loadRecords));
    ["reportUser"].forEach(id=>$(id).addEventListener("change",generateReport));
    $("categoryForm").addEventListener("submit",createCategory);$("userForm").addEventListener("submit",createUser);
    const applyTheme = dark => { document.body.classList.toggle("dark",dark); $("themeToggle").textContent=dark?"☀️ Light mode":"🌙 Dark mode"; localStorage.setItem("smart-ledger-theme",dark?"dark":"light"); };
    applyTheme(localStorage.getItem("smart-ledger-theme")==="dark");
    $("themeToggle").addEventListener("click",()=>applyTheme(!document.body.classList.contains("dark")));
    const {data:{session}}=await sb.auth.getSession();if(session){currentUser=session.user;await afterLogin();}
  }
  document.addEventListener("DOMContentLoaded",start);
})();
