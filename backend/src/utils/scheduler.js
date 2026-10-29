// 定时提醒：每天固定时间向企业微信/钉钉/飞书群推送
//  09:00 超期未闭环工单 + 今日待办
//  18:00 今日工单小结 + 未填日报提醒
// 用 10 分钟轮询 + 当天去重，避免依赖外部 cron
const { query } = require('../db')
const { broadcast } = require('./notifier')

const sent = new Set() // key: 'YYYY-MM-DD-event'

function today() {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
function hhmm() {
  const d = new Date(); const p = n => String(n).padStart(2, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}`
}
function markOnce(key) {
  if (sent.has(key)) return false
  sent.add(key)
  return true
}

async function overdueTask() {
  const rows = await query(
    `SELECT COUNT(*) AS total,
            SUM(sla_resolve_due IS NOT NULL AND sla_resolve_due < NOW()) AS sla_over,
            SUM(happen_time < DATE_SUB(NOW(), INTERVAL 24 HOUR)) AS over24
     FROM ticket WHERE status <> 'done'`
  )
  const r = rows[0] || {}
  const total = Number(r.total || 0)
  if (!total) return
  await query('SELECT 1')
  broadcast('overdue', '【今日运维待跟进】',
    `未闭环工单：**${total}** 单\n其中超 24 小时：**${Number(r.over24 || 0)}** 单\n超出 SLA 时限：**${Number(r.sla_over || 0)}** 单\n\n请及时在系统「工单记录管理」中处理。`
  ).catch(() => {})
}

async function eveningTask() {
  const d = today()
  const t = await query(
    `SELECT COUNT(*) AS total, SUM(status='done') AS done FROM ticket WHERE DATE(happen_time) = CURDATE()`
  )
  const rep = await query('SELECT COUNT(*) AS cnt FROM daily_report WHERE report_date = ?', [d])
  const r = t[0] || {}
  broadcast('report', '【今日运维小结】',
    `今日受理：**${Number(r.total || 0)}** 单，已完成：**${Number(r.done || 0)}** 单\n日报已提交：**${Number((rep[0] && rep[0].cnt) || 0)}** 人\n\n下班前记得在系统里生成今日日报。`
  ).catch(() => {})
}

function startScheduler() {
  const tick = async () => {
    const now = hhmm()
    const d = today()
    try {
      if (now === '09:00' && markOnce(d + '-am')) await overdueTask()
      if (now === '18:00' && markOnce(d + '-pm')) await eveningTask()
    } catch (e) {
      console.error('[scheduler]', e.message)
    }
  }
  // 每分钟检查一次（精度足够，开销极小）
  setInterval(tick, 60 * 1000).unref()
  console.log('[scheduler] 定时提醒已启动（09:00 待跟进 / 18:00 今日小结）')
}

module.exports = { startScheduler, overdueTask, eveningTask }
