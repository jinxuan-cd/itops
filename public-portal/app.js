/* ==========================================================================
   IT 报障服务台（员工自助门户）前端逻辑
   --------------------------------------------------------------------------
   · 只调用 /api/public/*（公网进程白名单内接口），不涉及任何管理接口
   · 不使用框架、不使用 CDN、不写 Cookie，弱网/老旧手机也能正常使用
   · 所有插入页面的文本都经过 esc() 转义，避免知识库内容里带 HTML 被解释
   ========================================================================== */
(function () {
  'use strict'

  var KEY = new URLSearchParams(location.search).get('k') || ''
  var API = '/api/public'
  var LAST_NO = 'itops_last_report_no'

  var state = {
    tab: 'report',
    priority: 'normal',
    reportKey: KEY,
    options: { dept: [], app_system: [], problem_type: [] },
    current: null,
    score: 0
  }

  // ---------------- 工具 ----------------
  function $(sel, root) { return (root || document).querySelector(sel) }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)) }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  var toastTimer = null
  function toast(msg, isErr) {
    var el = $('#toast')
    el.textContent = msg
    el.className = 'toast' + (isErr ? ' err' : '')
    el.hidden = false
    clearTimeout(toastTimer)
    toastTimer = setTimeout(function () { el.hidden = true }, 3200)
  }

  function request(path, opt) {
    opt = opt || {}
    var cfg = { method: opt.method || 'GET', headers: {} }
    if (opt.body) {
      cfg.headers['Content-Type'] = 'application/json'
      cfg.body = JSON.stringify(opt.body)
    }
    return fetch(API + path, cfg)
      .then(function (r) {
        return r.json().catch(function () { return { code: 1, message: '服务返回异常（HTTP ' + r.status + '）' } })
      })
      .then(function (j) {
        if (j.code !== 0) throw new Error(j.message || '请求失败')
        return j
      })
  }

  function statusText(s) {
    return s === 'done' ? '已完成' : s === 'pending' ? '待接单' : '处理中'
  }
  function statusClass(s) {
    return s === 'done' ? 'done' : s === 'pending' ? 'pending' : 'processing'
  }

  // ---------------- Tab 切换 ----------------
  function switchTab(name) {
    state.tab = name
    $$('#tabs .tab').forEach(function (b) {
      b.classList.toggle('on', b.dataset.tab === name)
    })
    $$('.panel').forEach(function (p) {
      p.hidden = p.dataset.panel !== name
    })
    if (name === 'faq' && !$('#faqList').dataset.loaded) loadFaq('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // ---------------- 初始化 ----------------
  function boot() {
    request('/config?k=' + encodeURIComponent(KEY))
      .then(function (j) {
        var c = j.data || {}
        $('#loading').hidden = true

        // 入口密钥不对：明确告知，避免员工反复重试
        if (c.has_key && !c.key_ok) {
          showBlocked('报障入口校验失败', '请重新扫描二维码，或联系 IT 获取新的入口链接。')
          return
        }
        if (!c.report_enable && !c.faq_enable) {
          showBlocked('自助服务暂未开放', '请联系 IT 同事直接报障。')
          return
        }

        $('#tabs').hidden = false
        // 关掉某个入口时隐藏对应 Tab
        if (!c.report_enable) {
          $('[data-tab="report"]').hidden = true
          $('[data-tab="track"]').hidden = true
        }
        if (!c.faq_enable) $('[data-tab="faq"]').hidden = true

        if (c.report_enable) {
          loadOptions()
          var last = localStorage.getItem(LAST_NO)
          if (last) $('#tNo').value = last
          // 二维码可能指向 /faq?k=xxx，此时直接打开常见问题
          switchTab(/^\/faq/.test(location.pathname) && c.faq_enable ? 'faq' : 'report')
        } else {
          switchTab('faq')
        }
      })
      .catch(function (e) {
        $('#loading').hidden = true
        showBlocked('暂时无法连接服务', e.message || '请稍后重试。')
      })
  }

  function showBlocked(title, desc) {
    $('#blocked').hidden = false
    $('#blockedTitle').textContent = title
    $('#blockedDesc').textContent = desc
  }

  function loadOptions() {
    request('/options')
      .then(function (j) {
        var o = j.data || {}
        state.options = {
          dept: o.dept || [],
          app_system: o.app_system || [],
          problem_type: o.problem_type || []
        }
        fillSelect($('#fDept'), state.options.dept, '请选择（可留空）')
        fillSelect($('#fSystem'), state.options.app_system, '不确定可不选')
      })
      .catch(function () { /* 选项拉取失败不阻塞报障，员工仍可手填描述 */ })
  }

  function fillSelect(sel, list, placeholder) {
    var html = '<option value="">' + esc(placeholder) + '</option>'
    list.forEach(function (v) { html += '<option value="' + esc(v) + '">' + esc(v) + '</option>' })
    sel.innerHTML = html
  }

  // ---------------- 报障 ----------------
  function bindReport() {
    var content = $('#fContent')
    content.addEventListener('input', function () {
      $('#cnt').textContent = content.value.length
    })

    $('#priRow').addEventListener('click', function (e) {
      var b = e.target.closest('.pri-item')
      if (!b) return
      state.priority = b.dataset.p
      $$('#priRow .pri-item').forEach(function (x) { x.classList.toggle('on', x === b) })
    })

    $('#reportForm').addEventListener('submit', function (e) {
      e.preventDefault()
      var contact = $('#fContact').value.trim()
      var text = content.value.trim()
      if (!contact) { toast('请填写您的姓名', true); $('#fContact').focus(); return }
      if (text.length < 4) { toast('请简单描述遇到的问题', true); content.focus(); return }

      var btn = $('#btnSubmit')
      btn.disabled = true
      btn.textContent = '提交中…'

      request('/report', {
        method: 'POST',
        body: {
          k: state.reportKey,
          contact: contact,
          dept: $('#fDept').value || '',
          phone: $('#fPhone').value.trim(),
          app_system: $('#fSystem').value || '',
          priority: state.priority,
          content: text
        }
      })
        .then(function (j) {
          var no = (j.data && j.data.report_no) || ''
          try { localStorage.setItem(LAST_NO, no) } catch (err) {}
          $('#doneNo').textContent = no
          $('#reportForm').hidden = true
          $('#reportDone').hidden = false
          $('#tNo').value = no
          window.scrollTo({ top: 0, behavior: 'smooth' })
        })
        .catch(function (err) { toast(err.message, true) })
        .then(function () {
          btn.disabled = false
          btn.textContent = '提交报障'
        })
    })

    $('#btnGoTrack').addEventListener('click', function () {
      $('#tNo').value = $('#doneNo').textContent
      $('#tPhone').value = ($('#fPhone').value || '').replace(/\D/g, '').slice(-4)
      switchTab('track')
      doTrack()
    })

    $('#btnAgain').addEventListener('click', function () {
      $('#reportDone').hidden = true
      $('#reportForm').hidden = false
      content.value = ''
      $('#cnt').textContent = '0'
      $('#fPhone').value = ''
      $('#fSystem').value = ''
      state.priority = 'normal'
      $$('#priRow .pri-item').forEach(function (x) { x.classList.toggle('on', x.dataset.p === 'normal') })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    })
  }

  // ---------------- 查进度 ----------------
  function bindTrack() {
    $('#trackForm').addEventListener('submit', function (e) {
      e.preventDefault()
      doTrack()
    })

    $('#stars').addEventListener('click', function (e) {
      var b = e.target.closest('button')
      if (!b) return
      state.score = Number(b.dataset.s)
      paintStars(state.score)
    })

    $('#btnRate').addEventListener('click', function () {
      if (!state.current) return
      if (!state.score) { toast('请先选择评分', true); return }
      var btn = $('#btnRate')
      btn.disabled = true
      request('/satisfy', {
        method: 'POST',
        body: {
          report_no: state.current.report_no,
          phone: $('#tPhone').value.trim(),
          score: state.score,
          comment: $('#rateComment').value.trim()
        }
      })
        .then(function () {
          toast('感谢您的评价！')
          doTrack()
        })
        .catch(function (err) { toast(err.message, true) })
        .then(function () { btn.disabled = false })
    })
  }

  function paintStars(n) {
    $$('#stars button').forEach(function (b) {
      b.classList.toggle('on', Number(b.dataset.s) <= n)
    })
    var texts = ['', '很不满意', '不满意', '一般', '满意', '非常满意']
    $('#rateText').textContent = n ? texts[n] : '请选择评分'
  }

  function doTrack() {
    var no = $('#tNo').value.trim()
    if (!no) { toast('请填写报障单号', true); return }
    var btn = $('#btnTrack')
    btn.disabled = true
    request('/track', { method: 'POST', body: { report_no: no, phone: $('#tPhone').value.trim() } })
      .then(function (j) {
        var d = j.data || {}
        state.current = d
        try { localStorage.setItem(LAST_NO, d.report_no || no) } catch (err) {}

        $('#trackResult').hidden = false
        var tag = $('#rStatus')
        tag.textContent = statusText(d.status)
        tag.className = 'tag ' + statusClass(d.status)
        $('#rNo').textContent = d.report_no || ''
        $('#rContent').textContent = d.service_content || '—'
        $('#rSystem').textContent = d.app_system || '—'
        $('#rHappen').textContent = d.happen_time || '—'

        if (d.finish_time) {
          $('#rFinishLine').hidden = false
          $('#rFinish').textContent = d.finish_time
        } else {
          $('#rFinishLine').hidden = true
        }

        if (d.result) {
          $('#rResultBox').hidden = false
          $('#rResult').textContent = d.result
        } else {
          $('#rResultBox').hidden = true
        }

        if (d.can_satisfy) {
          state.score = 0
          paintStars(0)
          $('#rateComment').value = ''
          $('#rateBox').hidden = false
          $('#ratedBox').hidden = true
        } else {
          $('#rateBox').hidden = true
          if (d.satisfy_score) {
            $('#ratedBox').hidden = false
            $('#ratedStars').textContent = '★★★★★'.slice(0, d.satisfy_score) + '☆☆☆☆☆'.slice(0, 5 - d.satisfy_score)
          } else {
            $('#ratedBox').hidden = true
          }
        }
      })
      .catch(function (err) {
        $('#trackResult').hidden = true
        toast(err.message, true)
      })
      .then(function () { btn.disabled = false })
  }

  // ---------------- 常见问题 ----------------
  function bindFaq() {
    $('#btnFaqSearch').addEventListener('click', function () {
      loadFaq($('#faqKw').value.trim())
    })
    $('#faqKw').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); loadFaq(this.value.trim()) }
    })
    $('#faqList').addEventListener('click', function (e) {
      var item = e.target.closest('.faq-item')
      if (!item) return
      toggleFaq(item)
    })
  }

  function loadFaq(kw) {
    var box = $('#faqList')
    box.innerHTML = '<div class="empty">正在加载…</div>'
    request('/faq?k=' + encodeURIComponent(KEY) + (kw ? '&keyword=' + encodeURIComponent(kw) : ''))
      .then(function (j) {
        var d = j.data || {}
        box.dataset.loaded = '1'
        if (d.need_key) {
          box.innerHTML = '<div class="empty">请通过二维码或内部链接访问本页面</div>'
          return
        }
        if (!d.enable) {
          box.innerHTML = '<div class="empty">常见问题暂未开放</div>'
          return
        }
        var list = d.list || []
        $('#faqHint').textContent = list.length
          ? '共 ' + list.length + ' 条，点击展开解决方案'
          : (kw ? '没有找到相关问题，可换个关键词试试' : '暂无已公开的常见问题')
        if (!list.length) {
          box.innerHTML = '<div class="empty">' + (kw ? '没有找到相关问题' : '暂无内容') + '</div>'
          return
        }
        box.innerHTML = list.map(function (f) {
          var meta = [f.app_system, f.problem_type].filter(Boolean).join(' · ')
          return '' +
            '<div class="faq-item" data-id="' + esc(f.kb_id) + '">' +
              '<div class="faq-q"><span>' + esc(f.problem_summary || '（无标题）') + '</span>' +
                '<svg class="arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
                  '<path d="m6 9 6 6 6-6" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
              '</div>' +
              (meta ? '<div class="faq-meta">' + esc(meta) + '</div>' : '') +
              '<div class="faq-a" hidden></div>' +
            '</div>'
        }).join('')
      })
      .catch(function (err) {
        box.innerHTML = '<div class="empty">加载失败：' + esc(err.message) + '</div>'
      })
  }

  function toggleFaq(item) {
    var ans = $('.faq-a', item)
    if (!ans) return
    if (item.classList.contains('open')) {
      item.classList.remove('open')
      ans.hidden = true
      return
    }
    if (ans.dataset.loaded) {
      item.classList.add('open')
      ans.hidden = false
      return
    }
    ans.hidden = false
    ans.textContent = '正在加载…'
    request('/faq/' + encodeURIComponent(item.dataset.id) + '?k=' + encodeURIComponent(KEY))
      .then(function (j) {
        var d = j.data || {}
        ans.textContent = d.solution || '该问题暂未填写解决方案'
        ans.dataset.loaded = '1'
        item.classList.add('open')
      })
      .catch(function (err) {
        ans.textContent = '加载失败：' + err.message
      })
  }

  // ---------------- 启动 ----------------
  $$('#tabs .tab').forEach(function (b) {
    b.addEventListener('click', function () { switchTab(b.dataset.tab) })
  })
  bindReport()
  bindTrack()
  bindFaq()
  boot()
})()
