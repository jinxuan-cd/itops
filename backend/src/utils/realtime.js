// 实时事件推送（SSE）
// 场景：员工报障后，所有运维的浏览器右下角立刻弹出「有新工单」；某人接单后其他人同步消失
//
// 两进程部署时（管理进程 + 公网自助进程）浏览器只连管理进程，而员工报障发生在公网进程。
// 因此公网进程发出的每个事件都会**转发**给管理进程，再由管理进程推给浏览器；
// 转发配置见环境变量 REALTIME_RELAY_URL / REALTIME_RELAY_SECRET（仅公网容器设置），
// 管理进程没有配置转发，所以不会形成回环。

const clients = new Set()
let seq = 1

const RELAY_URL = process.env.REALTIME_RELAY_URL || ''
const RELAY_SECRET = process.env.REALTIME_RELAY_SECRET || ''

// 把事件转交给管理进程（失败不影响主流程，前端还有轮询兜底）
function relay(userIds, event, data) {
  if (!RELAY_URL) return
  fetch(RELAY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Token': RELAY_SECRET },
    body: JSON.stringify({ userIds: userIds || null, event, data }),
    signal: AbortSignal.timeout(3000)
  }).catch(() => { /* 管理进程暂时不可用，忽略 */ })
}

// 建立一个 SSE 连接（token 由调用方校验好）
function subscribe(req, res, user) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    // 关掉 nginx 缓冲，否则事件会被攒着一起发，前端就不是「实时」了
    'X-Accel-Buffering': 'no'
  })
  res.write(': connected\n\n')

  const client = { id: seq++, userId: Number(user.user_id), role: user.role, res }
  clients.add(client)

  // 心跳：25 秒一次，防止中间代理把空闲连接掐掉
  const ping = setInterval(() => {
    try { res.write(': ping\n\n') } catch (e) { /* 连接已断，交给 close 处理 */ }
  }, 25000)

  const cleanup = () => {
    clearInterval(ping)
    clients.delete(client)
  }
  req.on('close', cleanup)
  req.on('aborted', cleanup)
  return client
}

function writeTo(client, event, data) {
  try {
    client.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
  } catch (e) {
    clients.delete(client)
  }
}

// userIds 为 null/undefined 时广播给所有在线用户
function send(userIds, event, data) {
  const ids = userIds ? new Set(userIds.map(Number)) : null
  let n = 0
  for (const c of [...clients]) {
    if (ids && !ids.has(c.userId)) continue
    writeTo(c, event, data)
    n++
  }
  // 公网进程：本进程没有浏览器连接，额外转发给管理进程
  relay(userIds, event, data)
  return n
}

// 只推给本进程的在线客户端（供 /api/realtime/publish 转发入口调用，避免二次转发）
function localSend(userIds, event, data) {
  const ids = userIds ? new Set(userIds.map(Number)) : null
  let n = 0
  for (const c of [...clients]) {
    if (ids && !ids.has(c.userId)) continue
    writeTo(c, event, data)
    n++
  }
  return n
}

function broadcast(event, data) { return send(null, event, data) }
function count() { return clients.size }

module.exports = { subscribe, send, localSend, broadcast, count }
