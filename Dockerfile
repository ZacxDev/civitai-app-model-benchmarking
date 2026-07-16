# Civitai App Block — production image.
# Multi-stage: pnpm build → static assets baked into nginx-unprivileged.
# The Tekton pipeline's build task builds this exact Dockerfile; downstream
# apps shouldn't need to change it.

FROM node:22-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@9.15.4
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && test -d dist && test -f dist/index.html

# Runtime: nginx-unprivileged (NOT plain nginx-alpine). The apply-Job's
# pre-flight smoke step sets runAsNonRoot=true. Plain nginx-alpine fails
# in two ways under that gate: (a) named USER nginx is rejected by the
# kubelet ("non-numeric user, cannot verify"); (b) USER 101 immediately
# hits Permission denied on /var/cache/nginx + /var/log/nginx + /var/run
# because those paths are root-owned in the upstream image. The
# nginx-unprivileged variant is the same nginx 1.27 with all writable
# paths redirected to /tmp + USER 101 baked into the image metadata as
# a number. Drop-in: no need for an explicit USER directive here.
# (See datapacket-talos skill gotcha #37 for the full chain.)
FROM nginxinc/nginx-unprivileged:1.27-alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]