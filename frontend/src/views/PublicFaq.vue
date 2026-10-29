<template>
  <div class="pub-page">
    <div class="pub-head">
      <div class="logo">IT</div>
      <div>
        <h1>常见问题自助查询</h1>
        <p>先查一查，很多问题可以自己解决</p>
      </div>
    </div>

    <div class="pub-card">
      <el-input v-model="keyword" placeholder="输入关键词搜索，如：打印机、VPN、密码" size="large" clearable
        @keyup.enter="search" @clear="search">
        <template #append>
          <el-button @click="search"><el-icon><Search /></el-icon></el-button>
        </template>
      </el-input>

      <div v-if="!enable" class="empty">
        <el-icon size="36" color="var(--it-text-sub)"><InfoFilled /></el-icon>
        <p>自助门户暂未开放，请联系 IT。</p>
      </div>

      <div v-else-if="needKey" class="empty">
        <el-icon size="36" color="var(--it-text-sub)"><InfoFilled /></el-icon>
        <p>请通过公司内部的常见问题链接或二维码访问。</p>
      </div>

      <div v-else-if="!list.length" class="empty">
        <el-icon size="36" color="var(--it-text-sub)"><Search /></el-icon>
        <p>没有找到相关问题，可以直接提交报障。</p>
        <el-button type="primary" plain size="small" @click="goReport">去报障</el-button>
      </div>

      <div v-else class="faq-list">
        <div v-for="(item, i) in list" :key="item.kb_id" class="faq-item">
          <div class="faq-q" @click="toggle(item)">
            <span class="idx">{{ i + 1 }}</span>
            <div class="q-main">
              <div class="q-title">{{ item.problem_summary }}</div>
              <div class="q-meta">
                <el-tag v-if="item.app_system" size="small" effect="plain">{{ item.app_system }}</el-tag>
                <el-tag v-if="item.problem_type" size="small" type="info" effect="plain">{{ item.problem_type }}</el-tag>
                <span v-if="item.faq_hits" class="hits">{{ item.faq_hits }} 人看过</span>
              </div>
            </div>
            <el-icon class="arrow" :class="{ open: openId === item.kb_id }"><ArrowRight /></el-icon>
          </div>
          <div v-show="openId === item.kb_id" class="faq-a">
            <div v-if="detailLoading" class="loading">加载中…</div>
            <p v-else class="answer">{{ plain(detail && detail.solution) || '暂无详细说明' }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="pub-foot">
      <router-link :to="{ path: '/report', query: { k: key } }">没有找到答案？点这里报障 →</router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { Search, ArrowRight, InfoFilled } from '@element-plus/icons-vue'
import { ElMessage } from 'element-plus'
import R from '../api'

const route = useRoute()
const router = useRouter()
const key = String(route.query.k || '')

const keyword = ref('')
const list = ref([])
const enable = ref(true)
const needKey = ref(false)
const openId = ref(null)
const detail = ref(null)
const detailLoading = ref(false)

async function search() {
  try {
    const r = await R.publicFaq({ keyword: keyword.value, k: key })
    enable.value = !!r.enable
    needKey.value = !!r.need_key
    list.value = r.list || []
    openId.value = null
  } catch (e) { ElMessage.error(e.message) }
}

async function toggle(item) {
  if (openId.value === item.kb_id) { openId.value = null; return }
  openId.value = item.kb_id
  detail.value = null
  detailLoading.value = true
  try { detail.value = await R.publicFaqDetail(item.kb_id, key) } catch (e) { ElMessage.error(e.message) } finally { detailLoading.value = false }
}

// 知识库正文可能含 Markdown 加粗标记，展示时去掉星号
function plain(t) { return String(t || '').replace(/\*\*/g, '').trim() }

function goReport() { router.push({ path: '/report', query: { k: key } }) }

onMounted(search)
</script>

<style scoped>
.pub-page {
  min-height: 100vh;
  background: linear-gradient(180deg, var(--it-primary) 0%, var(--it-primary) 180px, var(--it-bg) 180px, var(--it-bg) 100%);
  padding: 22px 16px 40px;
  max-width: 640px;
  margin: 0 auto;
}
.pub-head { display: flex; align-items: center; gap: 12px; color: #fff; padding: 6px 4px 20px; }
.pub-head .logo {
  width: 42px; height: 42px; border-radius: 12px; background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 16px;
}
.pub-head h1 { font-size: 19px; margin: 0; }
.pub-head p { font-size: 12px; margin: 3px 0 0; opacity: 0.85; }
.pub-card { background: var(--it-card); border-radius: 14px; padding: 18px; box-shadow: 0 6px 24px rgba(31,41,55,0.08); }

.faq-list { margin-top: 14px; }
.faq-item { border-bottom: 1px solid var(--it-border); }
.faq-item:last-child { border-bottom: none; }
.faq-q { display: flex; align-items: flex-start; gap: 10px; padding: 12px 0; cursor: pointer; }
.idx {
  width: 22px; height: 22px; border-radius: 6px; background: var(--it-primary-light); color: var(--it-primary);
  font-size: 12px; display: flex; align-items: center; justify-content: center; flex: none; margin-top: 2px;
}
.q-main { flex: 1; min-width: 0; }
.q-title { font-size: 14px; line-height: 1.5; color: var(--it-text); }
.q-meta { display: flex; align-items: center; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
.hits { font-size: 12px; color: var(--it-text-sub); }
.arrow { color: var(--it-text-sub); transition: transform 0.2s; margin-top: 3px; }
.arrow.open { transform: rotate(90deg); }
.faq-a { padding: 0 0 14px 32px; }
.answer { font-size: 13px; line-height: 1.9; color: var(--it-text); margin: 0; white-space: pre-wrap; }
.loading { font-size: 12px; color: var(--it-text-sub); }

.empty { text-align: center; padding: 34px 0 20px; }
.empty p { font-size: 13px; color: var(--it-text-sub); margin: 10px 0 12px; }
.pub-foot { text-align: center; margin-top: 16px; font-size: 13px; }
.pub-foot a { color: var(--it-text-sub); text-decoration: none; }
</style>
