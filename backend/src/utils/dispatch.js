// 工单派发（接单池）
// 流程说明：
//   员工报障 / 手工投入「待接单池」 → 工单状态 pending（待接单）
//   → 给「应收到提醒的人」各生成一条待办 + SSE 实时推送，浏览器右下角弹出「有新工单」
//   → 谁先点「接取」谁处理（数据库原子更新，保证只有一个人接得走）
//   → 接单后状态变 processing，其余人的待办提醒自动关闭
const { query } = require('../db')
const { settingGet } = require('./seed')
const rt = require('./realtime')

// 服务台是可选角色：开了服务台由服务台派单，不开服务台就全员抢单
async function serviceDeskEnabled() {
  return (await settingGet('service_desk_enable')) === '1'
}

async function notifyUsers() {
  const desk = await serviceDeskEnabled()
  const rows = await query(
    "SELECT user_id, real_name, role FROM sys_user WHERE is_enable = 1 AND role <> 'auditor'"
  )
  const list = desk ? rows.filter(u => u.role === 'service' || u.role === 'admin') : rows
  return { desk, list }
}

function todayStr() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function shortText(s) {
  const t = String(s || '').split('\n')[0].trim()
  return t.length > 40 ? t.slice(0, 40) + '…' : (t || '新报障工单')
}

// 工单进入待接单池：生成待办 + 实时提醒
async function dispatchTicket(t) {
  const { desk, list } = await notifyUsers()
  const ids = list.map(u => u.user_id)
  if (!ids.length) return { notified: 0, desk }

  const title = ((desk ? '待派单：' : '待接单：') + shortText(t.service_content)).slice(0, 200)
  const detail = [
    t.contact ? `报障人：${t.contact}` : '',
    t.dept ? `部门：${t.dept}` : '',
    t.app_system ? `系统：${t.app_system}` : ''
  ].filter(Boolean).join('　') || '（点击查看工单详情）'
  const today = todayStr()

  // 一条 SQL 批量插入，避免运维人数多时循环几百次
  const rows = ids.map(() => '(?,?,?,?,?,?)').join(',')
  const params = []
  for (const uid of ids) params.push(uid, title, detail, today, 'ticket', t.ticket_id)
  await query(
    `INSERT INTO todo (user_id, todo_title, todo_detail, plan_date, source, ticket_id) VALUES ${rows}`,
    params
  )

  // 实时推送到在线的运维浏览器（右下角弹出接单提示）
  rt.send(ids, 'ticket:new', {
    ticket_id: t.ticket_id,
    report_no: t.report_no || '',
    service_content: t.service_content || '',
    contact: t.contact || '',
    dept: t.dept || '',
    app_system: t.app_system || '',
    problem_type: t.problem_type || '',
    priority: t.priority || 'normal',
    happen_time: t.happen_time || '',
    mode: desk ? 'desk' : 'pool'
  })
  return { notified: ids.length, desk }
}

// 被接单 / 已派单 / 已完成 → 关掉所有人关于这条工单的待办提醒
async function closeTicketTodos(ticketId) {
  await query('UPDATE todo SET is_finish = 1 WHERE ticket_id = ? AND is_finish = 0', [ticketId])
}

module.exports = { dispatchTicket, closeTicketTodos, serviceDeskEnabled, notifyUsers }
