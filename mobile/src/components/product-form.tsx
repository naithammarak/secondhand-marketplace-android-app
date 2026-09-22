import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { Spacing } from '@/constants/theme';
import { createImageUploadService } from '@/services/image-upload-service';
import {
  CATEGORY_OPTIONS,
  CONDITION_LABELS,
  CONDITION_OPTIONS,
  type ProductInput,
} from '@/services/product-service';

export type ProductFormValues = ProductInput;

type Props = {
  mode: 'create' | 'edit';
  initialValues?: ProductFormValues;
  submitting?: boolean;
  submitSuccess?: boolean;
  submitError?: string | null;
  onSubmit: (values: ProductFormValues) => void | Promise<void>;
};

const ACCENT = '#96bde9';

const emptyValues: ProductFormValues = {
  name: '',
  description: '',
  size: '',
  condition: CONDITION_OPTIONS[0],
  price: 0,
  category: CATEGORY_OPTIONS[0],
  brand: '',
  images: [],
};

type FieldErrors = { name?: string; price?: string };

const imageUploadService = createImageUploadService();

export function ProductForm({ mode, initialValues, submitting, submitSuccess, submitError, onSubmit }: Props) {
  const [values, setValues] = useState<ProductFormValues>(initialValues ?? emptyValues);
  const [priceText, setPriceText] = useState(initialValues ? String(initialValues.price) : '');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const disabled = submitting || submitSuccess;

  async function handleAddImage() {
    setUploadingImage(true);
    try {
      const uploaded = await imageUploadService.uploadImage();
      setValues(current => ({ ...current, images: [...current.images, uploaded.url] }));
    } finally {
      setUploadingImage(false);
    }
  }

  function handleRemoveImage(url: string) {
    setValues(current => ({ ...current, images: current.images.filter(image => image !== url) }));
  }

  function validate(): FieldErrors {
    const errors: FieldErrors = {};
    if (!values.name.trim()) errors.name = 'กรุณากรอกชื่อสินค้า';
    const price = Number(priceText);
    if (!priceText.trim() || !Number.isFinite(price) || price <= 0) {
      errors.price = 'กรุณากรอกราคาที่มากกว่า 0';
    }
    return errors;
  }

  function handleSubmit() {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void onSubmit({ ...values, price: Number(priceText) });
  }

  return (
    <View style={styles.form}>
      <View style={styles.field}>
        <Text style={styles.label}>ชื่อสินค้า *</Text>
        <TextInput
          style={[styles.input, fieldErrors.name && styles.inputError]}
          value={values.name}
          onChangeText={name => setValues(current => ({ ...current, name }))}
          placeholder="เช่น เสื้อยืดสีขาว"
          placeholderTextColor="#9aa3af"
          editable={!disabled}
        />
        {fieldErrors.name && <Text style={styles.fieldErrorText}>{fieldErrors.name}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>รายละเอียด</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          value={values.description}
          onChangeText={description => setValues(current => ({ ...current, description }))}
          placeholder="อธิบายสภาพ ตำหนิ หรือรายละเอียดอื่น ๆ"
          placeholderTextColor="#9aa3af"
          multiline
          editable={!disabled}
        />
      </View>

      <View style={styles.row}>
        <View style={[styles.field, styles.rowItem]}>
          <Text style={styles.label}>แบรนด์</Text>
          <TextInput
            style={styles.input}
            value={values.brand}
            onChangeText={brand => setValues(current => ({ ...current, brand }))}
            placeholder="เช่น Uniqlo"
            placeholderTextColor="#9aa3af"
            editable={!disabled}
          />
        </View>
        <View style={[styles.field, styles.rowItem]}>
          <Text style={styles.label}>ไซซ์</Text>
          <TextInput
            style={styles.input}
            value={values.size}
            onChangeText={size => setValues(current => ({ ...current, size }))}
            placeholder="เช่น M, 42"
            placeholderTextColor="#9aa3af"
            editable={!disabled}
          />
        </View>
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>ราคา *</Text>
        <View style={[styles.priceInputWrapper, fieldErrors.price && styles.inputError]}>
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
        {fieldErrors.price && <Text style={styles.fieldErrorText}>{fieldErrors.price}</Text>}
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>หมวดหมู่</Text>
        <View style={styles.chipRow}>
          {CATEGORY_OPTIONS.map(option => (
            <TouchableOpacity
              key={option}
              style={[styles.chip, values.category === option && styles.chipSelected]}
              onPress={() => setValues(current => ({ ...current, category: option }))}
              disabled={disabled}
            >
              <Text style={[styles.chipText, values.category === option && styles.chipTextSelected]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
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
      </View>

      <View style={styles.field}>
        <Text style={styles.label}>รูปภาพ</Text>
        <View style={styles.chipRow}>
          {values.images.map(url => (
            <TouchableOpacity
              key={url}
              style={styles.imageTile}
              onPress={() => handleRemoveImage(url)}
              disabled={disabled}
            >
              <Text style={styles.imageTileIcon}>🖼</Text>
              <View style={styles.imageRemoveBadge}>
                <Text style={styles.imageRemoveBadgeText}>✕</Text>
              </View>
            </TouchableOpacity>
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
  imageTile: {
    width: 72,
    height: 72,
    borderRadius: Spacing.two,
    backgroundColor: '#eef3f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageTileIcon: { fontSize: 28 },
  imageRemoveBadge: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#d9534f',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageRemoveBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  addImageTile: {
    width: 72,
    height: 72,
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
