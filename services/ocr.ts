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
import { UNITS, type IngredientDraft, type Unit } from "@/constants/domain";
import type { ApiStorageType } from "@/types/ingredientMaster";
import {
  addDays,
  normalizeOcrStorageOption,
  resolveInitialStorageAndExpiry,
  startOfDay,
} from "@/utils/ingredientEntryRules";

// ─── Backend DTOs ────────────────────────────────────────────────────────────

interface OcrStorageOption {
  storageType: ApiStorageType;
  minDays: number;
  maxDays: number;
}

export interface OcrIngredientCandidate {
  rawName: string;
  customName: string;
  quantity: number | null;
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
  const today = startOfDay(new Date());

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
      expirationDate: addDays(today, 7),
    };
  }

  // MATCHED branch — auto-select storage only when unambiguous.
  const { storage, expirationDate } = resolveInitialStorageAndExpiry(
    candidate.storageOptions.map(normalizeOcrStorageOption),
    today,
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
  // Step 1: convert to JPEG. Failure here is a client-side issue distinct
  // from server errors, so surface a different toast.
  let uploadUri: string;
  try {
    uploadUri = await toJpegUri(imageUri);
  } catch {
    if (__DEV__) console.log("[OCR] image preprocessing failed");
    throw new OcrParseError(PREPROCESS_FAILED_MESSAGE);
  }

  const form = new FormData();
  // RN's FormData accepts the {uri,name,type} shape — TS DOM lib doesn't model
  // it, so cast through unknown to silence the structural mismatch.
  form.append(
    "image",
    {
      uri: uploadUri,
      name: "ocr_image.jpg",
      type: "image/jpeg",
    } as unknown as Blob,
  );

  try {
    const { data } = await api.post<OcrParseResponse>(
      "/api/v1/ocr/parse",
      form,
      {
        // The previous fetch request had no client-side timeout.
        timeout: 0,
      },
    );

    if (__DEV__) {
      console.log(
        `[OCR] received ${data.candidates?.length ?? 0} candidates`,
      );
    }
    return data.candidates ?? [];
  } catch (error: unknown) {
    const status = isAxiosError(error) ? error.response?.status : undefined;
    throw new OcrParseError(messageForStatus(status), status);
  }
}
