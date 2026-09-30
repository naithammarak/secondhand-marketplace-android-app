import { useTheme } from '@/hooks/use-theme';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  addProductImage,
  emptyProductFormValues,
  MAX_PRODUCT_IMAGES,
  uploadProductImage,
  validateProductImageFile,
  validateProductForm,
  type ProductFieldErrors,
  type ProductFormValues,
} from '@/products/product-form';
import { Fonts, Spacing, type MarketplaceTheme } from '@/constants/theme';
import { pickProductImage } from '@/products/pick-product-image';
import { isProductMockModeEnabled } from '@/products/product-runtime';
import { createImageUploadService } from '@/services/image-upload-service';
import {
  CONDITION_LABELS,
  CONDITION_OPTIONS,
  createProductService,
  type BrandOption,
  type CategoryOption,
} from '@/services/product-service';

export type { ProductFormValues } from '@/products/product-form';

type Props = {
  mode: 'create' | 'edit';
  initialValues?: ProductFormValues;
  submitting?: boolean;
  submitSuccess?: boolean;
  submitDisabled?: boolean;
  submitError?: string | null;
  serverFieldErrors?: Record<string, string>;
  accessToken?: string;
  uploadAbortVersion?: number;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
};



const imageUploadService = createImageUploadService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
  mockMode: isProductMockModeEnabled(),
});

export function syncValuesWithOptions(
  current: ProductFormValues,
  catList: CategoryOption[],
  brandList: BrandOption[],
): ProductFormValues {
  const updated = { ...current };

  // Category sync:
  // Match by name first to ensure the real ID from API is used (e.g. "เสื้อผ้า" -> ID 42 instead of stale 1)
  const matchedCatByName = current.category
    ? catList.find(c => c.name.trim().toLowerCase() === current.category.trim().toLowerCase())
    : undefined;
  const matchedCatById = current.categoryId
    ? catList.find(c => c.id === current.categoryId)
    : undefined;
  const matchedCat = matchedCatByName ?? matchedCatById;

  if (matchedCat) {
    updated.category = matchedCat.name;
    updated.categoryId = matchedCat.id;
  } else if (catList.length > 0 && !current.category) {
    updated.category = catList[0].name;
    updated.categoryId = catList[0].id;
  } else {
    updated.categoryId = undefined;
  }

  // Brand sync:
  const matchedBrandByName = current.brand
    ? brandList.find(b => b.name.trim().toLowerCase() === current.brand.trim().toLowerCase())
    : undefined;
  const matchedBrandById = current.brandId
    ? brandList.find(b => b.id === current.brandId)
    : undefined;
  const matchedBrand = matchedBrandByName ?? matchedBrandById;

  if (matchedBrand) {
    updated.brand = matchedBrand.name;
    updated.brandId = matchedBrand.id;
  } else {
    // If brand is custom/unlisted or empty, assign the real ID of "ไม่ระบุแบรนด์" from database
    const unbranded = brandList.find(b => b.name === 'ไม่ระบุแบรนด์') ?? brandList[0];
    if (unbranded) {
      updated.brandId = unbranded.id;
      updated.brand = unbranded.name;
    }
  }

  return updated;
}

export function ProductForm({
  mode,
  initialValues,
  submitting,
  submitSuccess,
  submitDisabled,
  submitError,
  serverFieldErrors,
  accessToken,
  uploadAbortVersion,
  onSubmit,
}: Props) {
  const theme = useTheme();
  const styles = makeStyles(theme);
  const ACCENT = theme.primary;
  const [values, setValues] = useState<ProductFormValues>(initialValues ?? emptyProductFormValues);
  const [priceText, setPriceText] = useState(initialValues?.price ?? '');
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [brands, setBrands] = useState<BrandOption[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(true);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ProductFieldErrors>({});
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), [accessToken, uploadAbortVersion]);

  const applyLoadedOptions = useCallback((catList: CategoryOption[], brandList: BrandOption[]) => {
    if (catList.length === 0 || brandList.length === 0) {
      setCategories([]);
      setBrands([]);
      setOptionsError(catList.length === 0 ? 'ไม่พบข้อมูลหมวดหมู่สินค้าในระบบ' : 'ไม่พบข้อมูลแบรนด์ในระบบ');
      return;
    }
    setCategories(catList);
    setBrands(brandList);
    setValues(current => syncValuesWithOptions(current, catList, brandList));
  }, []);

  const handleRetryOptions = useCallback(async () => {
    setLoadingOptions(true);
    setOptionsError(null);
    try {
      const [catList, brandList] = await Promise.all([
        productService.getCategories(),
        productService.getBrands(),
      ]);
      applyLoadedOptions(catList, brandList);
    } catch (err) {
      setCategories([]);
      setBrands([]);
      setOptionsError(err instanceof Error ? err.message : 'โหลดหมวดหมู่และแบรนด์ไม่สำเร็จ');
    } finally {
      setLoadingOptions(false);
    }
  }, [applyLoadedOptions]);

  useEffect(() => {
    let active = true;
    Promise.all([
      productService.getCategories(),
      productService.getBrands(),
    ]).then(([catList, brandList]) => {
      if (!active) return;
      applyLoadedOptions(catList, brandList);
      setLoadingOptions(false);
    }).catch(err => {
      if (!active) return;
      setCategories([]);
      setBrands([]);
      setOptionsError(err instanceof Error ? err.message : 'โหลดหมวดหมู่และแบรนด์ไม่สำเร็จ');
      setLoadingOptions(false);
    });
    return () => { active = false; };
  }, [applyLoadedOptions]);

  const disabled = submitting || submitSuccess || submitDisabled;
  const cannotSubmit = disabled || uploadingImage || loadingOptions || !!optionsError || categories.length === 0 || brands.length === 0;

  async function handleAddImage() {
    if (values.images.length >= MAX_PRODUCT_IMAGES || uploadingImage) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploadingImage(true);
    setUploadError(null);
    try {
      const picked = await pickProductImage();
      if (controller.signal.aborted) return;
      if (picked.status === 'cancelled') return;
      if (picked.status === 'permission-denied') {
        setUploadError('ไม่ได้รับอนุญาตให้เข้าถึงรูปภาพ');
        return;
      }
      const fileError = validateProductImageFile(picked.file);
      if (fileError) {
        setUploadError(fileError);
        return;
      }
      const result = await uploadProductImage(() => imageUploadService.uploadImage(picked.file, accessToken, controller.signal));
      if (controller.signal.aborted) return;
      if (result.url) {
        const imageUrl = result.url;
        setValues(current => current.images.length < MAX_PRODUCT_IMAGES ? addProductImage(current, imageUrl) : current);
      } else {
        setUploadError(result.error);
      }
    } finally {
      if (uploadController.current === controller) {
        uploadController.current = null;
        setUploadingImage(false);
      }
    }
  }

  function handleRemoveImage(url: string) {
    setValues(current => ({ ...current, images: current.images.filter(image => image !== url) }));
  }

  function setAsMainImage(url: string) {
    setValues(current => {
      const remaining = current.images.filter(img => img !== url);
      return { ...current, images: [url, ...remaining] };
    });
  }

  function moveImage(fromIndex: number, toIndex: number) {
    setValues(current => {
      if (toIndex < 0 || toIndex >= current.images.length) return current;
      const list = [...current.images];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { ...current, images: list };
    });
  }

  const [showPreview, setShowPreview] = useState(false);

  function handleSubmit() {
    if (cannotSubmit) return;
    const errors = validateProductForm(values, priceText, { categories, brands });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void onSubmit({ ...values, price: priceText });
  }

  const nameError = fieldErrors.name || serverFieldErrors?.name || serverFieldErrors?.product_name;
  const descError = fieldErrors.description || serverFieldErrors?.description;
  const brandError = fieldErrors.brand || serverFieldErrors?.brand || serverFieldErrors?.brand_id;
  const sizeError = fieldErrors.size || serverFieldErrors?.size;
  const priceError = fieldErrors.price || serverFieldErrors?.price;
  const categoryError = fieldErrors.category || serverFieldErrors?.category || serverFieldErrors?.category_id;
  const conditionError = serverFieldErrors?.condition;
  const imagesError = fieldErrors.images || serverFieldErrors?.images || serverFieldErrors?.photos || serverFieldErrors?.product_images;

  const PF_COND_DESC: Record<string, string> = {
    NEW: 'ของใหม่ ยังไม่เคยใช้งาน',
    LIKE_NEW: 'ใช้งานน้อย แทบไม่มีร่องรอย',
    GOOD: 'มีร่องรอยใช้งานเล็กน้อย ใช้งานได้ปกติ',
    FAIR: 'มีร่องรอย/ตำหนิชัดเจน แต่ยังใช้งานได้',
  };

  const numericPrice = parseFloat(priceText) || 0;
  const netPayout = Math.max(0, Math.round(numericPrice * 0.95));

  return (
    <View style={styles.form}>
      {optionsError && (
        <View style={styles.optionsErrorBox}>
          <Text style={styles.optionsErrorText}>{optionsError}</Text>
          <TouchableOpacity
            style={styles.retryOptionsBtn}
            onPress={() => { void handleRetryOptions(); }}
            accessibilityRole="button"
            accessibilityLabel="ลองโหลดตัวเลือกใหม่"
          >
            <Text style={styles.retryOptionsBtnText}>ลองใหม่อีกครั้ง</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Card 1: รูปภาพ */}
      <View style={styles.cardSection}>
        <View style={styles.field}>
          <Text style={styles.cardHeaderTitle}>รูปภาพ * ({values.images.length}/{MAX_PRODUCT_IMAGES})</Text>
          <Text style={styles.optionsInlineLoadingText}>JPEG หรือ PNG ขนาดไม่เกิน 5 MiB ต่อรูป แนบ 1–10 รูป</Text>
          <Text style={styles.tipText}>💡 ถ่ายตำหนิให้ชัด ช่วยให้ขายได้เร็วขึ้น</Text>
          <View style={styles.imageGrid}>
            {values.images.map((url, index) => (
              <View key={url} style={styles.imageTile}>
                <Image source={{ uri: url }} style={styles.imageThumbnail} />

                {index === 0 ? (
                  <View style={styles.mainBadge}>
                    <Text style={styles.mainBadgeText}>★ รูปหลัก</Text>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.setMainButton}
                    onPress={() => setAsMainImage(url)}
                    disabled={disabled}
                    accessibilityRole="button"
                    accessibilityLabel="ตั้งเป็นรูปหลัก"
                  >
                    <Text style={styles.setMainButtonText}>รูปหลัก</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.imageRemoveBadge}
                  onPress={() => handleRemoveImage(url)}
                  disabled={disabled}
                  accessibilityRole="button"
                  accessibilityLabel="ลบรูปภาพ"
                >
                  <Text style={styles.imageRemoveBadgeText}>✕</Text>
                </TouchableOpacity>

                {values.images.length > 1 && (
                  <View style={styles.reorderBar}>
                    {index > 0 ? (
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        onPress={() => moveImage(index, index - 1)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel="เลื่อนรูปไปซ้าย"
                      >
                        <Text style={styles.reorderBtnText}>◀</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.reorderBtnPlaceholder} />
                    )}
                    {index < values.images.length - 1 ? (
                      <TouchableOpacity
                        style={styles.reorderBtn}
                        onPress={() => moveImage(index, index + 1)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityLabel="เลื่อนรูปไปขวา"
                      >
                        <Text style={styles.reorderBtnText}>▶</Text>
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.reorderBtnPlaceholder} />
                    )}
                  </View>
                )}
              </View>
            ))}
            <TouchableOpacity
              style={styles.addImageTile}
              onPress={() => { void handleAddImage(); }}
              disabled={uploadingImage || disabled || values.images.length >= MAX_PRODUCT_IMAGES}
              accessibilityRole="button"
              accessibilityLabel="เพิ่มรูป"
            >
              {uploadingImage ? (
                <ActivityIndicator color={ACCENT} />
              ) : (
                <>
                  <Text style={styles.addImageIcon}>+</Text>
                  <Text style={styles.addImageLabel}>เพิ่มรูป</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
          {uploadError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{uploadError}</Text>}
          {imagesError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{imagesError}</Text>}
        </View>
      </View>

      {/* Card 2: ข้อมูลสินค้า */}
      <View style={styles.cardSection}>
        <Text style={styles.cardHeaderTitle}>ข้อมูลสินค้า</Text>

        <View style={styles.field}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.label}>ชื่อสินค้า *</Text>
            <Text style={styles.counterText}>{values.name.length}/255</Text>
          </View>
          <TextInput
            style={[styles.input, nameError && styles.inputError]}
            value={values.name}
            maxLength={255}
            onChangeText={name => setValues(current => ({ ...current, name }))}
            accessibilityLabel="ชื่อสินค้า"
            placeholder="เช่น เสื้อยืดสีขาว"
            placeholderTextColor={theme.textSecondary}
            editable={!disabled}
          />
          {nameError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{nameError}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>สภาพสินค้า</Text>
          <View style={styles.chipRow}>
            {CONDITION_OPTIONS.map(option => (
              <TouchableOpacity
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: values.condition === option, disabled }}
                style={[styles.chip, values.condition === option && styles.chipSelected]}
                onPress={() => setValues(current => ({ ...current, condition: option }))}
                disabled={disabled}
              >
                <Text style={[styles.chipText, values.condition === option && styles.chipTextSelected]}>
                  {CONDITION_LABELS[option] ?? option}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {PF_COND_DESC[values.condition] && (
            <Text style={styles.condDescText}>{PF_COND_DESC[values.condition]}</Text>
          )}
          {conditionError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{conditionError}</Text>}
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>หมวดหมู่ *</Text>
          {loadingOptions ? (
            <View style={styles.optionsInlineLoading}>
              <ActivityIndicator size="small" color={ACCENT} />
              <Text style={styles.optionsInlineLoadingText}>กำลังโหลดหมวดหมู่...</Text>
            </View>
          ) : categories.length === 0 ? null : (
            <View style={styles.chipRow}>
              {categories.map(option => {
                const isSelected = values.categoryId ? values.categoryId === option.id : values.category === option.name;
                return (
                  <TouchableOpacity
                    key={option.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected, disabled }}
                    style={[styles.chip, isSelected && styles.chipSelected]}
                    onPress={() => setValues(current => ({ ...current, category: option.name, categoryId: option.id }))}
                    disabled={disabled}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                      {option.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
          {categoryError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{categoryError}</Text>}
        </View>

        <View style={styles.row}>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>แบรนด์</Text>
            <TextInput
              style={[styles.input, brandError && styles.inputError]}
              value={values.brand}
              onChangeText={brand => {
                const matched = brands.find(b => b.name.trim().toLowerCase() === brand.trim().toLowerCase());
                setValues(current => ({
                  ...current,
                  brand,
                  brandId: matched ? matched.id : undefined,
                }));
              }}
              accessibilityLabel="แบรนด์"
              placeholder="เช่น Uniqlo"
              placeholderTextColor={theme.textSecondary}
              editable={!disabled && !loadingOptions}
            />
            {loadingOptions ? (
              <View style={styles.optionsInlineLoading}>
                <ActivityIndicator size="small" color={ACCENT} />
                <Text style={styles.optionsInlineLoadingText}>กำลังโหลดแบรนด์...</Text>
              </View>
            ) : brands.length === 0 ? null : (
              <View style={[styles.chipRow, { marginTop: Spacing.one }]}>
                {brands.map(option => {
                  const isSelected = values.brandId ? values.brandId === option.id : values.brand === option.name;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSelected, disabled }}
                      style={[styles.chip, isSelected && styles.chipSelected]}
                      onPress={() => setValues(current => ({ ...current, brand: option.name, brandId: option.id }))}
                      disabled={disabled}
                    >
                      <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                        {option.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {brandError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{brandError}</Text>}
          </View>
          <View style={[styles.field, styles.rowItem]}>
            <Text style={styles.label}>ไซซ์</Text>
            <TextInput
              style={[styles.input, sizeError && styles.inputError]}
              value={values.size}
              onChangeText={size => setValues(current => ({ ...current, size }))}
              accessibilityLabel="ไซซ์"
              placeholder="เช่น M, 42"
              placeholderTextColor={theme.textSecondary}
              editable={!disabled}
            />
            {sizeError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{sizeError}</Text>}
          </View>
        </View>
      </View>

      {/* Card 3: ราคา */}
      <View style={styles.cardSection}>
        <View style={styles.field}>
          <Text style={styles.label}>ราคา *</Text>
          <View style={[styles.priceInputWrapper, priceError && styles.inputError]}>
            <Text style={styles.pricePrefix}>฿</Text>
            <TextInput
              style={styles.priceInput}
              value={priceText}
              onChangeText={setPriceText}
              accessibilityLabel="ราคา (บาท)"
              placeholder="0"
              placeholderTextColor={theme.textSecondary}
              keyboardType="numeric"
              editable={!disabled}
            />
          </View>
          {priceError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{priceError}</Text>}

          {/* Live payout fee box */}
          <View style={styles.netPayoutBox}>
            <Text style={styles.netPayoutLabel}>คุณจะได้รับ <Text style={styles.netPayoutSub}>(หักค่าธรรมเนียม 5%)</Text></Text>
            <Text style={styles.netPayoutValue}>฿{netPayout.toLocaleString()}</Text>
          </View>
          <Text style={styles.saleFormatText}>รูปแบบการขาย: ขายราคาปกติ</Text>
        </View>
      </View>

      {/* Card 4: รายละเอียด */}
      <View style={styles.cardSection}>
        <View style={styles.field}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={styles.label}>รายละเอียด</Text>
            <Text style={styles.counterText}>{values.description.length}/1000</Text>
          </View>
          <TextInput
            style={[styles.input, styles.multiline, descError && styles.inputError]}
            value={values.description}
            maxLength={1000}
            onChangeText={description => setValues(current => ({ ...current, description }))}
            accessibilityLabel="รายละเอียดสินค้า"
            placeholder="อธิบายสภาพ ตำหนิ หรือรายละเอียดอื่น ๆ"
            placeholderTextColor={theme.textSecondary}
            multiline
            editable={!disabled}
          />
          {descError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{descError}</Text>}
        </View>
      </View>

      {submitError && <Text accessibilityLiveRegion="polite" style={styles.formErrorText}>{submitError}</Text>}

      {/* Bottom Action Bar */}
      <View style={styles.bottomBar}>
        <TouchableOpacity
          style={styles.previewBtn}
          onPress={() => setShowPreview(true)}
          accessibilityRole="button"
          accessibilityLabel="ดูตัวอย่าง"
        >
          <Text style={styles.previewBtnText}>ดูตัวอย่าง</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: cannotSubmit, busy: !!submitting }}
          style={[
            styles.submitButton,
            cannotSubmit && !submitSuccess && styles.submitButtonDisabled,
            submitSuccess && styles.submitButtonSuccess,
          ]}
          disabled={cannotSubmit}
          onPress={handleSubmit}
        >
          {submitting ? (
            <ActivityIndicator color={theme.onPrimary} />
          ) : submitSuccess ? (
            <Text style={styles.submitButtonText}>✓ สำเร็จ</Text>
          ) : (
            <Text style={styles.submitButtonText}>{mode === 'create' ? 'ลงขายสินค้า' : 'บันทึกการแก้ไข'}</Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Preview Modal */}
      <Modal visible={showPreview} transparent animationType="fade" onRequestClose={() => setShowPreview(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>ตัวอย่างการ์ดในหน้าแรก</Text>
            <View style={styles.previewCard}>
              {values.images.length > 0 ? (
                <Image source={{ uri: values.images[0] }} style={styles.previewImage} />
              ) : (
                <View style={styles.previewImagePlaceholder}>
                  <Text style={{ fontSize: 36 }}>📷</Text>
                </View>
              )}
              <View style={styles.previewCardBody}>
                <Text style={styles.previewBrand}>{values.brand || 'ไม่ระบุแบรนด์'}</Text>
                <Text style={styles.previewName} numberOfLines={2}>{values.name || 'ชื่อสินค้า'}</Text>
                <Text style={styles.previewPrice}>฿{priceText || '0'}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.closeModalBtn} onPress={() => setShowPreview(false)}>
              <Text style={styles.closeModalBtnText}>ปิด</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (theme: MarketplaceTheme) => StyleSheet.create({
  optionsInlineLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
  },
  optionsInlineLoadingText: {
    fontFamily: Fonts.sans, fontSize: 13,
    color: theme.textSecondary,
  },
  optionsErrorBox: {
    backgroundColor: theme.dangerSoft,
    borderWidth: 1,
    borderColor: theme.danger,
    borderRadius: 10,
    padding: Spacing.three,
    alignItems: 'center',
    gap: Spacing.two,
  },
  optionsErrorText: {
    fontFamily: Fonts.sans, fontSize: 13,
    color: theme.danger,
    textAlign: 'center',
  },
  retryOptionsBtn: {
    backgroundColor: theme.primary,
    borderRadius: Spacing.one + 2,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
  retryOptionsBtnText: {
    color: theme.onPrimary,
    fontFamily: Fonts.sans, fontSize: 13,
    fontWeight: '700',
  },
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowItem: { flex: 1 },
  label: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '600', color: theme.text },
  input: {
    borderWidth: 1.5,
    borderColor: theme.inputBorder,
    backgroundColor: theme.input,
    minHeight: 48, borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontFamily: Fonts.sans, fontSize: 16,
    color: theme.text,
  },
  inputError: { borderColor: theme.danger },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  fieldErrorText: { fontFamily: Fonts.sans, fontSize: 12, color: theme.danger },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: theme.inputBorder,
    backgroundColor: theme.input,
    minHeight: 48, borderRadius: 12,
    paddingHorizontal: Spacing.three,
  },
  pricePrefix: { fontFamily: Fonts.sans, fontSize: 16, fontWeight: '700', color: theme.primary, marginRight: Spacing.one },
  priceInput: { flex: 1, paddingVertical: Spacing.two, fontFamily: Fonts.sans, fontSize: 16, color: theme.text },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    minHeight: 48, justifyContent: 'center',
    borderWidth: 1, borderColor: theme.border,
    backgroundColor: theme.backgroundElement,
    borderRadius: 20,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: { backgroundColor: theme.primary, borderColor: theme.primary },
  chipText: { fontFamily: Fonts.sans, fontSize: 14, fontWeight: '500', color: theme.textSecondary },
  chipTextSelected: { color: theme.onPrimary, fontWeight: '700' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  imageTile: {
    width: 144,
    height: 184,
    borderRadius: 10,
    backgroundColor: theme.backgroundElement,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.border,
    justifyContent: 'space-between',
  },
  imageThumbnail: {
    width: '100%',
    height: 134,
    backgroundColor: theme.border,
  },
  mainBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 2,
  },
  mainBadgeText: { color: '#ffd166', fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700' },
  setMainButton: {
    minHeight: 48, width: 80, justifyContent: 'center',
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: theme.surface,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: theme.border,
  },
  setMainButtonText: { color: theme.text, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '600' },
  imageRemoveBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: theme.danger,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  imageRemoveBadgeText: { color: theme.onDanger, fontFamily: Fonts.sans, fontSize: 12, fontWeight: '700', lineHeight: 14 },
  reorderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 48,
    backgroundColor: theme.surface,
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: theme.border,
  },
  reorderBtn: {
    minHeight: 48, minWidth: 48, alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: theme.backgroundElement,
  },
  reorderBtnText: {
    fontFamily: Fonts.sans, fontSize: 12,
    color: theme.text,
    fontWeight: '700',
  },
  reorderBtnPlaceholder: {
    width: 20,
  },
  addImageTile: {
    width: 144,
    height: 184,
    borderRadius: 10,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: theme.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageIcon: { fontFamily: Fonts.sans, fontSize: 20, color: theme.primary, fontWeight: '700', lineHeight: 22 },
  addImageLabel: { fontFamily: Fonts.sans, fontSize: 12, color: theme.primary, fontWeight: '600' },
  formErrorText: { fontFamily: Fonts.sans, fontSize: 13, color: theme.danger, textAlign: 'center' },
  submitButton: {
    flex: 1,
    backgroundColor: theme.primary,
    borderRadius: 10,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: { backgroundColor: theme.textSecondary, shadowOpacity: 0 },
  submitButtonSuccess: { backgroundColor: theme.success },
  submitButtonText: { color: theme.onPrimary, fontFamily: Fonts.sans, fontSize: 16, fontWeight: '700' },
  cardSection: {
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  cardHeaderTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  tipText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: theme.primary,
    marginTop: 2,
  },
  counterText: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: theme.textSecondary,
  },
  condDescText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 2,
  },
  netPayoutBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.backgroundElement,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    marginTop: Spacing.two,
  },
  netPayoutLabel: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    color: theme.textSecondary,
  },
  netPayoutSub: {
    fontSize: 10,
    color: theme.textSecondary,
  },
  netPayoutValue: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
  },
  saleFormatText: {
    fontFamily: Fonts.sans,
    fontSize: 11,
    color: theme.textSecondary,
    marginTop: 4,
  },
  bottomBar: {
    flexDirection: 'row',
    gap: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  previewBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: theme.backgroundElement,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewBtnText: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '600',
    color: theme.text,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContent: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: theme.surface,
    borderRadius: 20,
    padding: Spacing.four,
    alignItems: 'center',
    gap: Spacing.three,
  },
  modalTitle: {
    fontFamily: Fonts.sans,
    fontSize: 15,
    fontWeight: '700',
    color: theme.text,
  },
  previewCard: {
    width: 180,
    backgroundColor: theme.surface,
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: 16,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: 140,
  },
  previewImagePlaceholder: {
    width: '100%',
    height: 140,
    backgroundColor: theme.backgroundElement,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewCardBody: {
    padding: 10,
    gap: 2,
  },
  previewBrand: {
    fontFamily: Fonts.sans,
    fontSize: 10,
    color: theme.textSecondary,
  },
  previewName: {
    fontFamily: Fonts.sans,
    fontSize: 12,
    fontWeight: '600',
    color: theme.text,
    minHeight: 32,
  },
  previewPrice: {
    fontFamily: Fonts.sans,
    fontSize: 14,
    fontWeight: '700',
    color: theme.primary,
  },
  closeModalBtn: {
    width: '100%',
    paddingVertical: 10,
    backgroundColor: theme.backgroundElement,
    borderRadius: 10,
    alignItems: 'center',
  },
  closeModalBtnText: {
    fontFamily: Fonts.sans,
    fontSize: 13,
    fontWeight: '600',
    color: theme.text,
  },
});
