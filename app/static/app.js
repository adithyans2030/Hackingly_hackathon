/* TrustGate dashboard: vanilla JS, no build step. */
(() => {
  "use strict";
  const $ = (s, el = document) => el.querySelector(s);
  const app = $("#app");
  const eventSel = $("#event");
  const LABEL = { APPROVED: "Approved", NEEDS_REVIEW: "Needs review", REJECTED: "Rejected", RESUBMIT: "Resubmit" };
  const DOC = { AADHAAR: "Aadhaar", PAN: "PAN", COLLEGE_ID: "College ID", DRIVING_LICENCE: "Driving licence",
    VOTER_ID: "Voter ID", PASSPORT: "Passport", UNKNOWN: "Unknown document" };
  const state = { events: [], filter: "", q: "", selected: null, fresh: null };

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const pct = (x) => (x == null ? "–" : `${Math.round(x * 100)}%`);
  const ago = (iso) => {
    const s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return "just now";
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return new Date(iso).toLocaleDateString();
  };
  async function api(path, opts = {}) {
    const r = await fetch(path, opts);
    if (!r.ok) {
      let msg = `${r.status}`;
      try { msg = (await r.json()).detail || msg; } catch (_) { /* not json */ }
      throw new Error(typeof msg === "string" ? msg : JSON.stringify(msg));
    }
    return r.json();
  }
  function toast(msg) {
    const t = document.createElement("div");
    t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 2600);
  }

  // ------------------------------------------------------------------ routing
  async function route() {
    const hash = location.hash || (location.pathname === "/register" ? "#/register" : "#/queue");
    const [, name, arg] = hash.split("/");
    document.querySelectorAll(".nav a").forEach((a) => {
      if (a.dataset.route === name) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current");
    });
    try {
      if (name === "register") return renderRegister();
      if (name === "metrics") return renderMetrics();
      state.selected = name === "v" ? arg : null;
      return renderQueue();
    } catch (e) {
      app.innerHTML = `<div class="empty"><h2>Couldn't load this page</h2><p>${esc(e.message)}</p></div>`;
    }
  }

  async function loadEvents() {
    state.events = await api("/v1/events");
    const saved = localStorage.getItem("tg-event") || "";
    eventSel.innerHTML = `<option value="">All events</option>` + state.events
      .map((e) => `<option value="${esc(e.id)}">${esc(e.name)}</option>`).join("");
    eventSel.value = state.events.some((e) => e.id === saved) ? saved : "";
    eventSel.onchange = () => { try { localStorage.setItem("tg-event", eventSel.value); } catch (_) {} route(); };
  }

  // ------------------------------------------------------------------ queue
  async function renderQueue() {
    const params = new URLSearchParams();
    if (eventSel.value) params.set("event_id", eventSel.value);
    const all = await api(`/v1/verifications?${params}`);
    const counts = all.reduce((m, r) => ((m[r.final_decision || "processing"] = (m[r.final_decision || "processing"] || 0) + 1), m), {});
    let rows = all;
    if (state.filter) rows = rows.filter((r) => r.final_decision === state.filter);
    if (state.q) {
      const q = state.q.toLowerCase();
      rows = rows.filter((r) => JSON.stringify(r.applicant).toLowerCase().includes(q));
    }
    const tabs = [["", "All", all.length], ["NEEDS_REVIEW", "Needs review", counts.NEEDS_REVIEW || 0],
      ["APPROVED", "Approved", counts.APPROVED || 0], ["REJECTED", "Rejected", counts.REJECTED || 0],
      ["RESUBMIT", "Resubmit", counts.RESUBMIT || 0]];

    app.innerHTML = `
      <div class="desk">
        <section class="queue" aria-label="Registrations">
          <div class="filters">
            <div class="tabs" role="group" aria-label="Filter by decision">
              ${tabs.map(([k, l, n]) => `<button data-f="${k}" aria-pressed="${state.filter === k}">${l}<span class="n">${n}</span></button>`).join("")}
            </div>
            <input class="search" type="search" placeholder="Search name or email" value="${esc(state.q)}" aria-label="Search">
          </div>
          <ul class="rows">
            ${rows.length ? rows.map(rowHTML).join("") : `<li class="empty"><h2>Nothing here yet</h2>
              <p>Submit a registration from the <a href="#/register">registration form</a>, or run
              <code>python scripts/evaluate.py --keep-db</code> to load the sample cases.</p></li>`}
          </ul>
        </section>
        <section class="case" id="case" aria-live="polite">
          ${state.selected ? "" : `<div class="empty"><h2>Pick a registration</h2>
            <p>Cases that need a person are under <b>Needs review</b>. Each one lists exactly which checks raised a concern.</p></div>`}
        </section>
      </div>`;
    app.querySelectorAll(".tabs button").forEach((b) => b.onclick = () => { state.filter = b.dataset.f; renderQueue(); });
    const search = $(".search", app);
    search.oninput = () => { state.q = search.value; clearTimeout(search._t); search._t = setTimeout(() => { renderQueue().then(() => { const s = $(".search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length); }); }, 250); };
    if (state.selected) renderCase(state.selected);
  }

  function rowHTML(r) {
    const d = r.final_decision || "processing";
    const flags = (r.flags || []).filter((f) => f !== "portrait_present").slice(0, 3).map((f) => f.replace(/_/g, " "));
    return `<li><a href="#/v/${esc(r.id)}" aria-current="${state.selected === r.id}">
      <span class="who">${esc(r.applicant.name)}</span>
      <span class="chip ${esc(d)}">${esc(LABEL[d] || "Processing")}</span>
      <span class="meta">${esc(DOC[r.doc_type] || "–")} · ${esc(ago(r.created_at))}${r.reviewed_by ? " · reviewed" : ""}</span>
      <span class="conf">${pct(r.confidence)}</span>
      ${flags.length && d !== "APPROVED" ? `<span class="flags">${esc(flags.join(", "))}</span>` : ""}
    </a></li>`;
  }

  // ------------------------------------------------------------------ case detail
  async function renderCase(id) {
    const box = $("#case");
    const v = await api(`/v1/verifications/${encodeURIComponent(id)}`);
    const r = v.result || {};
    if (v.status === "processing") {
      box.innerHTML = `<div class="empty"><h2>Checking this ID…</h2><p>This usually takes a few seconds.</p></div>`;
      setTimeout(() => state.selected === id && renderCase(id), 1500);
      return;
    }
    const final = v.final_decision;
    const ex = r.extracted || {};
    const sigs = r.signals || [];
    const bySev = (s) => sigs.filter((x) => x.severity === s);
    const attention = [...bySev("critical"), ...bySev("warn")];
    const matches = sigs.flatMap((s) => (s.data && s.data.matches ? s.data.matches.map((m) => ({ ...m, via: s.name })) : []))
      .filter((m) => m.verification_id);
    const face = sigs.find((s) => s.name === "face_match");
    const art = r.artifacts || {};
    const overridden = v.reviewed_at && final !== v.decision;
    const fresh = state.fresh === id; state.fresh = null;

    box.innerHTML = `
      <div class="case-head">
        <div>
          <h1>${esc(v.applicant.name)}</h1>
          <div class="sub">${esc(v.applicant.email || "no email")} · ${esc(eventName(v.event_id))}${v.applicant.external_ref ? ` · ref ${esc(v.applicant.external_ref)}` : ""}</div>
        </div>
        <div class="stamp ${esc(final)} ${fresh ? "fresh" : ""}" aria-label="Decision: ${esc(LABEL[final])}">
          ${esc((LABEL[final] || final).toUpperCase())}
          <small>${overridden ? `by ${esc(v.reviewed_by)}` : final === "NEEDS_REVIEW" ? `trust score ${pct(r.trust_score ?? r.confidence)}` : `${pct(r.confidence)} confidence`}</small>
        </div>
      </div>
      <p class="summary">${esc(r.summary || "")}</p>

      <div class="grid-2">
        <div class="stack">
          <section class="panel">
            <h2>${esc(DOC[ex.doc_type] || "Document")}
              <span style="display:flex;gap:12px;align-items:center">
                <label class="toggle"><input type="checkbox" id="boxes" checked> Field outlines</label>
                <span class="seg" role="group" aria-label="Image view">
                  <button data-view="card" aria-pressed="true">Card</button>
                  ${art.ela ? `<button data-view="ela" aria-pressed="false">Compression map</button>` : ""}
                </span>
              </span>
            </h2>
            <div class="viewer" id="viewer">
              ${art.id_masked ? `<img id="docimg" src="${esc(art.id_masked)}" alt="Uploaded ID with the Aadhaar number masked">` : `<div class="empty">No image stored.</div>`}
              ${Object.entries(r.field_boxes || {}).map(([k, b]) => boxHTML(b, k.replace("_", " "), false)).join("")}
              ${(r.suspicious_regions || []).map((s) => boxHTML(s.bbox, s.why, true)).join("")}
            </div>
          </section>

          <section class="panel">
            <h2>What we checked</h2>
            <div class="body">
              ${attention.length ? `<div class="group-title">Needs attention</div><ul class="findings">${attention.map(findingHTML).join("")}</ul>` : ""}
              ${bySev("pass").length ? `<div class="group-title">Passed</div><ul class="findings">${bySev("pass").map(findingHTML).join("")}</ul>` : ""}
              ${bySev("info").length ? `<details ${attention.length ? "" : "open"}><summary>Notes (${bySev("info").length})</summary><ul class="findings">${bySev("info").map(findingHTML).join("")}</ul></details>` : ""}
              ${bySev("skipped").length ? `<details><summary>Not checked (${bySev("skipped").length})</summary><ul class="findings">${bySev("skipped").map(findingHTML).join("")}</ul></details>` : ""}
            </div>
          </section>
        </div>

        <div class="stack">
          <section class="panel review">
            <h2>Your decision</h2>
            <div class="body">
              ${v.reviewed_at ? `<div class="reviewed"><b>${esc(LABEL[final])}</b> by ${esc(v.reviewed_by)} · ${esc(ago(v.reviewed_at))}
                ${v.review_note ? `<br><span class="muted">“${esc(v.review_note)}”</span>` : ""}
                ${overridden ? `<br><span class="muted">Automatic decision was ${esc(LABEL[v.decision])}.</span>` : ""}</div>` : ""}
              <label class="sr-only" for="note">Note</label>
              <textarea id="note" class="field" placeholder="Add a note for the audit log (optional)"></textarea>
              <div class="actions">
                <button class="btn ok" data-d="APPROVED">Approve</button>
                <button class="btn bad" data-d="REJECTED">Reject</button>
                <button class="btn fix" data-d="RESUBMIT">Ask to resubmit</button>
              </div>
            </div>
          </section>

          <section class="panel">
            <h2>Read from the document</h2>
            <div class="body">
              <table class="facts">
                ${fact("Name", ex.name, ex.field_confidence?.name, v.applicant.name && ex.name ? `form: ${v.applicant.name}` : "")}
                ${fact("Date of birth", ex.dob || (ex.year_of_birth ? `year ${ex.year_of_birth}` : null), ex.field_confidence?.dob)}
                ${r.dob_resolution?.sources ? fact("DOB confirmed by", prettySources(r.dob_resolution.sources)) : ""}
                ${fact("ID number", ex.id_number, ex.field_confidence?.id_number)}
                ${ex.institution ? fact("Institution", ex.institution, ex.field_confidence?.institution) : ""}
                ${ex.valid_till ? fact("Valid until", ex.valid_till) : ""}
                ${r.aadhaar_qr ? fact("Aadhaar QR", `${r.aadhaar_qr.name || "–"}, ${r.aadhaar_qr.dob || "–"}`, null,
                  r.aadhaar_qr.signature_verified ? "UIDAI signature valid" : r.aadhaar_qr.signature_verified === false ? "signature invalid" : "signature not checked") : ""}
                ${ex.legacy_pipeline_dob ? fact("Existing pipeline DOB", ex.legacy_pipeline_dob) : ""}
                ${r.eligibility ? fact("Age rule checked on", r.eligibility.event_date) : ""}
              </table>
            </div>
          </section>

          ${art.portrait || art.selfie ? `
          <section class="panel">
            <h2>Face check ${face && face.data?.similarity != null ? `<span class="big-number">${Math.round(face.data.similarity)}%</span>` : ""}</h2>
            <div class="body faces">
              <figure>${art.portrait ? `<img src="${esc(art.portrait)}" alt="Photo on the ID">` : `<img alt="">`}<figcaption>Photo on the ID</figcaption></figure>
              <figure>${art.selfie ? `<img src="${esc(art.selfie)}" alt="Selfie">` : `<img alt="">`}<figcaption>${art.selfie ? "Selfie" : "No selfie provided"}</figcaption></figure>
            </div>
          </section>` : ""}

          ${matches.length ? `
          <section class="panel">
            <h2>Also used by</h2>
            <div class="body"><ul class="matches">
              ${matches.map((m) => `<li><span><a href="#/v/${esc(m.verification_id)}">${esc(m.name || m.verification_id)}</a>
                <span class="muted">· ${esc(eventName(m.event_id))} · ${esc(m.via.replace(/_/g, " "))}</span></span>
                ${m.decision ? `<span class="chip ${esc(m.decision)}">${esc(LABEL[m.decision])}</span>` : ""}</li>`).join("")}
            </ul></div>
          </section>` : ""}
        </div>
      </div>
      <p class="timings">${esc(v.id)} · checked in ${r.timings_ms?.total ?? "–"} ms · OCR ${esc(r.providers?.ocr)} · face ${esc(r.providers?.face)} · AI ${esc(r.providers?.llm)} · pipeline ${esc(r.pipeline_version)}</p>`;

    // viewer controls
    const viewer = $("#viewer"), img = $("#docimg");
    $("#boxes").onchange = (e) => viewer.classList.toggle("plain", !e.target.checked);
    box.querySelectorAll(".seg button").forEach((b) => b.onclick = () => {
      box.querySelectorAll(".seg button").forEach((x) => x.setAttribute("aria-pressed", x === b));
      if (img) img.src = b.dataset.view === "ela" ? art.ela : art.id_masked;
    });
    box.querySelectorAll(".review .actions button").forEach((b) => b.onclick = async () => {
      b.disabled = true;
      try {
        await api(`/v1/verifications/${encodeURIComponent(id)}/review`, {
          method: "POST", headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision: b.dataset.d, note: $("#note").value, reviewer: reviewerName() }),
        });
        state.fresh = id; toast(`Marked as ${LABEL[b.dataset.d].toLowerCase()}`);
        renderQueue();
      } catch (e) { toast(`Couldn't save: ${e.message}`); b.disabled = false; }
    });
  }

  function reviewerName() {
    let n = "";
    try { n = localStorage.getItem("tg-reviewer") || ""; } catch (_) {}
    if (!n) {
      n = (prompt("Your name, for the audit log:") || "organizer").trim();
      try { localStorage.setItem("tg-reviewer", n); } catch (_) {}
    }
    return n;
  }
  const SOURCE = { ocr_label: "printed date", ocr_unlabelled: "printed date", textract_query: "Textract",
    existing_textract_pipeline: "existing Textract pipeline", llm_grounded: "AI reader (checked against text)",
    aadhaar_qr_secure: "Aadhaar QR", aadhaar_qr_secure_signed: "signed Aadhaar QR", aadhaar_qr_legacy_xml: "Aadhaar QR (old format)",
    "label:year_of_birth": "printed year of birth" };
  const prettySources = (s) => [...new Set(String(s).split("+").map((x) => SOURCE[x] || x.replace(/_/g, " ")))].join(", ");
  const eventName = (id) => (state.events.find((e) => e.id === id) || {}).name || id || "–";
  function boxHTML(b, label, sus) {
    if (!b) return "";
    return `<div class="box ${sus ? "sus" : ""}" style="left:${b.left * 100}%;top:${b.top * 100}%;width:${b.width * 100}%;height:${b.height * 100}%"><span>${esc(label)}</span></div>`;
  }
  function findingHTML(s) {
    return `<li><span class="dot ${esc(s.severity)}" aria-label="${esc(s.severity)}"></span>
      <div>${esc(s.reason)}<div class="check">${esc(s.category)} · ${esc(s.name.replace(/_/g, " "))}</div></div></li>`;
  }
  function fact(label, value, conf, note) {
    const m = conf != null ? `<span class="meter" title="read confidence ${pct(conf)}"><i style="width:${Math.round(conf * 100)}%"></i></span>` : "";
    return `<tr><th>${esc(label)}</th><td>${value ? esc(value) : `<span class="muted">not found</span>`}${m}
      ${note ? `<div class="muted">${esc(note)}</div>` : ""}</td></tr>`;
  }

  // ------------------------------------------------------------------ registration (participant view)
  function renderRegister() {
    const evOpts = state.events.map((e) => `<option value="${esc(e.id)}" ${e.id === eventSel.value ? "selected" : ""}>${esc(e.name)}</option>`).join("");
    app.innerHTML = `
      <div class="register">
        <section>
          <h1>Register for the event</h1>
          <p class="lede">We check your ID automatically so you can skip the queue on event day. It takes a few seconds.</p>
          <form class="form" id="reg" novalidate>
            <div class="field"><label for="ev">Event</label><select id="ev" name="event_id" required>${evOpts}</select></div>
            <div class="two">
              <div class="field"><label for="nm">Full name</label><input id="nm" name="name" required autocomplete="name"></div>
              <div class="field"><label for="em">Email</label><input id="em" name="email" type="email" autocomplete="email"></div>
            </div>
            <div class="two">
              <div class="field"><label for="ins">College or organisation</label><input id="ins" name="institution"></div>
              <div class="field"><label for="dob">Date of birth <span class="hint">(optional)</span></label><input id="dob" name="dob" type="date"></div>
            </div>
            <div class="field">
              <label for="idf">Photo of your ID</label>
              <div class="drop" id="drop">
                <img class="thumb" id="thumb" alt="">
                <div><strong>Choose a photo or drop it here</strong>
                  <span class="hint">Aadhaar, PAN, college ID, driving licence, voter ID or passport. Lay it flat, fill the frame, avoid glare.</span>
                  <div class="qc" id="qc" aria-live="polite"></div></div>
              </div>
              <input id="idf" type="file" accept="image/*" class="sr-only" required>
            </div>
            <div class="field">
              <label>Selfie <span class="hint">(needed for some events)</span></label>
              <div class="camera" id="cam">
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                  <button type="button" class="btn" id="camOn">Use camera</button>
                  <label class="btn" for="sf">Upload a selfie</label>
                  <input id="sf" type="file" accept="image/*" capture="user" class="sr-only">
                </div>
              </div>
            </div>
            <label class="consent"><input type="checkbox" id="consent" required>
              <span>I agree that my ID is used only to verify my identity and eligibility for this event. The ID number is stored masked and images are deleted after the event.</span></label>
            <div><button class="btn primary" id="submit" type="submit">Verify and register</button></div>
            <div id="result"></div>
          </form>
        </section>
        <aside class="aside">
          <h2>How to get approved first time</h2>
          <ol>
            <li>Use the physical card, not a screenshot or a photo of a screen.</li>
            <li>Make sure the name matches what you typed above.</li>
            <li>For Aadhaar, keep the QR code visible; we use it to confirm your details.</li>
            <li>Student-only events need your college ID.</li>
          </ol>
          <p class="hint" style="margin-top:20px">If something's unclear, an organizer checks it by hand. We never reject a registration because of a blurry photo.</p>
        </aside>
      </div>`;

    let idFile = null, selfieBlob = null;
    const drop = $("#drop"), idf = $("#idf"), qc = $("#qc");
    drop.onclick = () => idf.click();
    drop.ondragover = (e) => { e.preventDefault(); drop.classList.add("drag"); };
    drop.ondragleave = () => drop.classList.remove("drag");
    drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove("drag"); if (e.dataTransfer.files[0]) pick(e.dataTransfer.files[0]); };
    idf.onchange = () => idf.files[0] && pick(idf.files[0]);

    async function pick(file) {
      idFile = file;
      $("#thumb").src = URL.createObjectURL(file);
      qc.className = "qc"; qc.textContent = "Checking photo quality…";
      const local = await localBlur(file).catch(() => null);
      try {
        const fd = new FormData(); fd.append("image", file);
        const res = await api("/v1/quality-check", { method: "POST", body: fd });
        if (res.ok) { qc.className = "qc ok"; qc.textContent = "Photo looks good."; }
        else { qc.className = "qc bad"; qc.textContent = res.problems.join(" "); }
      } catch (e) {
        qc.className = local != null && local < 60 ? "qc bad" : "qc";
        qc.textContent = local != null && local < 60 ? "Photo looks blurry. Hold steady and retake." : "";
      }
    }

    // selfie via camera
    $("#camOn").onclick = async () => {
      const cam = $("#cam");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" } });
        const video = document.createElement("video");
        video.autoplay = true; video.playsInline = true; video.srcObject = stream;
        const snap = document.createElement("button");
        snap.type = "button"; snap.className = "btn"; snap.textContent = "Take selfie";
        cam.append(video, snap);
        snap.onclick = () => {
          const c = document.createElement("canvas");
          c.width = video.videoWidth; c.height = video.videoHeight;
          c.getContext("2d").drawImage(video, 0, 0);
          c.toBlob((b) => {
            selfieBlob = b; stream.getTracks().forEach((t) => t.stop());
            video.remove(); snap.remove(); showSelfie(URL.createObjectURL(b));
          }, "image/jpeg", 0.92);
        };
      } catch (e) { toast("Camera unavailable. Upload a selfie instead."); }
    };
    $("#sf").onchange = (e) => { const f = e.target.files[0]; if (f) { selfieBlob = f; showSelfie(URL.createObjectURL(f)); } };
    function showSelfie(url) {
      let im = $("#selfiePrev");
      if (!im) { im = document.createElement("img"); im.id = "selfiePrev"; im.alt = "Your selfie"; $("#cam").appendChild(im); }
      im.src = url;
    }

    $("#reg").onsubmit = async (e) => {
      e.preventDefault();
      const out = $("#result");
      if (!$("#nm").value.trim()) return toast("Enter your full name.");
      if (!idFile) return toast("Add a photo of your ID.");
      if (!$("#consent").checked) return toast("Tick the consent box to continue.");
      const btn = $("#submit");
      btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Checking your ID…`;
      const fd = new FormData();
      ["ev:event_id", "nm:name", "em:email", "ins:institution", "dob:dob"].forEach((p) => {
        const [id, key] = p.split(":"); fd.append(key, $("#" + id).value);
      });
      fd.append("consent", "true");
      fd.append("id_image", idFile);
      if (selfieBlob) fd.append("selfie", selfieBlob, "selfie.jpg");
      try {
        const r = await api("/v1/verify", { method: "POST", body: fd });
        const head = { APPROVED: "You're in", NEEDS_REVIEW: "Almost there", REJECTED: "Not eligible", RESUBMIT: "Let's try that again" }[r.decision];
        out.innerHTML = `<div class="result ${esc(r.decision)}"><h2>${esc(head)}</h2><p>${esc(r.participant_message)}</p>
          <p class="hint">Demo: <a href="#/v/${esc(r.verification_id)}">see what the organizer sees</a></p></div>`;
        state.fresh = r.verification_id;
      } catch (err) {
        out.innerHTML = `<div class="result REJECTED"><h2>Couldn't submit</h2><p>${esc(err.message)}</p></div>`;
      } finally { btn.disabled = false; btn.textContent = "Verify and register"; }
    };
  }

  // Laplacian variance on a ≤1000px grayscale copy (same scale as the server check)
  async function localBlur(file) {
    const bmp = await createImageBitmap(file);
    const s = Math.min(1, 1000 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * s), h = Math.round(bmp.height * s);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); ctx.drawImage(bmp, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h).data;
    const g = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) g[i] = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    let sum = 0, sq = 0, n = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = g[i - w] + g[i + w] + g[i - 1] + g[i + 1] - 4 * g[i];
      sum += v; sq += v * v; n++;
    }
    const m = sum / n; return sq / n - m * m;
  }

  // ------------------------------------------------------------------ metrics
  async function renderMetrics() {
    const q = eventSel.value ? `?event_id=${encodeURIComponent(eventSel.value)}` : "";
    const m = await api(`/v1/metrics${q}`);
    const colors = { APPROVED: "var(--ok)", NEEDS_REVIEW: "#e39a1d", REJECTED: "var(--bad)", RESUBMIT: "var(--fix)" };
    const total = m.total || 1;
    const ev = m.evaluation;
    app.innerHTML = `
      <div class="metrics">
        <h1>How verification is going</h1>
        <div class="figures">
          <div><b>${m.total}</b><span>registrations checked</span></div>
          <div><b>${pct(m.automation_rate)}</b><span>decided without a person</span></div>
          <div><b>${m.reviewed}</b><span>reviewed by organizers</span></div>
          <div><b>${m.overturned_auto_rejections}</b><span>automatic rejections overturned</span></div>
          <div><b>${m.latency_ms.p50 ?? "–"}<small style="font-size:1rem"> ms</small></b><span>median check time</span></div>
        </div>
        <section>
          <h2 style="font-size:var(--step-1);margin:0 0 10px">Automatic decisions</h2>
          <div class="dist" role="img" aria-label="Decision distribution">
            ${Object.entries(m.auto_decisions).map(([k, n]) => n ? `<div style="width:${(n / total) * 100}%;background:${colors[k]}" title="${LABEL[k]}: ${n}"></div>` : "").join("")}
          </div>
          <div class="legend">${Object.entries(m.auto_decisions).map(([k, n]) => `<span><i style="background:${colors[k]}"></i>${LABEL[k]} ${n}</span>`).join("")}</div>
        </section>
        <div class="grid-2">
          <section class="panel"><h2>Test set results</h2><div class="body">
            ${ev ? `<table class="table">
              ${row("Genuine participants auto-approved", ev.genuine_auto_approved, true)}
              ${row("Genuine participants wrongly rejected", ev["genuine_hard_rejected (false reject)"], false, true)}
              ${row("Fraudulent IDs stopped before approval", ev["fraud_caught (not auto-approved)"], true)}
              ${row("Fraud rejected without a human seeing it", ev.fraud_auto_rejected_without_human, false, true)}
              ${row("Underage applicants rejected", ev.ineligible_rejected, true)}
              ${row("Bad photos sent back for a retake", ev.fixable_sent_back, true)}
              ${row("Cases in test set", ev.cases)}
              ${row("Average check time", `${ev.avg_latency_ms} ms`)}
            </table>` : `<p class="muted">Run <code>python scripts/evaluate.py</code> to measure accuracy on the labelled test set.</p>`}
          </div></section>
          <section class="panel"><h2>Most common concerns</h2><div class="body">
            ${m.top_flags.length ? `<table class="table">${m.top_flags.map(([f, n]) => `<tr><td>${esc(f.replace(/_/g, " "))}</td><td style="text-align:right">${n}</td></tr>`).join("")}</table>`
              : `<p class="muted">No concerns raised yet.</p>`}
            ${Object.keys(m.review_outcomes).length ? `<h3 style="font-size:var(--step-0);margin:18px 0 6px">What reviewers decided on flagged cases</h3>
              <p>${Object.entries(m.review_outcomes).map(([k, n]) => `${LABEL[k]}: <b>${n}</b>`).join(" · ")}</p>` : ""}
          </div></section>
        </div>
      </div>`;
    function row(label, val, good, badIfNonZero) {
      const cls = badIfNonZero ? (String(val).startsWith("0") ? "ok-t" : "bad-t") : good ? "ok-t" : "";
      return `<tr><td>${esc(label)}</td><td class="${cls}" style="text-align:right">${esc(val)}</td></tr>`;
    }
  }

  window.addEventListener("hashchange", route);
  loadEvents().then(route).catch((e) => {
    app.innerHTML = `<div class="empty"><h2>Can't reach the TrustGate API</h2><p>${esc(e.message)}. Start it with <code>uvicorn app.api:app</code>.</p></div>`;
  });
})();
