export type ApiStorageType = "실온" | "냉장" | "냉동";

export type MasterCategory = {
  id: number;
  name: string;
};

export type MasterSubCategory = {
  id: number;
  categoryId: number;
  name: string;
};

export type MasterStorageOption = {
  storageType: ApiStorageType;
  minDays: number;
  maxDays: number;
};

export type MasterIngredient = {
  id: number;
  subCategoryId: number;
  name: string;
  storageOptions: MasterStorageOption[];
};

export type MasterResponse = {
  categories: MasterCategory[];
  subCategories: MasterSubCategory[];
  ingredients: MasterIngredient[];
};
