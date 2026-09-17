export const adminPage = String.raw`<!doctype html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Hitalk 管理</title>
<style>
body{font:15px system-ui;padding:24px;background:#f4f4f9;color:#333}main{max-width:1000px;margin:auto;background:white;padding:24px;border-radius:8px}table{width:100%;border-collapse:collapse}td,th{padding:12px;text-align:left;border-bottom:1px solid #ddd}button,input{font:inherit;padding:8px;margin:4px}td p{max-width:350px;white-space:pre-wrap;overflow-wrap:anywhere}#status{min-height:24px}small{display:block;color:#666}nav{margin-top:16px}@media(max-width:600px){body{padding:4px}main{padding:8px}td,th{padding:5px}}
</style></head><body><main><h1>Hitalk 管理</h1>
<form id="login"><label>管理员令牌 <input id="token" type="password" autocomplete="off" required></label><button>登录</button></form>
<div id="status" role="status"></div>
<div id="panel" hidden><button id="logout">退出</button><table><thead><tr><th>用户</th><th>内容</th><th>页面</th><th>操作</th></tr></thead><tbody id="list"></tbody></table>
<nav><button id="previous">上一页</button><span id="page"></span><button id="next">下一页</button></nav></div>
<script>
const login = document.getElementById('login');
const panel = document.getElementById('panel');
const statusEl = document.getElementById('status');
const list = document.getElementById('list');
let token = '', page = 1;
// Credentials belong in headers; keep the address bar free of query parameters.
if (location.search) history.replaceState(null, '', location.pathname);
async function request(path, options = {}) {
  const response = await fetch(path, {...options, headers: {...options.headers, Authorization: 'Bearer ' + token}});
  const body = await response.json();
  if (!response.ok) throw new Error(body.message || '操作失败');
  return body;
}
function text(tag, value) { const el = document.createElement(tag); el.textContent = value || ''; return el; }
async function load() {
  statusEl.textContent = '加载中…';
  try {
    const result = await request('/admin/api/comments?page=' + page);
    list.replaceChildren();
    for (const comment of result.comments) {
      const row = document.createElement('tr');
      const user = document.createElement('td');
      user.append(text('strong', comment.nick), text('small', comment.email));
      const content = document.createElement('td');
      const body = text('p', comment.content_md); body.title = comment.content_md;
      content.append(body, text('small', new Date(comment.created_at).toLocaleString()));
      const actions = document.createElement('td');
      for (const kind of ['pin', 'delete']) {
        const button = text('button', kind === 'delete' ? '删除' : comment.is_pinned ? '取消置顶' : '置顶');
        button.onclick = async () => {
          if (kind === 'delete' && !confirm('删除这条评论及其全部回复？')) return;
          button.disabled = true;
          try {
            await request('/comments/' + encodeURIComponent(comment.id) + (kind === 'pin' ? '/pin' : ''), {
              method: kind === 'pin' ? 'PUT' : 'DELETE',
              headers: {'Content-Type': 'application/json'},
              ...(kind === 'pin' ? {body: JSON.stringify({is_pinned: !comment.is_pinned})} : {})
            });
            await load();
          } catch (error) { statusEl.textContent = error.message; button.disabled = false; }
        };
        actions.append(button);
      }
      row.append(user, content, text('td', comment.page_path), actions); list.append(row);
    }
    panel.hidden = false; login.hidden = true; statusEl.textContent = '';
    document.getElementById('page').textContent = '第 ' + page + ' 页';
    document.getElementById('previous').disabled = page === 1;
    document.getElementById('next').disabled = !result.has_more;
  } catch (error) { statusEl.textContent = error.message; }
}
login.onsubmit = event => {event.preventDefault(); token = document.getElementById('token').value; document.getElementById('token').value = ''; page = 1; load();};
document.getElementById('logout').onclick = () => {token = ''; list.replaceChildren(); panel.hidden = true; login.hidden = false; statusEl.textContent = '';};
document.getElementById('previous').onclick = () => {page--; load();};
document.getElementById('next').onclick = () => {page++; load();};
</script></main></body></html>`
