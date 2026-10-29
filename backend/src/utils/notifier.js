// 消息通知：向企业微信 / 钉钉 / 飞书 群机器人推送纯文本或 Markdown 消息
// 说明：三类机器人都接收 HTTP POST + JSON，只是字段名不同，这里统一适配
const { query } = require('../db')

const CHANNEL_LABEL = { wecom: '企业微信', dingtalk: '钉钉', feishu: '飞书', webhook: '自定义' }

function buildBody(cfg, title, content) {
  const text = `${title}\n\n${content}`
  if (cfg.channel === 'wecom') return { msgtype: 'markdown', markdown: { content: text } }
  if (cfg.channel === 'dingtalk') return { msgtype: 'markdown', markdown: { title, text } }
  if (cfg.channel === 'feishu') return { msg_type: 'text', content: { text } }
  return { text, title, content }
}

// 发送到单条配置，返回 { ok, message }
async function sendOne(cfg, title, content) {
  if (!cfg || !cfg.webhook) return { ok: false, message: '未配置 Webhook' }
  try {
    const res = await fetch(cfg.webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildBody(cfg, title, content)),
      signal: AbortSignal.timeout(8000)
    })
    const t = await res.text()
    // 三类机器人成功都会返回 errcode:0 / code:0 / StatusCode:0
    const okCode = /"errcode"\s*:\s*0|"code"\s*:\s*0|"StatusCode"\s*:\s*0/.test(t)
    return { ok: res.ok && (okCode || t === '' || /ok/i.test(t)), message: t.slice(0, 200) }
  } catch (e) {
    return { ok: false, message: e.message }
  }
}

// 向所有启用的通知配置广播（可选按事件过滤）
async function broadcast(event, title, content, onlyUserId = null) {
  const rows = onlyUserId
    ? await query('SELECT * FROM notify_config WHERE is_enable = 1 AND user_id = ?', [onlyUserId])
    : await query('SELECT * FROM notify_config WHERE is_enable = 1')
  const list = rows.filter(r => String(r.events || '').split(',').map(s => s.trim()).includes(event))
  const results = []
  for (const cfg of list) {
    results.push({ channel: cfg.channel, ...(await sendOne(cfg, title, content)) })
  }
  return results
}

// 发一条测试消息
async function sendTest(cfg) {
  return sendOne(cfg, '【IT 运维系统】通知测试',
    `这是一条测试消息，收到说明配置成功。\n\n渠道：${CHANNEL_LABEL[cfg.channel] || cfg.channel}\n时间：${new Date().toLocaleString('zh-CN')}`)
}

module.exports = { broadcast, sendTest, sendOne, CHANNEL_LABEL }
