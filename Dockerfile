# syntax=docker/dockerfile:1.7
# ↑ BuildKit cache mount 등 최신 기능 사용

# =============================================================================
# Stage 1: builder
# - argon2 native build에 필요한 컴파일 도구 설치
# - 모든 의존성 설치 (devDeps 포함, tsc가 필요)
# - TypeScript 컴파일
# - 이 stage의 산출물(build/, node_modules/)만 production stage로 복사됨
# =============================================================================
FROM node:20-slim AS builder

# argon2가 ARM(aarch64)에서는 prebuilt binary가 없어 소스 컴파일 필요
# python3, make, g++는 node-gyp가 사용
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# pnpm 9 설치 (pnpm-lock.yaml lockfileVersion: 9.0 호환)
RUN npm install -g pnpm@9

WORKDIR /app

# ----- Layer cache 최적화 -----
# package.json + lockfile만 먼저 복사하면, 의존성이 안 바뀐 경우
# 아래 pnpm install layer가 캐시에서 재사용됨 (소스만 바뀐 배포는 매우 빠름)
COPY package.json pnpm-lock.yaml ./

# BuildKit cache mount: pnpm store를 영구 캐시 디렉토리에 둠
# layer cache가 invalidate되더라도 패키지 다운로드는 재사용
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# 소스 복사 (변경 빈도가 높으므로 install 이후에)
COPY tsconfig.json tsconfig.alias.json tsconfig.prod.json ./
COPY src ./src

# TypeScript -> JavaScript 컴파일
# 1) tsc로 컴파일 → 2) tsc-alias로 @src/* 경로를 상대경로로 재작성
# 산출물: /app/build/src/*.js (path alias가 제거된 평범한 JS)
RUN pnpm build


# =============================================================================
# Stage 2: production
# - 컴파일러 도구 없는 깨끗한 이미지
# - builder에서 컴파일된 산출물과 node_modules만 복사
# - non-root 유저(node)로 실행
# =============================================================================
FROM node:20-slim AS production

WORKDIR /app

# builder에서 산출물 복사
# - build/        : 컴파일된 JS (tsc-alias로 @src/* 경로 재작성 완료)
# - node_modules/ : 컴파일된 argon2 .node 바이너리 포함
# - package.json  : 메타데이터
#
# tsc-alias 덕분에 런타임에 tsconfig-paths가 더 이상 필요 없으므로
# tsconfig*.json 파일들도 복사하지 않음 (이미지 더 작아짐)
COPY --from=builder --chown=node:node /app/build ./build
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/package.json ./package.json

# drizzle migration 파일 (entrypoint.sh에서 사용 예정)
COPY --chown=node:node drizzle ./drizzle

# uploads 디렉토리 생성 (host volume mount 지점)
# 호스트 볼륨이 마운트되면 이 디렉토리는 마운트로 덮어써짐
# 마운트가 없을 때도 컨테이너 내부에서 쓰기 가능하도록 준비
RUN mkdir -p /app/uploads && chown node:node /app/uploads

ENV NODE_ENV=production

# 컨테이너 내부에서 listen할 포트 (실제 외부 노출은 cloudflared 라우팅)
EXPOSE 5500

# 보안: non-root 유저로 실행
USER node

# 다음 단계(entrypoint.sh)에서 ENTRYPOINT로 교체될 예정
# 지금은 server.js를 직접 실행해서 컨테이너 단독 동작 검증 가능
# tsc-alias 덕분에 런타임 path resolver 없이 평범한 node 실행
CMD ["node", "./build/src/server.js"]
