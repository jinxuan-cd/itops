import { createApp } from 'vue'
import { createPinia } from 'pinia'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import 'element-plus/theme-chalk/dark/css-vars.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import App from './App.vue'
import router from './router'
import './assets/global.css'
import { applyTheme } from './utils/theme'

applyTheme() // 应用用户自定义主题（含个性化主色）

const app = createApp(App)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
app.use(createPinia())
app.use(router)
// 中文语言包：日期/月份选择器、分页、表格空数据提示、确认框等全部显示中文
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')
