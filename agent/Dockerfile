# --- Build Stage ---
# Multi-Arch Builder mit expliziter Plattform-Angabe
FROM --platform=$BUILDPLATFORM golang:1.24-alpine AS builder

ARG TARGETOS TARGETARCH

WORKDIR /app

ENV GO111MODULE=on \
    CGO_ENABLED=0 \
    GOOS=$TARGETOS \
    GOARCH=$TARGETARCH

COPY go.mod go.sum ./
RUN go mod download

COPY . .

# Cross-Compile für Zielarchitektur
RUN go build -ldflags="-w -s" -o app

# --- Run Stage ---
# Multi-Arch Laufzeit-Image
FROM alpine:latest

# Notwendig für TLS/SSL-Zertifikate
RUN apk --no-cache add ca-certificates gcompat

WORKDIR /root/

COPY --from=builder /app/app .

# Ensure the SQLite data directory is writable for the runtime user
RUN mkdir -p /data && chown -R nobody:nobody /data

# Security Hardening
USER nobody:nobody
ENV GOMAXPROCS=1

CMD ["./app"]

# - - BUILD COMMAND - - 
# docker buildx build \
#   --platform linux/amd64,linux/arm64,linux/arm/v7 \
#   -t haedlessdev/corecontrol-agent:1.0.0 \
#   -t haedlessdev/corecontrol-agent:latest \
#   --push \
#   .
