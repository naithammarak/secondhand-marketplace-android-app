import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import {
  addProductImage,
  emptyProductFormValues,
  uploadProductImage,
  validateProductForm,
  type ProductFormValues,
} from '@/products/product-form';
import { Spacing } from '@/constants/theme';
import { pickProductImage } from '@/products/pick-product-image';
import { createImageUploadService } from '@/services/image-upload-service';
import {
  BRAND_OPTIONS,
  CATEGORY_OPTIONS,
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
  submitError?: string | null;
  serverFieldErrors?: Record<string, string>;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
};

const ACCENT = '#96bde9';

const imageUploadService = createImageUploadService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

const productService = createProductService({
  baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
});

const defaultCategories: CategoryOption[] = CATEGORY_OPTIONS.map((name, i) => ({ id: i + 1, name }));
const defaultBrands: BrandOption[] = BRAND_OPTIONS.map((name, i) => ({ id: i + 1, name }));

export function ProductForm({
  mode,
  initialValues,
  submitting,
  submitSuccess,
  submitError,
  serverFieldErrors,
  onSubmit,
}: Props) {
  const [values, setValues] = useState<ProductFormValues>(initialValues ?? emptyProductFormValues);
  const [priceText, setPriceText] = useState(initialValues ? String(initialValues.price) : '');
  const [categories, setCategories] = useState<CategoryOption[]>(defaultCategories);
  const [brands, setBrands] = useState<BrandOption[]>(defaultBrands);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<ReturnType<typeof validateProductForm>>({});

  useEffect(() => {
    let active = true;
    void productService.getCategories().then(list => {
      if (active && list.length > 0) setCategories(list);
    });
    void productService.getBrands().then(list => {
      if (active && list.length > 0) setBrands(list);
    });
    return () => { active = false; };
  }, []);

  const disabled = submitting || submitSuccess;

  async function handleAddImage() {
    setUploadingImage(true);
    setUploadError(null);
    try {
      const picked = await pickProductImage();
      if (picked.status === 'cancelled') return;
      if (picked.status === 'permission-denied') {
        setUploadError('ไม่ได้รับอนุญาตให้เข้าถึงรูปภาพ');
        return;
      }
      const result = await uploadProductImage(() => imageUploadService.uploadImage(picked.file));
      if (result.url) {
        const imageUrl = result.url;
        setValues(current => addProductImage(current, imageUrl));
      } else {
        setUploadError(result.error);
      }
    } finally {
      setUploadingImage(false);
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
      const list = [...current.images];
      const [moved] = list.splice(fromIndex, 1);
      list.splice(toIndex, 0, moved);
      return { ...current, images: list };
    });
  }

  function handleSubmit() {
    const errors = validateProductForm(values, priceText);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void onSubmit({ ...values, price: Number(priceText) });
  }

  const nameError = fieldErrors.name || serverFieldErrors?.name || serverFieldErrors?.product_name;
  const descError = serverFieldErrors?.description;
  const brandError = serverFieldErrors?.brand || serverFieldErrors?.brand_id;
  const sizeError = serverFieldErrors?.size;
  const priceError = fieldErrors.price || serverFieldErrors?.price;
  const categoryError = serverFieldErrors?.category || serverFieldErrors?.category_id;
  const conditionError = serverFieldErrors?.condition;
  const imagesError = serverFieldErrors?.images || serverFieldErrors?.photos || serverFieldErrors?.product_images;

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>ชื่อสินค้า *</Text>
        <TextInput
          style={[styles.input, nameError && styles.inputError]}
          value={values.name}
          onChangeText={name => setValues(current => ({ ...current, name }))}
          placeholder="เช่น เสื้อยืดสีขาว"
          placeholderTextColor="#9aa3af"
          editable={!disabled}
        />
        {nameError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{nameError}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>รายละเอียด</Text>
        <TextInput
          style={[styles.input, styles.multiline, descError && styles.inputError]}
          value={values.description}
          onChangeText={description => setValues(current => ({ ...current, description }))}
          placeholder="อธิบายสภาพ ตำหนิ หรือรายละเอียดอื่น ๆ"
          placeholderTextColor="#9aa3af"
          multiline
          editable={!disabled}
        />
        {descError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{descError}</Text>}
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
            placeholder="เช่น Uniqlo"
            placeholderTextColor="#9aa3af"
            editable={!disabled}
          />
          <View style={[styles.chipRow, { marginTop: Spacing.one }]}>
            {brands.map(option => {
              const isSelected = values.brandId ? values.brandId === option.id : values.brand === option.name;
              return (
                <TouchableOpacity
                  key={option.id}
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
          {brandError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{brandError}</Text>}
        </View>
        <View style={[styles.field, styles.rowItem]}>
          <Text style={styles.label}>ไซซ์</Text>
          <TextInput
            style={[styles.input, sizeError && styles.inputError]}
            value={values.size}
            onChangeText={size => setValues(current => ({ ...current, size }))}
            placeholder="เช่น M, 42"
            placeholderTextColor="#9aa3af"
            editable={!disabled}
          />
          {sizeError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{sizeError}</Text>}
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ราคา *</Text>
        <View style={[styles.priceInputWrapper, priceError && styles.inputError]}>
          <Text style={styles.pricePrefix}>฿</Text>
          <TextInput
            style={styles.priceInput}
            value={priceText}
            onChangeText={setPriceText}
            placeholder="0"
            placeholderTextColor="#9aa3af"
            keyboardType="numeric"
            editable={!disabled}
          />
        </View>
        {priceError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{priceError}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>หมวดหมู่</Text>
        <View style={styles.chipRow}>
          {categories.map(option => {
            const isSelected = values.categoryId ? values.categoryId === option.id : values.category === option.name;
            return (
              <TouchableOpacity
                key={option.id}
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
        {categoryError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{categoryError}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>สภาพสินค้า</Text>
        <View style={styles.chipRow}>
          {CONDITION_OPTIONS.map(option => (
            <TouchableOpacity
              key={option}
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
        {conditionError && <Text accessibilityLiveRegion="polite" style={styles.fieldErrorText}>{conditionError}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>รูปภาพ</Text>
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
            disabled={uploadingImage || disabled}
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

      {submitError && <Text accessibilityLiveRegion="polite" style={styles.formErrorText}>{submitError}</Text>}

      <TouchableOpacity
        style={[styles.submitButton, disabled && !submitSuccess && styles.submitButtonDisabled,
          submitSuccess && styles.submitButtonSuccess]}
        disabled={disabled}
        onPress={handleSubmit}
      >
        {submitting ? (
          <ActivityIndicator color="#fff" />
        ) : submitSuccess ? (
          <Text style={styles.submitButtonText}>✓ สำเร็จ</Text>
        ) : (
          <Text style={styles.submitButtonText}>{mode === 'create' ? 'ลงขายสินค้า' : 'บันทึกการแก้ไข'}</Text>
        )}
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: Spacing.three },
  field: { gap: Spacing.one },
  row: { flexDirection: 'row', gap: Spacing.three },
  rowItem: { flex: 1 },
  label: { fontSize: 14, fontWeight: '600', color: '#33404f' },
  input: {
    borderWidth: 1.5,
    borderColor: '#dce4ee',
    backgroundColor: '#f8fafc',
    borderRadius: Spacing.two,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    fontSize: 16,
    color: '#1a1f27',
  },
  inputError: { borderColor: '#d9534f' },
  multiline: { minHeight: 90, textAlignVertical: 'top' },
  fieldErrorText: { fontSize: 12, color: '#d9534f' },
  priceInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#dce4ee',
    backgroundColor: '#f8fafc',
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  pricePrefix: { fontSize: 16, fontWeight: '700', color: ACCENT, marginRight: Spacing.one },
  priceInput: { flex: 1, paddingVertical: Spacing.two, fontSize: 16, color: '#1a1f27' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  chip: {
    backgroundColor: '#eef3f9',
    borderRadius: 20,
    paddingVertical: Spacing.one + 2,
    paddingHorizontal: Spacing.three,
  },
  chipSelected: { backgroundColor: ACCENT },
  chipText: { fontSize: 14, fontWeight: '500', color: '#4a5568' },
  chipTextSelected: { color: '#ffffff', fontWeight: '700' },
  imageGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  imageTile: {
    width: 90,
    height: 104,
    borderRadius: Spacing.two,
    backgroundColor: '#eef3f9',
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#dce4ee',
    justifyContent: 'space-between',
  },
  imageThumbnail: {
    width: '100%',
    height: 74,
    backgroundColor: '#e2e8f0',
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
  mainBadgeText: { color: '#ffd166', fontSize: 10, fontWeight: '700' },
  setMainButton: {
    position: 'absolute',
    top: 4,
    left: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2,
    zIndex: 2,
    borderWidth: 0.5,
    borderColor: '#cbd5e1',
  },
  setMainButtonText: { color: '#33404f', fontSize: 10, fontWeight: '600' },
  imageRemoveBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#d9534f',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  imageRemoveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 },
  reorderBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 28,
    backgroundColor: '#ffffff',
    paddingHorizontal: 4,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
  },
  reorderBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: '#edf2f7',
  },
  reorderBtnText: {
    fontSize: 11,
    color: '#33404f',
    fontWeight: '700',
  },
  reorderBtnPlaceholder: {
    width: 20,
  },
  addImageTile: {
    width: 90,
    height: 104,
    borderRadius: Spacing.two,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: ACCENT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addImageIcon: { fontSize: 20, color: ACCENT, fontWeight: '700', lineHeight: 22 },
  addImageLabel: { fontSize: 11, color: ACCENT, fontWeight: '600' },
  formErrorText: { fontSize: 13, color: '#d9534f', textAlign: 'center' },
  submitButton: {
    marginTop: Spacing.two,
    backgroundColor: ACCENT,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  submitButtonDisabled: { backgroundColor: '#a9b6c4', shadowOpacity: 0 },
  submitButtonSuccess: { backgroundColor: '#3fa76b' },
  submitButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
