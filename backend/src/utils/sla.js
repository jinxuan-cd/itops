// SLA 时效计算：根据问题类别 + 优先级匹配策略，算出应响应 / 应解决时间
const { query } = require('../db')

const DEFAULT_POLICY = { respond_hours: 4, resolve_hours: 24 }

// 取全部策略（量很小，直接全量缓存式读取）
async function loadPolicies() {
  return query('SELECT * FROM sla_policy ORDER BY policy_id')
}

// 匹配优先级：类别+优先级 精确 > 类别任意 > 默认类别+优先级 > 默认任意
function pickPolicy(policies, problemType, priority) {
  const p = priority || 'normal'
  const hit = (pt, pr) => policies.find(x =>
    (x.problem_type || '*') === pt && ((x.priority || null) === pr)
  )
  return hit(problemType, p) || hit(problemType, null) || hit('*', p) || hit('*', null) || DEFAULT_POLICY
}

function addHours(dtStr, hours) {
  if (!dtStr) return null
  const d = new Date(String(dtStr).replace(' ', 'T'))
  if (isNaN(d.getTime())) return null
  d.setMinutes(d.getMinutes() + Math.round(Number(hours) * 60))
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

// 给工单算出两个截止时间（创建 / 修改问题类别时调用）
async function computeDue(happenTime, problemType, priority) {
  const policies = await loadPolicies()
  const pol = pickPolicy(policies, problemType, priority)
  return {
    sla_respond_due: addHours(happenTime, pol.respond_hours),
    sla_resolve_due: addHours(happenTime, pol.resolve_hours)
  }
}

// 本机时区的当前时间字符串（容器已设 TZ=Asia/Shanghai）
// 注意：不能用 toISOString()，那是 UTC，会比北京时间慢 8 小时，
// 导致「已超期 0~8 小时」的工单仍显示未超期（与 remain_hours 自相矛盾）
function localNow() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

// 单条工单的 SLA 状态（列表 / 详情展示用）
//   respond_state: ok / overdue / pending
//   resolve_state: ok / overdue / pending
//   state: 汇总（overdue 优先）
function slaStateOf(row, nowStr) {
  const now = nowStr || localNow()
  const done = row.status === 'done'
  const out = { respond_state: 'pending', resolve_state: 'pending', state: 'normal', remain_hours: null }

  if (row.sla_respond_due) {
    if (row.respond_time) out.respond_state = String(row.respond_time) <= String(row.sla_respond_due) ? 'ok' : 'overdue'
    else out.respond_state = String(now) > String(row.sla_respond_due) ? 'overdue' : 'pending'
  }
  if (row.sla_resolve_due) {
    if (done && row.finish_time) out.resolve_state = String(row.finish_time) <= String(row.sla_resolve_due) ? 'ok' : 'overdue'
    else out.resolve_state = String(now) > String(row.sla_resolve_due) ? 'overdue' : 'pending'
    if (!done) {
      const ms = new Date(String(row.sla_resolve_due).replace(' ', 'T')).getTime() - Date.now()
      out.remain_hours = Math.round(ms / 3600000 * 10) / 10
    }
  }
  if (out.respond_state === 'overdue' || out.resolve_state === 'overdue') out.state = 'overdue'
  else if (done) out.state = 'ok'
  return out
}

// 给单条工单回填 SLA 截止时间（创建 / 修改类别 / 导入后调用）
async function applySla(ticketId) {
  const rows = await query('SELECT happen_time, problem_type, priority FROM ticket WHERE ticket_id = ?', [ticketId])
  if (!rows.length) return
  const t = rows[0]
  if (!t.happen_time) return
  const due = await computeDue(t.happen_time, t.problem_type, t.priority)
  await query(
    'UPDATE ticket SET sla_respond_due = ?, sla_resolve_due = ? WHERE ticket_id = ?',
    [due.sla_respond_due, due.sla_resolve_due, ticketId]
  )
}

// 批量回填（迁移时给历史工单补 SLA 截止时间）
// 分批循环，避免一次 LIMIT 5000 之后剩下的工单永远补不上
async function backfillSla() {
  let total = 0
  for (;;) {
    const rows = await query(
      'SELECT ticket_id, happen_time, problem_type, priority FROM ticket WHERE happen_time IS NOT NULL AND sla_resolve_due IS NULL LIMIT 5000'
    )
    if (!rows.length) break
    const policies = await loadPolicies()
    for (const t of rows) {
      const pol = pickPolicy(policies, t.problem_type, t.priority)
      await query(
        'UPDATE ticket SET sla_respond_due = ?, sla_resolve_due = ? WHERE ticket_id = ?',
        [addHours(t.happen_time, pol.respond_hours), addHours(t.happen_time, pol.resolve_hours), t.ticket_id]
      )
    }
    total += rows.length
    if (rows.length < 5000) break
  }
  return total
}

module.exports = { loadPolicies, pickPolicy, computeDue, slaStateOf, addHours, applySla, backfillSla, localNow, DEFAULT_POLICY }
