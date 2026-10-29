# 员工自助门户（公网）镜像：仅静态文件 + 公网网关配置
FROM nginx:1.27-alpine

LABEL maintainer="锦轩"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html style.css app.js /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
