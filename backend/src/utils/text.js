// 纯文本清洗：AI 大模型很爱输出 Markdown（**加粗**、## 标题、- 列表、`代码`），
// 但日报 / 月报是要直接复制到微信、邮件、OA 里的纯文本，符号必须去掉。
// 这里做两层防御：① 提示词里明确禁止 Markdown；② 落库 / 返回前统一清洗一遍。
function toPlain(input) {
  if (input === null || input === undefined) return ''
  let t = String(input).replace(/\r\n?/g, '\n')

  // 代码块围栏 ``` 与缩进代码
  t = t.replace(/```[a-zA-Z0-9+#-]*\n?/g, '')
  // 行内代码 `xx`
  t = t.replace(/`([^`\n]*)`/g, '$1')
  // 图片 ![alt](url) 直接去掉，链接 [文字](url) 只留文字
  t = t.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
  t = t.replace(/\[([^\]\n]+)\]\([^)]*\)/g, '$1')
  // 标题 ### / ## / #
  t = t.replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')
  // 分割线 --- / *** / ___
  t = t.replace(/^[ \t]{0,3}([-*_])[ \t]*\1[ \t]*\1[ \t]*$/gm, '')
  // 引用 >
  t = t.replace(/^[ \t]{0,3}>[ \t]?/gm, '')
  // 加粗 / 斜体 / 删除线（成对出现才处理，避免误伤单个 * 号）
  t = t.replace(/\*\*\*([^*\n]+)\*\*\*/g, '$1')
  t = t.replace(/\*\*([^*\n]+)\*\*/g, '$1')
  t = t.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1$2')
  t = t.replace(/___([^_\n]+)___/g, '$1')
  t = t.replace(/__([^_\n]+)__/g, '$1')
  t = t.replace(/~~([^~\n]+)~~/g, '$1')
  // 无序列表 - / * / +  →  中文习惯的「· 」
  t = t.replace(/^([ \t]*)[-*+][ \t]+/gm, (m, sp) => sp + '· ')
  // 表格分隔行 |---|---|
  t = t.replace(/^[ \t]*\|?[ \t]*:?-{2,}:?[ \t]*(\|[ \t]*:?-{2,}:?[ \t]*)*\|?[ \t]*$/gm, '')
  // 表格竖线：保留单元格间的分隔感，去掉首尾竖线
  t = t.replace(/^[ \t]*\|(.*)\|[ \t]*$/gm, (m, inner) => inner.split('|').map(s => s.trim()).join('　'))
  // 零宽字符 / 行尾空白
  t = t.replace(/\u200b/g, '')
  t = t.replace(/[ \t]+$/gm, '')
  // 连续空行压成一行
  t = t.replace(/\n{3,}/g, '\n\n')
  return t.trim()
}

module.exports = { toPlain }
