import { randomUUID } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { imageSize } from "image-size";
import type { MultipartFile } from "@fastify/multipart";
import { HttpError } from "@src/errors/http-error";

/**
 * 파일 저장 설정 상수
 */
const UPLOAD_DIR =
  process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * MIME 타입별 magic bytes (파일 헤더)
 * SVG는 텍스트 기반이므로 검증 대상 외
 */
const MAGIC_BYTES: Record<string, number[]> = {
  "image/jpeg": [0xff, 0xd8, 0xff],
  "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  "image/gif": [0x47, 0x49, 0x46, 0x38],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): boolean {
  const expected = MAGIC_BYTES[mimeType];
  if (!expected) return true;
  return expected.every((byte, i) => buffer[i] === byte);
}

function validateWebP(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  );
}

function validateSvg(buffer: Buffer): boolean {
  const content = buffer.toString("utf8").trimStart();

  if (!content.startsWith("<svg") && !content.startsWith("<?xml")) {
    return false;
  }

  const normalized = content.toLowerCase();
  const hasSvgRoot = /<svg[\s>]/i.test(content);
  const hasScript = /<script[\s>]/i.test(content);
  const hasEventHandler = /\son[a-z]+\s*=/i.test(content);
  const hasJavascriptUrl = /javascript\s*:/i.test(content);
  const hasForeignObject = /<foreignobject[\s>]/i.test(content);

  return (
    hasSvgRoot &&
    !hasScript &&
    !hasEventHandler &&
    !hasJavascriptUrl &&
    !hasForeignObject &&
    !normalized.includes("<!entity") &&
    !normalized.includes("<!doctype")
  );
}

function validateFileContent(buffer: Buffer, mimeType: string): boolean {
  if (mimeType === "image/webp") {
    return validateWebP(buffer);
  }

  if (mimeType === "image/svg+xml") {
    return validateSvg(buffer);
  }

  return validateMagicBytes(buffer, mimeType);
}

/**
 * 라우트에서 스트림을 미리 버퍼링한 파일 데이터
 * multipart 스트림은 route handler에서 즉시 소비해야 hang을 방지할 수 있음
 */
export interface BufferedFile {
  filename: string;
  mimetype: string;
  buffer: Buffer;
  truncated: boolean;
}

/**
 * 파일 저장 결과
 */
export interface SaveFileResult {
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
}

/**
 * 로컬 디스크에 파일을 저장하고 관리하는 서비스
 */
export class FileStorageService {
  /**
   * MultipartFile을 스트림에서 읽어 BufferedFile로 변환
   * route handler 내 async iterator 루프에서 호출해야 함
   * @fastify/multipart가 fileSize 한도 초과 시 FST_REQ_FILE_TOO_LARGE를 throw → payloadTooLarge로 변환
   */
  static async bufferFile(file: MultipartFile): Promise<BufferedFile> {
    let buffer: Buffer;
    let truncated = false;

    try {
      buffer = await file.toBuffer();
    } catch (err) {
      const ferr = err as { code?: string };
      if (ferr.code === "FST_REQ_FILE_TOO_LARGE") {
        throw HttpError.payloadTooLarge(
          `파일 크기가 제한을 초과했습니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        );
      }
      throw err;
    }

    truncated = file.file.truncated;

    return {
      filename: file.filename,
      mimetype: file.mimetype,
      buffer,
      truncated,
    };
  }

  /**
   * 파일을 로컬 디스크에 저장
   * @param buffered 미리 버퍼링된 파일 데이터
   * @returns 저장된 파일 정보
   */
  async saveFile(buffered: BufferedFile): Promise<SaveFileResult> {
    // 1. 파일 크기 초과 검증 (multipart plugin 레벨에서 truncate된 경우)
    if (buffered.truncated) {
      throw HttpError.payloadTooLarge(
        `파일 크기가 제한을 초과했습니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // 2. MIME 타입 검증
    if (!ALLOWED_MIME_TYPES.includes(buffered.mimetype)) {
      throw HttpError.badRequest(
        `지원하지 않는 파일 형식입니다. 허용된 형식: ${ALLOWED_MIME_TYPES.join(", ")}`,
      );
    }

    const { buffer } = buffered;
    const sizeBytes = buffer.length;

    // 3. Magic bytes 검증 (MIME 위조 차단)
    if (!validateFileContent(buffer, buffered.mimetype)) {
      throw HttpError.badRequest("파일 형식이 올바르지 않습니다");
    }

    // 4. 파일 크기 검증 (2차 방어)
    if (sizeBytes > MAX_FILE_SIZE) {
      throw HttpError.payloadTooLarge(
        `파일 크기가 제한을 초과했습니다. 최대 ${MAX_FILE_SIZE / 1024 / 1024}MB`,
      );
    }

    // 5. 저장 경로 생성 (날짜별 분류: uploads/YYYY/MM/)
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, "0");
    const dateDir = path.join(UPLOAD_DIR, year, month);

    // 디렉토리 생성
    await fs.mkdir(dateDir, { recursive: true });

    // 6. 파일명 생성 (UUID + 확장자)
    const extension = path.extname(buffered.filename);
    const fileName = `${randomUUID()}${extension}`;
    const filePath = path.join(dateDir, fileName);

    // 7. 파일 저장
    await fs.writeFile(filePath, buffer);

    // 8. 상대 경로 반환 (storageKey)
    const storageKey = path.join(year, month, fileName);

    // 9. 이미지 크기 추출 (SVG 등 추출 불가 시 undefined)
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dimensions = imageSize(buffer);
      width = dimensions.width;
      height = dimensions.height;
    } catch {
      // 크기 추출 실패는 무시 (nullable)
    }

    return {
      storageKey,
      mimeType: buffered.mimetype,
      sizeBytes,
      width,
      height,
    };
  }

  /**
   * 파일 삭제 (idempotent)
   * @param storageKey 저장 키
   */
  async deleteFile(storageKey: string): Promise<void> {
    const filePath = this.getFilePath(storageKey);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      // 파일이 없어도 에러 무시 (idempotent)
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
  }

  /**
   * 파일 전체 경로 반환 (Path Traversal 방지)
   * @param storageKey 저장 키
   * @returns 전체 파일 경로
   */
  getFilePath(storageKey: string): string {
    // Path Traversal 공격 방지
    if (storageKey.includes("..")) {
      throw HttpError.badRequest("잘못된 파일 경로입니다");
    }

    return path.join(UPLOAD_DIR, storageKey);
  }

  /**
   * 업로드 디렉토리 생성 (서버 시작 시 1회 호출)
   */
  async ensureUploadDir(): Promise<void> {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  }
}
