# ============================================================
# 江苏省考B类法学岗备考工作台 - Docker 镜像
# 多阶段构建：node 构建单文件 -> nginx 静态服务
# ============================================================

# ---------- 阶段一：构建 ----------
FROM node:22-alpine AS build
WORKDIR /app

# 先复制依赖清单，利用层缓存（package.json 没变就不重装依赖）
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# 复制源码并构建（vite-plugin-singlefile 产出单个 dist/index.html）
COPY . .
RUN npm run build

# ---------- 阶段二：运行 ----------
FROM nginx:1.27-alpine
LABEL maintainer="gk-workbench"

# 静态站点 + gzip + 安全头配置
COPY nginx.conf /etc/nginx/conf.d/default.conf

# 只复制构建产物（单文件应用，一个 HTML 就够了）
COPY --from=build /app/dist/index.html /usr/share/nginx/html/index.html

EXPOSE 80

# 健康检查：nginx 自带 busybox wget
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1/ || exit 1
