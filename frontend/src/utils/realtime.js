// 前端实时消息（SSE）：全局只建一条连接，收到事件后以 window 事件 'itops:rt' 分发给各组件
// 用法：window.addEventListener('itops:rt', e => { const { type, payload } = e.detail })
// 断线由浏览器 EventSource 自动重连，不需要自己写重试逻辑

let es = null
let started = false

const EVENTS = ['ticket:new', 'ticket:taken', 'ticket:released', 'ticket:mine', 'ticket:done']

function emit(type, payload) {
  window.dispatchEvent(new CustomEvent('itops:rt', { detail: { type, payload } }))
}

export function startRealtime() {
  const token = localStorage.getItem('itops_token')
  if (!token || started) return
  started = true
  try {
    es = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`)
  } catch (e) {
    started = false
    return
  }
  for (const name of EVENTS) {
    es.addEventListener(name, (e) => {
      let data = null
      try { data = JSON.parse(e.data) } catch (err) { data = null }
      emit(name, data)
    })
  }
  es.onopen = () => emit('connected', null)
}

export function stopRealtime() {
  if (es) { es.close(); es = null }
  started = false
}
