export const adminPage = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#f5f8f5">
<title>Hitalk · 评论管理</title>
<script>
const adminThemeMedia = window.matchMedia?.('(prefers-color-scheme: dark)');
let adminThemePreference = null;
try {
  const stored = localStorage.getItem('hitalk-admin-theme');
  if (stored === 'light' || stored === 'dark') adminThemePreference = stored;
} catch {}
function applyAdminTheme(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]').content = theme === 'dark' ? '#15171c' : '#f5f8f5';
  const toggle = document.getElementById('theme-toggle');
  if (toggle) {
    toggle.textContent = theme === 'dark' ? '浅色模式' : '深色模式';
    toggle.setAttribute('aria-label', theme === 'dark' ? '切换到浅色模式' : '切换到深色模式');
  }
}
applyAdminTheme(adminThemePreference || (adminThemeMedia?.matches ? 'dark' : 'light'));
</script>
<style>
:root {
  color-scheme: light;
  --bg: #f5f8f5;
  --surface: #fff;
  --text: #263d33;
  --muted: #62746a;
  --accent: #367353;
  --tint: #e8f0e9;
  --border: #dfe7e1;
  --danger: #a33b50;
}
* { box-sizing: border-box; }
[hidden] { display: none !important; }
body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.6 -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', sans-serif; }
main { width: min(1200px, calc(100% - 64px)); margin: 48px auto; }
.page-header { display: flex; align-items: center; flex-wrap: wrap; gap: 20px; padding-bottom: 24px; border-bottom: 1px solid var(--border); }
#theme-toggle { margin-left: auto; font-size: 12px; }
.brand { color: var(--accent); font-size: 24px; font-weight: 700; letter-spacing: -.04em; }
h1 { margin: 0; font-size: 20px; font-weight: 600; }
h2 { margin: 0; font-size: 15px; font-weight: 600; }
p { margin: 8px 0; }
button, input, select { font: inherit; }
button { min-height: 38px; padding: 7px 14px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); cursor: pointer; transition: background-color 180ms, border-color 180ms; }
button:hover:not(:disabled) { background: var(--tint); border-color: var(--accent); }
button:disabled { opacity: .55; cursor: wait; }
button.primary { background: var(--accent); border-color: var(--accent); color: var(--surface); }
button.primary:hover:not(:disabled) { background: var(--text); }
button.danger { color: var(--danger); }
button.danger:hover:not(:disabled) { border-color: var(--danger); }
button:focus-visible { outline: 1px solid var(--accent); outline-offset: 2px; }
input:focus-visible, select:focus-visible { outline: 1px solid var(--accent); outline-offset: -1px; border-color: var(--accent); }
input, select { min-width: 0; min-height: 42px; padding: 9px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); color: var(--text); }
input::placeholder { color: var(--muted); opacity: 1; }
label { display: flex; flex-direction: column; gap: 6px; color: var(--muted); font-size: 12px; }
#login { display: flex; flex-direction: column; gap: 20px; width: min(100%, 440px); margin: 56px auto; padding: 28px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); }
#login p { margin: 0; color: var(--muted); }
#status:empty { display: none; }
#status { margin: 20px 0; padding: 12px 16px; background: var(--surface); border-left: 3px solid var(--accent); overflow-wrap: anywhere; }
.panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin: 24px 0 16px; }
#filters { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px 8px 0 0; }
.path-field { flex: 1 1 240px; }
.page-actions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 0 0 12px; border-left: 1px solid var(--border); }
.table-wrap { overflow-x: auto; background: var(--surface); border: 1px solid var(--border); border-top: 0; border-radius: 0 0 8px 8px; }
table { width: 100%; border-collapse: collapse; table-layout: fixed; }
th, td { padding: 16px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
th { color: var(--muted); background: var(--bg); font-size: 12px; font-weight: 500; }
th:nth-child(1) { width: 14%; }
th:nth-child(2) { width: 36%; }
th:nth-child(3) { width: 20%; }
th:nth-child(4) { width: 30%; }
tr:last-child td { border-bottom: 0; }
td { overflow-wrap: anywhere; }
td p { margin: 0; white-space: pre-wrap; }
.author-cell { font-weight: 600; }
.page-path { display: block; margin-bottom: 8px; font: 12px/1.7 ui-monospace, SFMono-Regular, Consolas, monospace; color: var(--muted); }
.status-badge { display: inline-block; padding: 2px 7px; border: 1px solid var(--border); border-radius: 4px; color: var(--muted); font-size: 11px; }
.status-badge[data-status="published"] { background: var(--tint); color: var(--accent); }
.status-badge[data-status="spam"] { color: var(--danger); }
.action-buttons { display: flex; flex-wrap: wrap; gap: 6px; }
.action-buttons button { min-height: 32px; padding: 4px 9px; font-size: 12px; }
#empty { padding: 40px 16px; text-align: center; color: var(--muted); }
nav { display: flex; justify-content: center; margin-top: 20px; }
.notification-section { margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--border); }
#jobs:empty { display: none; }
#jobs { max-height: 420px; overflow: auto; padding: 16px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); font: 12px/1.8 ui-monospace, SFMono-Regular, Consolas, monospace; }
@media (max-width: 760px) {
  main { width: calc(100% - 32px); margin-block: 24px; }
  .page-header { gap: 16px; }
  #login { margin-block: 32px; padding: 24px; }
  #filters { padding: 16px; }
  .page-actions { flex-basis: 100%; padding: 12px 0 0; border-left: 0; border-top: 1px solid var(--border); }
  input, select { font-size: 16px; }
  table, tbody, tr, td { display: block; width: 100%; }
  thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  tr { padding: 12px 16px; border-bottom: 1px solid var(--border); }
  tr:last-child { border-bottom: 0; }
  td { display: grid; grid-template-columns: 64px minmax(0, 1fr); gap: 8px; padding: 8px 0; border: 0; }
  td::before { content: attr(data-label); color: var(--muted); font-size: 12px; font-weight: 400; }
}
:root[data-theme="dark"] {
  color-scheme: dark; --bg: #15171c; --surface: #1d2027; --text: #e4e7ee; --muted: #a5adbc; --accent: #a6b9e7; --tint: #2b3346; --border: #363c49; --danger: #efadc2;
}
@media (prefers-reduced-motion: reduce) { * { transition: none !important; } }
</style>
</head>
<body><main>
<header class="page-header"><span class="brand">Hitalk.</span><h1>评论管理</h1><button id="theme-toggle" type="button" aria-label="切换到深色模式">深色模式</button></header>
<form id="login">
  <div><h2>登录管理后台</h2><p>查看、审核和管理站点的评论。</p></div>
  <label>管理令牌<input id="token" type="password" autocomplete="off" placeholder="输入管理令牌" required></label>
  <button class="primary">登录</button>
</form>
<p id="status" role="status" aria-live="polite"></p>
<div id="panel" hidden>
  <div class="panel-heading"><h2>评论列表</h2><button id="logout">退出</button></div>
  <form id="filters">
    <label class="path-field">页面路径<input id="path" placeholder="全部页面，或输入 /article"></label>
    <label>审核状态<select id="filter-status"><option value="">全部状态</option><option value="pending">待审核</option><option value="published">已公开</option><option value="hidden">隐藏</option><option value="spam">垃圾</option></select></label>
    <button class="primary">筛选</button>
    <div class="page-actions"><button id="close-page" type="button">关闭此页面评论</button><button id="open-page" type="button">开放此页面评论</button></div>
  </form>
  <div class="table-wrap"><table aria-label="评论列表"><thead><tr><th scope="col">作者</th><th scope="col">内容</th><th scope="col">页面 / 状态</th><th scope="col">操作</th></tr></thead><tbody id="list"></tbody></table><p id="empty" hidden>暂无符合筛选条件的评论。</p></div>
  <nav aria-label="评论分页"><button id="more">加载更多</button></nav>
  <section class="notification-section" aria-label="邮件通知任务"><button id="notifications">通知任务</button><pre id="jobs"></pre></section>
</div>
</main><script>
applyAdminTheme(document.documentElement.dataset.theme);
document.getElementById('theme-toggle').onclick = () => {
  adminThemePreference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyAdminTheme(adminThemePreference);
  try { localStorage.setItem('hitalk-admin-theme', adminThemePreference); } catch {}
};
adminThemeMedia?.addEventListener('change', event => {
  if (!adminThemePreference) applyAdminTheme(event.matches ? 'dark' : 'light');
});
let token='',next=null,generation=0;
const $=id=>document.getElementById(id),statusEl=$('status'),list=$('list');
const text=(tag,value)=>{const el=document.createElement(tag);el.textContent=value;return el};
async function request(path,options={}){const response=await fetch('/api/admin'+path,{...options,headers:{'Content-Type':'application/json',Authorization:'Bearer '+token}});const body=await response.json();if(!response.ok)throw new Error(body.message||'请求失败');return body}
async function load(more=false){const version=++generation;statusEl.textContent='加载中…';try{const query=new URLSearchParams({path:$('path').value,status:$('filter-status').value});if(more&&next)query.set('before',next);const result=await request('/comments?'+query);if(version!==generation)return;if(!more)list.replaceChildren();for(const c of result.comments){const tr=document.createElement('tr');const author=text('td',c.nick||'已删除');author.className='author-cell';author.dataset.label='作者';tr.append(author);const content=document.createElement('td');content.dataset.label='内容';content.append(text('p',c.content_md||'评论已删除'));const page=document.createElement('td');page.dataset.label='页面 / 状态';const pageInfo=document.createElement('div');const path=text('span',c.page_path);path.className='page-path';const badge=text('span',({pending:'待审核',published:'已公开',hidden:'隐藏',spam:'垃圾'})[c.moderation_status]||c.moderation_status);badge.className='status-badge';badge.dataset.status=c.moderation_status;pageInfo.append(path,badge);page.append(pageInfo);tr.append(content,page);const actions=document.createElement('td');actions.dataset.label='操作';const buttons=document.createElement('div');buttons.className='action-buttons';actions.append(buttons);const action=(label,run)=>{const b=text('button',label);b.type='button';if(['删除内容','封禁身份'].includes(label))b.className='danger';b.onclick=async()=>{b.disabled=true;try{await run();await load()}catch(e){statusEl.textContent=e.message;b.disabled=false}};buttons.append(b)};if(!c.deleted_at){for(const [value,label] of [['published','通过'],['hidden','隐藏'],['spam','垃圾']])action(label,()=>request('/comments/'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({status:value})}));if(!c.root_id)action(c.is_pinned?'取消置顶':'置顶',()=>request('/comments/'+encodeURIComponent(c.id),{method:'PATCH',body:JSON.stringify({is_pinned:!c.is_pinned})}));action('删除内容',async()=>{if(confirm('删除此条内容并保留其他人的回复？'))await request('/comments/'+encodeURIComponent(c.id),{method:'DELETE'})})}if(c.author_id!=='site-owner')action(c.author_status==='blocked'?'解封身份':'封禁身份',()=>request('/identities/'+encodeURIComponent(c.author_id),{method:'PATCH',body:JSON.stringify({status:c.author_status==='blocked'?'active':'blocked'})}));tr.append(actions);list.append(tr)}$('empty').hidden=list.children.length>0;next=result.next;$('more').hidden=!next;$('panel').hidden=false;$('login').hidden=true;statusEl.textContent=''}catch(e){if(version===generation)statusEl.textContent=e.message}}
$('login').onsubmit=e=>{e.preventDefault();token=$('token').value;$('token').value='';void load()};
$('logout').onclick=()=>{generation++;token='';list.replaceChildren();$('jobs').textContent='';$('panel').hidden=true;$('login').hidden=false;statusEl.textContent=''};
$('filters').onsubmit=e=>{e.preventDefault();void load()};$('more').onclick=()=>load(true);
async function setPage(enabled){try{await request('/pages',{method:'PATCH',body:JSON.stringify({path:$('path').value,comments_enabled:enabled})});statusEl.textContent=enabled?'页面评论已开放':'页面评论已关闭'}catch(e){statusEl.textContent=e.message}}
$('close-page').onclick=()=>setPage(false);$('open-page').onclick=()=>setPage(true);
$('notifications').onclick=async()=>{const version=generation;try{const result=await request('/notifications');if(version===generation)$('jobs').textContent=JSON.stringify(result.jobs,null,2)}catch(e){if(version===generation)statusEl.textContent=e.message}};
</script></body></html>`
