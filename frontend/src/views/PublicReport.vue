<template>
  <div class="pub-page">
    <div class="pub-head">
      <div class="logo">IT</div>
      <div>
        <h1>IT 报障服务台</h1>
        <p>提交问题 · 查询进度 · 服务评价</p>
      </div>
    </div>

    <div v-if="!enabled" class="pub-card center">
      <el-icon size="40" color="var(--it-warning)"><WarningFilled /></el-icon>
      <h3>自助报障暂未开放</h3>
      <p>请联系 IT 同事直接报障。</p>
    </div>

    <div v-else-if="badKey" class="pub-card center">
      <el-icon size="40" color="var(--it-danger)"><CircleCloseFilled /></el-icon>
      <h3>报障入口校验失败</h3>
      <p>请重新扫描二维码，或联系 IT 获取新的入口链接。</p>
    </div>

    <template v-else>
      <div class="pub-tabs">
        <div class="pub-tab" :class="{ on: tab === 'report' }" @click="tab = 'report'">我要报障</div>
        <div class="pub-tab" :class="{ on: tab === 'track' }" @click="tab = 'track'">查询进度</div>
      </div>

      <!-- 报障 -->
      <div v-show="tab === 'report'" class="pub-card">
        <template v-if="submittedNo">
          <div class="done-box">
            <el-icon size="44" color="var(--it-success)"><CircleCheckFilled /></el-icon>
            <h3>报障已提交</h3>
            <p>您的报障单号是</p>
            <div class="no-box">{{ submittedNo }}</div>
            <p class="tip">请记下单号，稍后可在「查询进度」中查看处理情况</p>
            <el-button type="primary" plain @click="goTrack">去查询进度</el-button>
            <el-button text @click="resetReport">再报一个</el-button>
          </div>
        </template>

        <template v-else>
          <div class="field">
            <label>您的姓名 <i>*</i></label>
            <el-input v-model="form.contact" placeholder="方便我们联系您" size="large" maxlength="20" />
          </div>
          <div class="field-row">
            <div class="field">
              <label>部门</label>
              <el-select v-model="form.dept" placeholder="请选择" size="large" filterable clearable style="width:100%">
                <el-option v-for="d in options.dept" :key="d" :label="d" :value="d" />
              </el-select>
            </div>
            <div class="field">
              <label>手机号</label>
              <el-input v-model="form.phone" placeholder="选填，便于回电" size="large" maxlength="20" />
            </div>
          </div>
          <div class="field">
            <label>相关系统</label>
            <el-select v-model="form.app_system" placeholder="不确定可不选" size="large" filterable clearable style="width:100%">
              <el-option v-for="d in options.app_system" :key="d" :label="d" :value="d" />
            </el-select>
          </div>
          <div class="field">
            <label>紧急程度</label>
            <div class="pri-row">
              <div v-for="p in PRIORITIES" :key="p.value" class="pri" :class="[p.value, { on: form.priority === p.value }]"
                @click="form.priority = p.value">
                {{ p.label }}
              </div>
            </div>
          </div>
          <div class="field">
            <label>问题描述 <i>*</i></label>
            <el-input v-model="form.content" type="textarea" :rows="5" size="large"
              placeholder="请描述遇到的现象，例如：打开 OA 提示 502，所有人打不开" maxlength="500" show-word-limit />
          </div>
          <el-button type="primary" size="large" class="submit" :loading="submitting" @click="onSubmit">提交报障</el-button>
          <p class="privacy">提交后 IT 会尽快响应，紧急问题请同时电话联系 IT 值班。</p>
        </template>
      </div>

      <!-- 查询 -->
      <div v-show="tab === 'track'" class="pub-card">
        <div class="field">
          <label>报障单号</label>
          <el-input v-model="track.report_no" placeholder="如 R202610280001" size="large" />
        </div>
        <div class="field">
          <label>手机号后 4 位</label>
          <el-input v-model="track.phone" placeholder="选填" size="large" maxlength="4" />
        </div>
        <el-button type="primary" size="large" class="submit" :loading="tracking" @click="onTrack">查询</el-button>

        <div v-if="result" class="result">
          <div class="r-head">
            <el-tag :type="result.status === 'done' ? 'success' : result.status === 'pending' ? 'info' : 'warning'" effect="dark">
              {{ result.status === 'done' ? '已完成' : result.status === 'pending' ? '待接单' : '处理中' }}
            </el-tag>
            <span class="r-no">{{ result.report_no }}</span>
          </div>
          <div class="r-line"><span>问题</span><b>{{ result.service_content }}</b></div>
          <div class="r-line"><span>系统</span><b>{{ result.app_system || '—' }}</b></div>
          <div class="r-line"><span>提交</span><b>{{ result.happen_time }}</b></div>
          <div v-if="result.finish_time" class="r-line"><span>完成</span><b>{{ result.finish_time }}</b></div>
          <div v-if="result.result" class="r-result">
            <div class="label">处理结果</div>
            <p>{{ result.result }}</p>
          </div>

          <div v-if="result.can_satisfy" class="rate-box">
            <div class="label">本次服务您满意吗？</div>
            <el-rate v-model="rate.score" :texts="['很不满意', '不满意', '一般', '满意', '非常满意']" show-text size="large" />
            <el-input v-model="rate.comment" placeholder="还有什么想说的？（选填）" type="textarea" :rows="2" style="margin-top:10px" />
            <el-button type="primary" style="margin-top:10px" :loading="rating" @click="onRate">提交评价</el-button>
          </div>
          <div v-else-if="result.satisfy_score" class="rated">
            已评价：<el-rate :model-value="result.satisfy_score" disabled size="small" style="display:inline-block;vertical-align:middle" />
          </div>
        </div>
      </div>

      <div class="pub-foot">
        <router-link to="/faq" v-if="faqEnabled">查看常见问题，也许能马上解决 →</router-link>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import R from '../api'

const route = useRoute()
const KEY = String(route.query.k || '')

const enabled = ref(true)
const badKey = ref(false)
const faqEnabled = ref(true)
const tab = ref('report')

const options = reactive({ dept: [], app_system: [], problem_type: [] })
const PRIORITIES = [
  { value: 'urgent', label: '很急' },
  { value: 'high', label: '较急' },
  { value: 'normal', label: '一般' },
  { value: 'low', label: '不急' }
]

const form = reactive({ contact: '', dept: '', phone: '', app_system: '', priority: 'normal', content: '' })
const submitting = ref(false)
const submittedNo = ref('')

const track = reactive({ report_no: '', phone: '' })
const tracking = ref(false)
const result = ref(null)
const rate = reactive({ score: 0, comment: '' })
const rating = ref(false)

async function onSubmit() {
  if (!form.contact.trim()) return ElMessage.warning('请填写您的姓名')
  if (form.content.trim().length < 4) return ElMessage.warning('请简单描述遇到的问题')
  submitting.value = true
  try {
    const r = await R.publicReport({ ...form, k: KEY })
    submittedNo.value = r.report_no
  } catch (e) { ElMessage.error(e.message) } finally { submitting.value = false }
}

function resetReport() {
  submittedNo.value = ''
  Object.assign(form, { dept: '', phone: '', app_system: '', priority: 'normal', content: '' })
}
function goTrack() {
  track.report_no = submittedNo.value
  track.phone = (form.phone || '').slice(-4)
  tab.value = 'track'
  onTrack()
}

async function onTrack() {
  if (!track.report_no.trim()) return ElMessage.warning('请填写报障单号')
  tracking.value = true
  result.value = null
  rate.score = 0
  rate.comment = ''
  try {
    result.value = await R.publicTrack({ report_no: track.report_no.trim(), phone: track.phone })
  } catch (e) { ElMessage.error(e.message) } finally { tracking.value = false }
}

async function onRate() {
  if (!rate.score) return ElMessage.warning('请先选择评分')
  rating.value = true
  try {
    await R.publicSatisfy({ report_no: result.value.report_no, phone: track.phone, score: rate.score, comment: rate.comment })
    ElMessage.success('感谢您的评价！')
    onTrack()
  } catch (e) { ElMessage.error(e.message) } finally { rating.value = false }
}

onMounted(async () => {
  try {
    const c = await R.publicConfig(KEY)
    enabled.value = !!c.report_enable
    faqEnabled.value = !!c.faq_enable
    if (c.has_key && !c.key_ok) badKey.value = true
    if (enabled.value && !badKey.value) {
      const o = await R.publicOptions()
      Object.assign(options, o)
    }
  } catch (e) {
    ElMessage.error('加载失败：' + e.message)
  }
})
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

.pub-card {
  background: var(--it-card); border-radius: 14px; padding: 18px;
  box-shadow: 0 6px 24px rgba(31, 41, 55, 0.08);
}
.pub-card.center { text-align: center; padding: 40px 20px; }
.pub-card.center h3 { margin: 12px 0 6px; font-size: 16px; }
.pub-card.center p { color: var(--it-text-sub); font-size: 13px; margin: 0; }

.pub-tabs { display: flex; background: rgba(255,255,255,0.22); border-radius: 10px; padding: 4px; margin-bottom: 12px; }
.pub-tab { flex: 1; text-align: center; padding: 9px 0; font-size: 14px; color: #fff; border-radius: 8px; cursor: pointer; }
.pub-tab.on { background: var(--it-card); color: var(--it-primary); font-weight: 600; }

.field { margin-bottom: 14px; }
.field label { display: block; font-size: 13px; color: var(--it-text-sub); margin-bottom: 6px; }
.field label i { color: var(--it-danger); font-style: normal; }
.field-row { display: flex; gap: 12px; }
.field-row .field { flex: 1; min-width: 0; }

.pri-row { display: flex; gap: 8px; }
.pri {
  flex: 1; text-align: center; padding: 9px 0; font-size: 13px; border-radius: 8px;
  border: 1px solid var(--it-border); cursor: pointer; color: var(--it-text-sub);
}
.pri.on { border-color: var(--it-primary); color: var(--it-primary); background: var(--it-primary-light); font-weight: 600; }
.pri.on.urgent { border-color: var(--it-danger); color: var(--it-danger); background: rgba(229,69,69,0.08); }
.pri.on.high { border-color: var(--it-warning); color: var(--it-warning); background: rgba(240,160,32,0.1); }

.submit { width: 100%; margin-top: 4px; }
.privacy { font-size: 12px; color: var(--it-text-sub); text-align: center; margin: 10px 0 0; }

.done-box { text-align: center; padding: 10px 0; }
.done-box h3 { margin: 10px 0 6px; font-size: 17px; }
.done-box p { color: var(--it-text-sub); font-size: 13px; margin: 4px 0; }
.no-box {
  font-size: 20px; font-weight: 700; letter-spacing: 1px; color: var(--it-primary);
  background: var(--it-primary-light); border-radius: 10px; padding: 12px 0; margin: 10px 0;
}
.done-box .tip { font-size: 12px; margin-bottom: 14px; }

.result { margin-top: 18px; border-top: 1px dashed var(--it-border); padding-top: 14px; }
.r-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.r-no { font-size: 12px; color: var(--it-text-sub); }
.r-line { display: flex; gap: 10px; font-size: 13px; padding: 4px 0; }
.r-line span { color: var(--it-text-sub); width: 42px; flex: none; }
.r-line b { font-weight: 500; word-break: break-all; }
.r-result { margin-top: 12px; background: var(--it-bg); border-radius: 10px; padding: 12px; }
.r-result .label { font-size: 12px; color: var(--it-text-sub); margin-bottom: 6px; }
.r-result p { margin: 0; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }
.rate-box { margin-top: 16px; }
.rate-box .label { font-size: 13px; margin-bottom: 8px; }
.rated { margin-top: 14px; font-size: 13px; color: var(--it-text-sub); }
.pub-foot { text-align: center; margin-top: 16px; font-size: 13px; }
.pub-foot a { color: var(--it-text-sub); text-decoration: none; }
</style>
