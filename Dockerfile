# Bitta konteyner: frontend statik yig'iladi, Go server ham API, ham sahifalarni tarqatadi.
# Yig'ish uchun internet kerak (npm va Go modullari); ishlash uchun kerak emas.
FROM node:20-alpine AS web
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY frontend/ ./
RUN npm run build:static

FROM golang:1.22-alpine AS api
WORKDIR /src/backend
COPY backend/go.mod backend/go.sum* ./
COPY backend/ ./
RUN go mod tidy && CGO_ENABLED=0 go build -o /out/server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates tzdata
WORKDIR /app
COPY --from=api /out/server /app/server
COPY --from=web /src/frontend/out /app/static
COPY backend/assets /app/assets
ENV PORT=8080 STATIC_DIR=/app/static FONTS_DIR=/app/assets/fonts STORAGE_DIR=/data/files
VOLUME ["/data"]
EXPOSE 8080
CMD ["/app/server"]
