/**
 * 管理后台页面路由
 */

import { Hono } from 'hono'
import { getAllComments } from '../lib/db'

type Bindings = {
  DB: D1Database
  ADMIN_TOKEN: string
}

const app = new Hono<{ Bindings: Bindings }>()

// 校验 Token
const checkAuth = (c: any) => {
  const token =
    c.req.query('token') ||
    c.req.header('Authorization')?.replace('Bearer ', '')
  return token === c.env.ADMIN_TOKEN
}

/**
 * GET /admin/api/comments
 * 获取评论列表
 */
app.get('/api/comments', async c => {
  if (!checkAuth(c)) {
    return c.json({ error: 'Unauthorized' }, 401)
  }

  try {
    const comments = await getAllComments(c.env.DB)
    return c.json(comments)
  } catch (error) {
    console.error('Admin API error:', error)
    return c.json({ error: 'Internal Server Error' }, 500)
  }
})

/**
 * GET /admin
 * 管理后台 HTML 页面
 */
app.get('/', async c => {
  if (!checkAuth(c)) {
    return c.html(
      '<h1>Unauthorized</h1><p>Please provide a valid token.</p>',
      401
    )
  }

  const token = c.req.query('token')

  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Hitalk Admin</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        body { font-family: sans-serif; padding: 20px; background: #f4f4f9; color: #333; }
        .container { max-width: 1000px; margin: 0 auto; background: #fff; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        h1 { margin-top: 0; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #fafafa; }
        .btn { padding: 6px 12px; border-radius: 4px; border: none; cursor: pointer; font-size: 14px; transition: opacity 0.2s; }
        .btn:hover { opacity: 0.8; }
        .btn-pin { background: #3090e4; color: #fff; margin-right: 5px; }
        .btn-unpin { background: #666; color: #fff; margin-right: 5px; }
        .btn-delete { background: #eb5055; color: #fff; }
        .vpin { font-size: 10px; background: #ff6b6b; color: #fff; padding: 2px 4px; border-radius: 3px; margin-left: 5px; }
        .nick { font-weight: bold; }
        .content { font-size: 14px; color: #666; max-width: 400px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .path { font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <h1>Hitalk Management</h1>
        <div id="status">Loading...</div>
        <table id="comment-table" style="display:none;">
            <thead>
                <tr>
                    <th>User</th>
                    <th>Content</th>
                    <th>Page</th>
                    <th>Date</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody id="comment-list"></tbody>
        </table>
    </div>

    <script>
        const token = '${token}';
        const statusEl = document.getElementById('status');
        const tableEl = document.getElementById('comment-table');
        const listEl = document.getElementById('comment-list');

        async function fetchComments() {
            try {
                const res = await fetch('/admin/api/comments?token=' + token);
                if (!res.ok) throw new Error('Failed to fetch');
                const comments = await res.json();
                renderComments(comments);
            } catch (err) {
                statusEl.textContent = 'Error: ' + err.message;
            }
        }

        function renderComments(comments) {
            statusEl.style.display = 'none';
            tableEl.style.display = 'table';
            listEl.innerHTML = '';

            comments.forEach(c => {
                const tr = document.createElement('tr');
                tr.innerHTML = \`
                    <td>
                        <div class="nick">\${escapeHtml(c.nick)}\${c.is_pinned ? '<span class="vpin">PIN</span>' : ''}</div>
                        <div style="font-size:12px; color:#999">\${escapeHtml(c.email || '')}</div>
                    </td>
                    <td><div class="content" title="\${escapeHtml(c.content_md)}">\${escapeHtml(c.content_md)}</div></td>
                    <td><div class="path">\${escapeHtml(c.page_path)}</div></td>
                    <td><div style="font-size:12px">\${new Date(c.created_at).toLocaleString()}</div></td>
                    <td>
                        <button class="btn \${c.is_pinned ? 'btn-unpin' : 'btn-pin'}" onclick="togglePin('\${c.id}', \${c.is_pinned})">
                            \${c.is_pinned ? 'Unpin' : 'Pin'}
                        </button>
                        <button class="btn btn-delete" onclick="deleteComment('\${c.id}')">Delete</button>
                    </td>
                \`;
                listEl.appendChild(tr);
            });
        }

        async function togglePin(id, currentPinned) {
            try {
                const res = await fetch('/comments/' + id + '/pin', {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ is_pinned: !currentPinned })
                });
                if (res.ok) fetchComments();
                else alert('Operation failed');
            } catch (err) {
                alert(err.message);
            }
        }

        async function deleteComment(id) {
            if (!confirm('Are you sure?')) return;
            try {
                const res = await fetch('/comments/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (res.ok) fetchComments();
                else alert('Delete failed');
            } catch (err) {
                alert(err.message);
            }
        }

        function escapeHtml(str) {
            if (!str) return '';
            const div = document.createElement('div');
            div.textContent = str;
            return div.innerHTML;
        }

        fetchComments();
    </script>
</body>
</html>
  `
  return c.html(html)
})

export default app
