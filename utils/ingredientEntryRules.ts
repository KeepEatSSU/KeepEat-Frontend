import { UNITS, type IngredientDraft, type StorageType } from "@/constants/domain";
import {
  METRIC_TO_DAYS,
  type ApiStorageType,
  type StorageMetric,
  type StorageOptionEntry,
} from "@/constants/ingredients-master";
import type { ResolvedSnapshot } from "@/services/ingredientMaster";

export const STORAGE_API_TO_DOMAIN: Record<ApiStorageType, StorageType> = {
  실온: "room",
  냉장: "fridge",
  냉동: "frozen",
};

export const STORAGE_DOMAIN_TO_API: Record<StorageType, ApiStorageType> = {
  room: "실온",
  fridge: "냉장",
  frozen: "냉동",
};

export type IngredientEntryStorageOption = {
  storageType: ApiStorageType;
  min: number;
  max: number;
  metric: StorageMetric;
};

export type OcrStorageOptionLike = {
  storageType: ApiStorageType;
  minDays: number;
  maxDays: number;
};

export type IngredientDraftValidationField =
  | "name"
  | "quantity"
  | "unit"
  | "storage"
  | "expirationDate";

export type IngredientDraftFieldErrors = Partial<
  Record<IngredientDraftValidationField, string>
>;

export type IngredientDraftValidationResult = {
  field: IngredientDraftValidationField;
  message: string;
  fieldErrors: IngredientDraftFieldErrors;
};

const VALIDATION_FIELD_ORDER: IngredientDraftValidationField[] = [
  "name",
  "quantity",
  "unit",
  "storage",
  "expirationDate",
];

export function mapStorageTypeFromApi(api: ApiStorageType): StorageType {
  return STORAGE_API_TO_DOMAIN[api];
}

export function mapStorageTypeToApi(domain: StorageType): ApiStorageType {
  return STORAGE_DOMAIN_TO_API[domain];
}

export function normalizeOcrStorageOption(
  option: OcrStorageOptionLike,
): IngredientEntryStorageOption {
  return {
    storageType: option.storageType,
    min: option.minDays,
    max: option.maxDays,
    metric: "Days",
  };
}

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

export function getSupportedStorages(
  options: readonly IngredientEntryStorageOption[] | null | undefined,
): StorageType[] {
  const seen = new Set<StorageType>();
  for (const option of options ?? []) {
    seen.add(mapStorageTypeFromApi(option.storageType));
  }
  return Array.from(seen);
}

export function findStorageOptionForStorage<
  T extends IngredientEntryStorageOption,
>(
  options: readonly T[] | null | undefined,
  storage: StorageType | null | undefined,
): T | undefined {
  if (storage == null) return undefined;
  const apiStorage = mapStorageTypeToApi(storage);
  return options?.find((option) => option.storageType === apiStorage);
}

export function isStorageSelectable(
  options: readonly IngredientEntryStorageOption[] | null | undefined,
  storage: StorageType,
): boolean {
  if (!options || options.length === 0) return true;
  return findStorageOptionForStorage(options, storage) !== undefined;
}

export function getStorageWindowDays(
  option: IngredientEntryStorageOption,
): { min: number; avg: number; max: number } {
  const min = Math.round(option.min * METRIC_TO_DAYS[option.metric]);
  const max = Math.round(option.max * METRIC_TO_DAYS[option.metric]);
  const avg = Math.round(
    ((option.min + option.max) / 2) * METRIC_TO_DAYS[option.metric],
  );
  return {
    min: Math.max(1, min),
    avg: Math.max(1, avg),
    max: Math.max(1, max),
  };
}

export function calculateAverageExpiryDate(
  option: IngredientEntryStorageOption,
  purchaseDate: Date,
): Date {
  return addDays(purchaseDate, getStorageWindowDays(option).avg);
}

export function resolveInitialStorageAndExpiry<
  T extends IngredientEntryStorageOption,
>(
  options: readonly T[] | null | undefined,
  purchaseDate: Date,
): { storage: StorageType | null; expirationDate: Date | null } {
  const storages = getSupportedStorages(options);
  if (storages.length !== 1) {
    return { storage: null, expirationDate: null };
  }

  const storage = storages[0];
  const option = findStorageOptionForStorage(options, storage);
  return {
    storage,
    expirationDate: option
      ? calculateAverageExpiryDate(option, purchaseDate)
      : null,
  };
}

export function getAutoExpiryForStorageChange<
  T extends IngredientEntryStorageOption,
>({
  options,
  storage,
  purchaseDate,
  expirationManuallySet,
}: {
  options: readonly T[] | null | undefined;
  storage: StorageType;
  purchaseDate: Date;
  expirationManuallySet?: boolean;
}): Date | undefined {
  if (expirationManuallySet) return undefined;
  const option = findStorageOptionForStorage(options, storage);
  if (!option) return undefined;
  return calculateAverageExpiryDate(option, purchaseDate);
}

export function getDraftStorageOptions(
  draft: IngredientDraft,
  snapshot: ResolvedSnapshot | null | undefined,
): StorageOptionEntry[] | undefined {
  if (draft.isCustom || draft.ingredientId == null) return undefined;
  return snapshot?.optionsByIngredientId.get(draft.ingredientId);
}

export function getIngredientDraftFieldErrors(
  draft: IngredientDraft,
  snapshot?: ResolvedSnapshot | null,
): IngredientDraftFieldErrors {
  const errors: IngredientDraftFieldErrors = {};

  if (draft.name.trim() === "") {
    errors.name = "식재료명을 입력해주세요";
  } else if (!draft.isCustom && draft.ingredientId == null) {
    errors.name = "식재료를 선택해주세요";
  }

  if (draft.quantity === null || !Number.isFinite(draft.quantity)) {
    errors.quantity = "수량을 입력해주세요";
  } else if (draft.quantity <= 0) {
    errors.quantity = "0보다 큰 수량을 입력해주세요";
  }

  if (!(UNITS as readonly string[]).includes(draft.unit)) {
    errors.unit = "단위를 선택해주세요";
  }

  const storageOptions = getDraftStorageOptions(draft, snapshot);
  if (draft.storage == null) {
    errors.storage = "보관 방법을 선택해주세요";
  } else if (
    storageOptions &&
    storageOptions.length > 0 &&
    !isStorageSelectable(storageOptions, draft.storage)
  ) {
    errors.storage = "지원되는 보관 방식을 선택해주세요";
  }

  if (
    draft.expirationDate != null &&
    Number.isNaN(draft.expirationDate.getTime())
  ) {
    errors.expirationDate = "소비기한을 선택해주세요";
  }

  return errors;
}

export function getFirstIngredientDraftValidationError(
  draft: IngredientDraft,
  snapshot?: ResolvedSnapshot | null,
): IngredientDraftValidationResult | null {
  const fieldErrors = getIngredientDraftFieldErrors(draft, snapshot);
  for (const field of VALIDATION_FIELD_ORDER) {
    const message = fieldErrors[field];
    if (message) return { field, message, fieldErrors };
  }
  return null;
}

export function isIngredientDraftValid(
  draft: IngredientDraft,
  snapshot?: ResolvedSnapshot | null,
): boolean {
  return getFirstIngredientDraftValidationError(draft, snapshot) === null;
}
