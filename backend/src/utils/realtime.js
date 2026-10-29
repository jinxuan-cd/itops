// 实时事件推送（SSE）
// 场景：员工报障后，所有运维的浏览器右下角立刻弹出「有新工单」；某人接单后其他人同步消失
// 单后端容器部署，事件在内存里分发即可；断线由浏览器 EventSource 自动重连

const clients = new Set()
let seq = 1

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
  return n
}

function broadcast(event, data) { return send(null, event, data) }
function count() { return clients.size }

module.exports = { subscribe, send, broadcast, count }
