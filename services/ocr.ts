/**
 * KeepEat — receipt OCR service.
 *
 * Wraps `POST /api/v1/ocr/parse` and converts the backend's candidate
 * shape into `IngredientDraft` so the add-confirm screen can seed itself
 * with no further translation.
 *
 * Backend contract assumes every returned candidate is `MATCHED` — the
 * server runs an embedding-similarity step plus an AI fallback that
 * auto-creates new master ingredients when needed. The client therefore
 * doesn't surface UNMATCHED branches.
 *
 * Usage:
 *   const candidates = await parseReceiptImage(localUri);
 *   ocrPending.set(candidates);                       // stash
 *   router.replace("/add-confirm");                   // navigate
 *   // …in add-confirm:
 *   const seeds = ocrPending.consume();               // read + clear
 */

import { isAxiosError } from "axios";
import * as ImageManipulator from "expo-image-manipulator";
import { api } from "@/services/api";
import { tokenStorage } from "@/services/tokenStorage";
import { API_BASE_URL } from "@/constants/config";
import { UNITS, type IngredientDraft, type StorageType, type Unit } from "@/constants/domain";
import type { ApiStorageType } from "@/constants/ingredients-master";

// ─── Backend DTOs ────────────────────────────────────────────────────────────

interface OcrStorageOption {
  storageType: ApiStorageType;
  minDays: number;
  maxDays: number;
}

export interface OcrIngredientCandidate {
  rawName: string;
  customName: string;
  quantity: number;
  unit: string;
  matchStatus: "MATCHED" | "UNMATCHED";
  /** Null when matchStatus === "UNMATCHED" — backend couldn't link to master. */
  ingredientId: number | null;
  ingredientName: string | null;
  storageOptions: OcrStorageOption[];
}

interface OcrParseResponse {
  candidates: OcrIngredientCandidate[];
}

// ─── Mapping ─────────────────────────────────────────────────────────────────

const API_TO_DOMAIN_STORAGE: Record<ApiStorageType, StorageType> = {
  실온: "room",
  냉장: "fridge",
  냉동: "frozen",
};

/**
 * Resolve storage + expiry from the backend's per-candidate options.
 * - Single unique domain storage  → auto-select that one + compute expiry
 *   from its (min+max)/2 days.
 * - Multiple or zero options      → return null storage/expiry so the user
 *   is forced to pick deliberately on the add-confirm screen.
 */
function resolveStorageAndExpiry(
  options: OcrStorageOption[],
): { storage: StorageType | null; expirationDate: Date | null } {
  const uniqueDomains = Array.from(
    new Set(options.map((o) => API_TO_DOMAIN_STORAGE[o.storageType])),
  );
  if (uniqueDomains.length !== 1) {
    return { storage: null, expirationDate: null };
  }
  const storage = uniqueDomains[0];
  const opt = options.find(
    (o) => API_TO_DOMAIN_STORAGE[o.storageType] === storage,
  );
  if (!opt) return { storage, expirationDate: null };
  const avgDays = Math.max(1, Math.round((opt.minDays + opt.maxDays) / 2));
  return { storage, expirationDate: startOfDayPlus(avgDays) };
}

function startOfDayPlus(days: number): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

export function mapOcrCandidateToDraft(
  candidate: OcrIngredientCandidate,
): IngredientDraft {
  const unit: Unit = (UNITS as readonly string[]).includes(candidate.unit)
    ? (candidate.unit as Unit)
    : "g";

  // Local id for list keying — combines candidate identity with random suffix
  // so the same ingredient appearing twice on a receipt still gets unique keys.
  const seed = candidate.ingredientId ?? candidate.rawName;
  const localId = `ocr-${seed}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`;

  // UNMATCHED branch: backend couldn't link this scan to a master entry.
  // Surface the raw text in `name` so the user sees what was detected, leave
  // `ingredientId` undefined so the registration guard keeps the picker
  // requirement, and force the user to pick a storage explicitly.
  if (candidate.matchStatus === "UNMATCHED" || candidate.ingredientId == null) {
    return {
      id: localId,
      ingredientId: undefined,
      name: candidate.customName ?? candidate.rawName ?? "",
      nickname: candidate.customName ?? "",
      quantity: candidate.quantity,
      unit,
      // UNMATCHED는 마스터 보관옵션이 없어 storage 선택 시 autoExpiry 계산
      // 경로(IngredientEditCard.handleStorageChange)도 ingredientId null에
      // 막혀 스킵된다. 결과적으로 expirationDate가 null로 남아 POST에서
      // 누락되는 경로 — 기본 7일 폴백으로 미리 채워 UI에도 즉시 표시.
      // 사용자는 그 값을 보고 필요시 직접 수정 가능.
      storage: null,
      expirationDate: startOfDayPlus(7),
    };
  }

  // MATCHED branch — auto-select storage only when unambiguous.
  const { storage, expirationDate } = resolveStorageAndExpiry(
    candidate.storageOptions,
  );
  return {
    id: localId,
    ingredientId: candidate.ingredientId,
    name: candidate.ingredientName ?? candidate.rawName ?? "",
    nickname: candidate.customName ?? "",
    quantity: candidate.quantity,
    unit,
    storage,
    expirationDate,
  };
}

// ─── Pending-candidates handoff (crop → add-confirm) ─────────────────────────
// In-memory only. The two screens are part of the same navigation step so
// nothing needs to survive a process restart, and AsyncStorage / search
// params would just add latency or length-limit risk.

let pending: OcrIngredientCandidate[] | null = null;

export const ocrPending = {
  set(candidates: OcrIngredientCandidate[]): void {
    pending = candidates;
  },
  consume(): OcrIngredientCandidate[] | null {
    const out = pending;
    pending = null;
    return out;
  },
  /** Clears without returning. Use on unmount of crop screen if cancelled. */
  clear(): void {
    pending = null;
  },
};

// ─── Errors ──────────────────────────────────────────────────────────────────

export class OcrParseError extends Error {
  constructor(
    /** Friendly Korean message ready to show in a toast. */
    message: string,
    /** HTTP status if known. */
    public readonly status?: number,
  ) {
    super(message);
    this.name = "OcrParseError";
  }
}

function messageForStatus(status: number | undefined): string {
  switch (status) {
    case 400:
      return "사진을 다시 촬영해주세요";
    case 422:
      return "식재료를 인식할 수 없어요. 직접 추가해보세요";
    case 502:
      return "잠시 후 다시 시도해주세요";
    default:
      return "OCR을 처리하지 못했어요. 잠시 후 다시 시도해주세요";
  }
}

const PREPROCESS_FAILED_MESSAGE = "이미지 처리 중 문제가 발생했어요";

// ─── Service ─────────────────────────────────────────────────────────────────

/**
 * Uploads a local image URI to the OCR endpoint and returns the parsed
 * candidate list. Throws `OcrParseError` with a user-friendly message
 * on failure.
 */
/**
 * Normalize whatever the picker / camera gave us (PNG on simulator, HEIC on
 * iOS device, etc.) to a JPEG so the backend's OCR pipeline doesn't need to
 * understand exotic codecs. compress 0.8 keeps OCR-quality text readable
 * while halving typical upload size.
 */
async function toJpegUri(sourceUri: string): Promise<string> {
  const result = await ImageManipulator.manipulateAsync(
    sourceUri,
    [],
    { format: ImageManipulator.SaveFormat.JPEG, compress: 0.8 },
  );
  return result.uri;
}

export async function parseReceiptImage(
  imageUri: string,
): Promise<OcrIngredientCandidate[]> {
  // TEMP: surface the URI scheme during integration debugging. Remove once
  // we've confirmed multipart uploads land cleanly across iOS / Android.
  if (__DEV__) console.log("[OCR] uri:", imageUri);

  // Step 1: convert to JPEG. Failure here is a client-side issue distinct
  // from server errors, so surface a different toast.
  let uploadUri: string;
  try {
    uploadUri = await toJpegUri(imageUri);
  } catch (e) {
    if (__DEV__) console.log("[OCR] preprocess failed:", e);
    throw new OcrParseError(PREPROCESS_FAILED_MESSAGE);
  }
  if (__DEV__) console.log("[OCR] converted uri:", uploadUri);

  const form = new FormData();
  // RN's FormData accepts the {uri,name,type} shape — TS DOM lib doesn't model
  // it, so cast through unknown to silence the structural mismatch.
  form.append(
    "image",
    {
      uri: uploadUri,
      name: "ocr_image.jpg",
      type: "image/jpeg",
    } as any,
  );

  try {
    const token = await tokenStorage.getAccessToken();
    const headers: Record<string, string> = {};
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    // ⚠️ 핵심 조건: `fetch`의 `headers` 객체에는 절대로 `Content-Type`을 적지 말 것!
    // 비워둬야 RN의 fetch가 자동으로 boundary가 포함된 multipart 헤더를 생성함.

    const response = await fetch(`${API_BASE_URL}/api/v1/ocr/parse`, {
      method: "POST",
      headers,
      body: form,
    });

    if (!response.ok) {
      if (__DEV__) {
        const errorBody = await response.text().catch(() => "<unreadable>");
        console.log(`[OCR] error ${response.status}:`, errorBody);
      }
      const error: any = new Error("Fetch failed");
      error.status = response.status;
      throw error;
    }

    const data: OcrParseResponse = await response.json();
    if (__DEV__) {
      const count = data.candidates?.length ?? 0;
      console.log(`[OCR] received ${count} candidates`);
      console.log(
        "[OCR] candidates detail:",
        JSON.stringify(data.candidates, null, 2),
      );
    }
    return data.candidates ?? [];
  } catch (e: any) {
    const status = isAxiosError(e) ? e.response?.status : e.status;
    throw new OcrParseError(messageForStatus(status), status);
  }
}
