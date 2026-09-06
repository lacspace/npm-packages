/**
 * The live web inspector: a self-contained, zero-dependency dashboard served
 * by the receiver on a reserved path, streaming captured requests over
 * Server-Sent Events (SSE). Think a local, offline webhook.site.
 */
import type { CapturedRequest } from "./capture.js";
import type { VerifyResult } from "./verify.js";

/** The reserved path prefix the inspector is mounted under. */
export const UI_PREFIX = "/__inspector";
export const UI_PAGE = UI_PREFIX;
export const UI_EVENTS = `${UI_PREFIX}/events`;

/** The payload broadcast to the dashboard for each captured request. */
export interface UiEvent {
  record: CapturedRequest;
  verify?: VerifyResult;
  response?: { status: number };
}

/** Format one SSE frame (`event:`/`data:` + blank line). Data is JSON. */
export function sseFrame(event: string, data: unknown): string {
  const json = JSON.stringify(data);
  // A data field may not contain raw newlines; JSON.stringify already escapes them.
  return `event: ${event}\ndata: ${json}\n\n`;
}

/**
 * The full inspector page as a single HTML string (no external assets). Live
 * events arrive over SSE at {@link UI_EVENTS}; the page also fetches nothing else.
 */
export function inspectorHtml(meta: { port: number; path?: string; verify?: string }): string {
  const info = JSON.stringify({ port: meta.port, path: meta.path ?? "", verify: meta.verify ?? "" });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>lacspace-webhook · live inspector</title>
<style>
  :root {
    --bg:#0e1116; --panel:#161b22; --panel2:#1c232c; --line:#2a3139; --ink:#e6edf3;
    --dim:#8b98a5; --accent:#a371f7; --green:#3fb950; --red:#f85149; --cyan:#39c5cf;
    --yellow:#d29922; --blue:#58a6ff;
  }
  * { box-sizing:border-box; }
  body { margin:0; font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
    background:var(--bg); color:var(--ink); height:100vh; display:flex; flex-direction:column; }
  header { display:flex; align-items:center; gap:12px; padding:10px 16px; border-bottom:1px solid var(--line);
    background:linear-gradient(90deg,#161b22,#12161c); }
  header .logo { font-weight:700; color:var(--accent); letter-spacing:.2px; }
  header .meta { color:var(--dim); font-size:12px; }
  header .status { margin-left:auto; display:flex; align-items:center; gap:8px; font-size:12px; color:var(--dim); }
  .dot { width:9px; height:9px; border-radius:50%; background:var(--red); box-shadow:0 0 8px var(--red); }
  .dot.live { background:var(--green); box-shadow:0 0 8px var(--green); }
  button { font:inherit; color:var(--ink); background:var(--panel2); border:1px solid var(--line);
    border-radius:6px; padding:4px 10px; cursor:pointer; }
  button:hover { border-color:var(--accent); }
  main { flex:1; display:flex; min-height:0; }
  .list { width:44%; max-width:560px; border-right:1px solid var(--line); overflow:auto; }
  .empty { padding:40px 20px; color:var(--dim); text-align:center; }
  .row { padding:10px 14px; border-bottom:1px solid var(--line); cursor:pointer; display:flex; gap:10px; align-items:baseline; }
  .row:hover { background:var(--panel); }
  .row.sel { background:var(--panel2); border-left:3px solid var(--accent); padding-left:11px; }
  .method { font-weight:700; font-size:12px; min-width:52px; }
  .m-GET{color:var(--green)} .m-POST{color:var(--cyan)} .m-PUT,.m-PATCH{color:var(--yellow)}
  .m-DELETE{color:var(--red)} .m-OTHER{color:var(--accent)}
  .rpath { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .rmeta { color:var(--dim); font-size:11px; white-space:nowrap; }
  .badge { font-size:10px; padding:1px 6px; border-radius:10px; border:1px solid var(--line); }
  .badge.ok { color:var(--green); border-color:var(--green); }
  .badge.bad { color:var(--red); border-color:var(--red); }
  .detail { flex:1; overflow:auto; padding:18px 22px; }
  .detail h2 { margin:0 0 4px; font-size:16px; }
  .detail .sub { color:var(--dim); font-size:12px; margin-bottom:16px; }
  .section { margin:18px 0; }
  .section h3 { font-size:11px; text-transform:uppercase; letter-spacing:1px; color:var(--dim);
    margin:0 0 8px; border-bottom:1px solid var(--line); padding-bottom:6px; }
  table.kv { width:100%; border-collapse:collapse; }
  table.kv td { padding:3px 8px 3px 0; vertical-align:top; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
  table.kv td.k { color:var(--cyan); white-space:nowrap; width:1%; }
  pre { background:var(--panel); border:1px solid var(--line); border-radius:8px; padding:12px;
    overflow:auto; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12.5px; margin:0; }
  .pill { display:inline-block; font-size:11px; padding:2px 8px; border-radius:12px; background:var(--panel2);
    border:1px solid var(--line); color:var(--dim); margin-right:6px; }
  .verify.ok { color:var(--green); } .verify.bad { color:var(--red); }
  .tok-key{color:var(--cyan)} .tok-str{color:var(--green)} .tok-num{color:var(--yellow)}
  .tok-bool{color:var(--blue)} .tok-null{color:var(--dim)}
</style>
</head>
<body>
<header>
  <span class="logo">◆ lacspace-webhook</span>
  <span class="meta" id="meta"></span>
  <div class="status">
    <span id="count">0 captured</span>
    <button id="clear">Clear</button>
    <span class="dot" id="dot"></span><span id="conn">connecting…</span>
  </div>
</header>
<main>
  <div class="list" id="list"><div class="empty" id="empty">Waiting for the first webhook…<br/><br/>
    Point a webhook or <code>curl</code> at this server.</div></div>
  <div class="detail" id="detail"><div class="empty">Select a request to inspect it.</div></div>
</main>
<script>
  const INFO = ${info};
  document.getElementById('meta').textContent =
    'localhost:' + INFO.port + (INFO.path ? ' · path ' + INFO.path : '') + (INFO.verify ? ' · verify ' + INFO.verify : '');
  const items = [];
  let selected = null;
  const listEl = document.getElementById('list');
  const emptyEl = document.getElementById('empty');
  const detailEl = document.getElementById('detail');
  const countEl = document.getElementById('count');

  function esc(s){ return String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  function methodClass(m){ return ['GET','POST','PUT','PATCH','DELETE'].includes(m) ? 'm-'+m : 'm-OTHER'; }

  function highlight(obj){
    const json = JSON.stringify(obj, null, 2);
    return esc(json)
      .replace(/&quot;([^&]+?)&quot;(\\s*:)/g, '<span class="tok-key">&quot;$1&quot;</span>$2')
      .replace(/: &quot;([^&]*?)&quot;/g, ': <span class="tok-str">&quot;$1&quot;</span>')
      .replace(/: (-?\\d+\\.?\\d*)/g, ': <span class="tok-num">$1</span>')
      .replace(/: (true|false)/g, ': <span class="tok-bool">$1</span>')
      .replace(/: (null)/g, ': <span class="tok-null">$1</span>');
  }

  function prettyBody(rec){
    if(!rec.body) return '<span class="pill">empty body</span>';
    const ct = (rec.contentType||'').toLowerCase();
    const t = rec.body.trim();
    if(ct.includes('json') || t.startsWith('{') || t.startsWith('[')){
      try { return '<pre>'+highlight(JSON.parse(rec.body))+'</pre>'; } catch(e){}
    }
    if(ct.includes('x-www-form-urlencoded')){
      const rows=[...new URLSearchParams(rec.body)].map(([k,v])=>'<tr><td class="k">'+esc(k)+'</td><td>'+esc(v)+'</td></tr>').join('');
      return '<table class="kv">'+rows+'</table>';
    }
    return '<pre>'+esc(rec.body)+'</pre>';
  }

  function render(){
    countEl.textContent = items.length + ' captured';
    if(items.length===0){ listEl.innerHTML=''; listEl.appendChild(emptyEl); detailEl.innerHTML='<div class="empty">Select a request to inspect it.</div>'; return; }
    listEl.innerHTML = items.map((ev,i)=>{
      const r=ev.record; const v=ev.verify;
      const badge = v ? (v.ok?'<span class="badge ok">✔ sig</span>':'<span class="badge bad">✗ sig</span>') : '';
      const time = new Date(r.at).toLocaleTimeString();
      return '<div class="row '+(i===selected?'sel':'')+'" data-i="'+i+'">'+
        '<span class="method '+methodClass(r.method)+'">'+esc(r.method)+'</span>'+
        '<span class="rpath">'+esc(r.path)+'</span>'+
        badge+'<span class="rmeta">'+time+'</span></div>';
    }).join('');
    [...listEl.querySelectorAll('.row')].forEach(el=>el.onclick=()=>{ selected=+el.dataset.i; render(); });
    if(selected!==null && items[selected]) renderDetail(items[selected]);
  }

  function renderDetail(ev){
    const r=ev.record, v=ev.verify;
    const headers=Object.entries(r.headers).map(([k,val])=>'<tr><td class="k">'+esc(k)+'</td><td>'+esc(Array.isArray(val)?val.join(', '):val)+'</td></tr>').join('');
    const query=Object.keys(r.query||{}).length? '<div class="section"><h3>Query</h3><table class="kv">'+
      Object.entries(r.query).map(([k,val])=>'<tr><td class="k">'+esc(k)+'</td><td>'+esc(Array.isArray(val)?val.join(', '):val)+'</td></tr>').join('')+'</table></div>':'';
    const verify=v? '<div class="section"><h3>Signature</h3><div class="verify '+(v.ok?'ok':'bad')+'">'+
      (v.ok?'✔ verified':'✗ failed — '+esc(v.reason||'invalid'))+(v.scheme?' <span class="pill">'+esc(v.scheme)+'</span>':'')+'</div></div>':'';
    const resp=ev.response? '<span class="pill">responded '+ev.response.status+'</span>':'';
    detailEl.innerHTML =
      '<h2><span class="method '+methodClass(r.method)+'">'+esc(r.method)+'</span> '+esc(r.path)+'</h2>'+
      '<div class="sub">'+esc(new Date(r.at).toLocaleString())+' · '+r.bytes+' bytes '+resp+'</div>'+
      verify+query+
      '<div class="section"><h3>Headers</h3><table class="kv">'+headers+'</table></div>'+
      '<div class="section"><h3>Body</h3>'+prettyBody(r)+'</div>';
  }

  document.getElementById('clear').onclick=()=>{ items.length=0; selected=null; render(); };

  const dot=document.getElementById('dot'), conn=document.getElementById('conn');
  const es=new EventSource('${UI_EVENTS}');
  es.onopen=()=>{ dot.classList.add('live'); conn.textContent='live'; };
  es.onerror=()=>{ dot.classList.remove('live'); conn.textContent='reconnecting…'; };
  es.addEventListener('capture', e=>{
    const ev=JSON.parse(e.data); items.unshift(ev);
    if(selected!==null) selected++;
    render();
  });
</script>
</body>
</html>`;
}
