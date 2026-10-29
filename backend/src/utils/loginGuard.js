// 登录防护：连续失败计数 → 强制验证码 → 锁定
// 说明：计数保存在内存（Map），进程重启即清零；单实例内网部署足够，
//       多实例部署请改用 Redis 或数据库表。
const CAPTCHA_AFTER = 3          // 连续失败达到 N 次后必须输入验证码
const LOCK_AFTER = 5             // 连续失败达到 N 次后锁定账号
const LOCK_MS = 5 * 60 * 1000    // 锁定时长：5 分钟
const CAPTCHA_TTL = 5 * 60 * 1000 // 验证码有效期：5 分钟

const fails = new Map()     // username(小写) -> { count, lockUntil }
const captchas = new Map()  // captcha_id -> { code, expire }

function norm(username) {
  return String(username || '').trim().toLowerCase()
}

// 当前状态：是否锁定 / 是否需要验证码 / 剩余可尝试次数
function status(username) {
  const key = norm(username)
  const rec = fails.get(key)
  const now = Date.now()
  if (!rec) return { count: 0, locked: false, lockRemain: 0, needCaptcha: false, remain: LOCK_AFTER }
  if (rec.lockUntil && rec.lockUntil > now) {
    return {
      count: rec.count,
      locked: true,
      lockRemain: Math.ceil((rec.lockUntil - now) / 1000),
      needCaptcha: true,
      remain: 0
    }
  }
  // 锁定期已过：清掉锁定标记，但仍要求验证码
  if (rec.lockUntil && rec.lockUntil <= now) rec.lockUntil = 0
  return {
    count: rec.count,
    locked: false,
    lockRemain: 0,
    needCaptcha: rec.count >= CAPTCHA_AFTER,
    remain: Math.max(0, LOCK_AFTER - rec.count)
  }
}

// 记录一次失败，返回最新状态（含是否刚刚被锁定）
function onFail(username) {
  const key = norm(username)
  const now = Date.now()
  const rec = fails.get(key) || { count: 0, lockUntil: 0 }
  if (rec.lockUntil && rec.lockUntil <= now) rec.lockUntil = 0
  rec.count += 1
  let justLocked = false
  if (rec.count >= LOCK_AFTER) {
    rec.lockUntil = now + LOCK_MS
    rec.count = CAPTCHA_AFTER // 解锁后仍需验证码
    justLocked = true
  }
  fails.set(key, rec)
  return { ...status(username), justLocked }
}

// 登录成功：清零
function onSuccess(username) {
  fails.delete(norm(username))
}

// ---------- 验证码 ----------
const CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ' // 去掉易混淆的 0/O/1/I

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }

function makeCode(len = 4) {
  let s = ''
  for (let i = 0; i < len; i++) s += CHARS[rand(0, CHARS.length - 1)]
  return s
}

function svgOf(code) {
  const w = 110, h = 38
  let body = ''
  // 干扰线
  for (let i = 0; i < 4; i++) {
    const c = `hsl(${rand(190, 265)},55%,${rand(55, 75)}%)`
    body += `<line x1="${rand(0, w)}" y1="${rand(0, h)}" x2="${rand(0, w)}" y2="${rand(0, h)}" stroke="${c}" stroke-width="1.2" />`
  }
  // 干扰点
  for (let i = 0; i < 26; i++) {
    const c = `hsl(${rand(190, 265)},45%,${rand(45, 72)}%)`
    body += `<circle cx="${rand(0, w)}" cy="${rand(0, h)}" r="${rand(1, 2)}" fill="${c}" />`
  }
  // 字符
  for (let i = 0; i < code.length; i++) {
    const x = 14 + i * 23 + rand(-3, 3)
    const y = 27 + rand(-3, 3)
    const rot = rand(-28, 28)
    const c = `hsl(${rand(205, 250)},${rand(50, 70)}%,${rand(28, 42)}%)`
    body += `<text x="${x}" y="${y}" font-family="Verdana,Arial,sans-serif" font-size="${rand(20, 24)}" font-weight="700" fill="${c}" transform="rotate(${rot} ${x} ${y})">${code[i]}</text>`
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#eef2f9"/>${body}</svg>`
}

// 生成验证码：返回 id + 可直接给 <img src> 的 data URL
function createCaptcha() {
  const code = makeCode(4)
  const id = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
  captchas.set(id, { code, expire: Date.now() + CAPTCHA_TTL })
  const svg = svgOf(code)
  return { captcha_id: id, image: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}` }
}

// 校验并一次性消费（校验后立即失效，防重放）
function verifyCaptcha(id, input) {
  if (!id || !input) return false
  const rec = captchas.get(String(id))
  captchas.delete(String(id))
  if (!rec) return false
  if (rec.expire < Date.now()) return false
  return String(input).trim().toUpperCase() === rec.code
}

// 定期清理过期数据，避免内存膨胀
const timer = setInterval(() => {
  const now = Date.now()
  for (const [k, v] of captchas) if (v.expire < now) captchas.delete(k)
  for (const [k, v] of fails) {
    if (v.count > 0 && (!v.lockUntil || v.lockUntil < now - 30 * 60 * 1000)) fails.delete(k)
  }
}, 10 * 60 * 1000)
if (timer.unref) timer.unref()

module.exports = {
  CAPTCHA_AFTER,
  LOCK_AFTER,
  LOCK_MS,
  status,
  onFail,
  onSuccess,
  createCaptcha,
  verifyCaptcha
}
