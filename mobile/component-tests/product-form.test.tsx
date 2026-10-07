import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProductForm, syncValuesWithOptions } from '@/components/product-form';
import { emptyProductFormValues } from '@/products/product-form';

let mockUploadImage = jest.fn();
let mockPickProductImage = jest.fn().mockResolvedValue({ status: 'picked', file: { uri: 'file:///test-image.jpg', type: 'image/jpeg' } });
let mockGetCategories = jest.fn().mockResolvedValue([
  { id: 1, name: 'เสื้อผ้า' },
  { id: 2, name: 'รองเท้า' },
  { id: 10, name: 'หมวดหมู่พิเศษ' },
]);
let mockGetBrands = jest.fn().mockResolvedValue([
  { id: 1, name: 'ไม่ระบุแบรนด์' },
  { id: 2, name: 'Nike' },
  { id: 99, name: 'แบรนด์พิเศษ' },
]);

jest.mock('@/services/image-upload-service', () => ({
  createImageUploadService: () => ({
    uploadImage: () => mockUploadImage(),
  }),
}));

jest.mock('@/products/pick-product-image', () => ({
  pickProductImage: () => mockPickProductImage(),
}));

jest.mock('@/services/product-service', () => {
  const actual = jest.requireActual('@/services/product-service');
  return {
    ...actual,
    createProductService: () => ({
      ...actual.createProductService(),
      getCategories: () => mockGetCategories(),
      getBrands: () => mockGetBrands(),
    }),
  };
});

function deferred() {
  let resolve: (value: any) => void;
  let reject: (reason?: any) => void;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve: resolve!, reject: reject! };
}

describe('ProductForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPickProductImage.mockResolvedValue({ status: 'picked', file: { uri: 'file:///test-image.jpg', type: 'image/jpeg' } });
    mockGetCategories.mockResolvedValue([
      { id: 1, name: 'เสื้อผ้า' },
      { id: 2, name: 'รองเท้า' },
      { id: 10, name: 'หมวดหมู่พิเศษ' },
    ]);
    mockGetBrands.mockResolvedValue([
      { id: 1, name: 'ไม่ระบุแบรนด์' },
      { id: 2, name: 'Nike' },
      { id: 99, name: 'แบรนด์พิเศษ' },
    ]);
  });

  test('preserves a custom brand across option refreshes and clears its stale ID', () => {
    const values = { ...emptyProductFormValues, category: 'เสื้อผ้า', brand: 'แบรนด์ท้องถิ่น', brandId: 2 };
    const synced = syncValuesWithOptions(values, [{ id: 42, name: 'เสื้อผ้า' }], [{ id: 2, name: 'Nike' }]);
    expect(synced).toMatchObject({ brand: 'แบรนด์ท้องถิ่น', brandId: undefined, categoryId: 42 });
    expect(values.brandId).toBe(2);
  });

  test.each(['create', 'edit'] as const)('%s accepts a brand typed outside the options', async mode => {
    const onSubmit = jest.fn();
    render(<ProductForm mode={mode} onSubmit={onSubmit} initialValues={{
      ...emptyProductFormValues, name: 'เสื้อ', description: 'สภาพดี', size: 'M', price: '250',
      category: 'เสื้อผ้า', brand: 'Nike', brandId: 2, images: ['mock://brand-test.jpg'],
    }} />);
    await act(async () => {});
    fireEvent.changeText(screen.getByLabelText('แบรนด์'), 'แบรนด์ท้องถิ่น');
    await act(async () => {
      fireEvent.press(screen.getByText(mode === 'create' ? 'ลงขายสินค้า' : 'บันทึกการแก้ไข'));
    });
    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ brand: 'แบรนด์ท้องถิ่น', brandId: undefined }));
  });

  test('does not start an upload if the account changes while the picker is open', async () => {
    const picker = deferred();
    mockPickProductImage.mockReturnValueOnce(picker.promise);
    const view = render(<ProductForm mode="create" accessToken="old-token" onSubmit={jest.fn()} />);
    await act(async () => { fireEvent.press(screen.getByText('เพิ่มรูป')); });
    view.rerender(<ProductForm mode="create" accessToken="new-token" onSubmit={jest.fn()} />);
    await act(async () => { picker.resolve({ status: 'picked', file: { uri: 'file:///late.jpg', type: 'image/jpeg' } }); });
    expect(mockUploadImage).not.toHaveBeenCalled();
  }, 20_000);

  test('does not start an upload if the form closes while the picker is open', async () => {
    const picker = deferred();
    mockPickProductImage.mockReturnValueOnce(picker.promise);
    const view = render(<ProductForm mode="create" accessToken="seller-token" onSubmit={jest.fn()} />);
    await act(async () => { fireEvent.press(screen.getByText('เพิ่มรูป')); });
    view.unmount();
    await act(async () => { picker.resolve({ status: 'picked', file: { uri: 'file:///late.jpg', type: 'image/jpeg' } }); });
    expect(mockUploadImage).not.toHaveBeenCalled();
  });

  test('preserves user edits and removed images when an image upload resolves', async () => {
    const gate = deferred();
    mockUploadImage.mockReturnValue(gate.promise);
    const onSubmit = jest.fn();

    const initialValues = {
      name: 'ชื่อเริ่มต้น',
      description: 'รายละเอียดเดิม',
      size: 'M',
      condition: 'ใหม่',
      price: '100',
      category: 'เสื้อผ้า',
      brand: 'แบรนด์เดิม',
      images: ['mock://product-images/existing-1.jpg'],
    };

    render(
      <ProductForm
        mode="edit"
        initialValues={initialValues}
        onSubmit={onSubmit}
      />,
    );

    // 1. User starts uploading a new image
    const addImageButton = screen.getByText('เพิ่มรูป');
    await act(async () => {
      fireEvent.press(addImageButton);
    });

    // 2. While upload is in flight, user modifies name, description, and removes the existing image
    const nameInput = screen.getByDisplayValue('ชื่อเริ่มต้น');
    await act(async () => {
      fireEvent.changeText(nameInput, 'ชื่อใหม่ที่เพิ่งแก้');
    });

    const descInput = screen.getByDisplayValue('รายละเอียดเดิม');
    await act(async () => {
      fireEvent.changeText(descInput, 'รายละเอียดที่เพิ่งแก้');
    });

    const removeImageButton = screen.getByText('✕');
    await act(async () => {
      fireEvent.press(removeImageButton);
    });

    // Verify user edits are visible in UI before upload completes
    expect(screen.getByDisplayValue('ชื่อใหม่ที่เพิ่งแก้')).toBeTruthy();
    expect(screen.getByDisplayValue('รายละเอียดที่เพิ่งแก้')).toBeTruthy();
    expect(screen.queryByText('✕')).toBeNull(); // Removed image should no longer have remove button

    // 3. Image upload resolves
    await act(async () => {
      gate.resolve({ url: 'mock://product-images/new-uploaded.jpg' });
      await gate.promise;
    });

    // 4. Verify user edits were NOT overwritten by upload completion
    expect(screen.getByDisplayValue('ชื่อใหม่ที่เพิ่งแก้')).toBeTruthy();
    expect(screen.getByDisplayValue('รายละเอียดที่เพิ่งแก้')).toBeTruthy();
    expect(screen.queryByDisplayValue('ชื่อเริ่มต้น')).toBeNull();
    expect(screen.queryByDisplayValue('รายละเอียดเดิม')).toBeNull();

    // 5. Submit the form to verify latest values passed to onSubmit
    const submitButton = screen.getByText('บันทึกการแก้ไข');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'ชื่อใหม่ที่เพิ่งแก้',
        description: 'รายละเอียดที่เพิ่งแก้',
        images: ['mock://product-images/new-uploaded.jpg'],
      }),
    );
  });

  test('preserves user edits and updates only error when an image upload fails', async () => {
    const gate = deferred();
    mockUploadImage.mockReturnValue(gate.promise);
    const onSubmit = jest.fn();

    const initialValues = {
      name: 'เสื้อผ้าเดิม',
      description: 'เดิม',
      size: 'L',
      condition: 'ใหม่',
      price: '250',
      category: 'เสื้อผ้า',
      brand: 'แบรนด์',
      images: [],
    };

    render(
      <ProductForm
        mode="create"
        initialValues={initialValues}
        onSubmit={onSubmit}
      />,
    );

    // 1. User starts uploading an image
    const addImageButton = screen.getByText('เพิ่มรูป');
    await act(async () => {
      fireEvent.press(addImageButton);
    });

    // 2. While upload is in flight, user changes product name
    const nameInput = screen.getByDisplayValue('เสื้อผ้าเดิม');
    await act(async () => {
      fireEvent.changeText(nameInput, 'เสื้อผ้าที่แก้ระหว่างรออัปโหลด');
    });

    // 3. Image upload fails with network error
    await act(async () => {
      gate.reject(new Error('Network upload failed'));
      try {
        await gate.promise;
      } catch {
        // Expected rejection
      }
    });

    // 4. Verify upload error is shown, but user edits are NOT overwritten
    expect(screen.getByText('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่')).toBeTruthy();
    expect(screen.getByDisplayValue('เสื้อผ้าที่แก้ระหว่างรออัปโหลด')).toBeTruthy();
    expect(screen.queryByDisplayValue('เสื้อผ้าเดิม')).toBeNull();

    // 5. Form remains editable, but cannot be submitted without a required image
    const submitButton = screen.getByText('ลงขายสินค้า');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('กรุณาแนบรูปภาพ 1–10 รูป')).toBeTruthy();
  });

  test('displays serverFieldErrors under each relevant input', async () => {
    const serverFieldErrors = {
      name: 'ชื่อสินค้านี้ถูกใช้แล้ว',
      description: 'คำอธิบายสั้นเกินไป',
      brand: 'ไม่พบแบรนด์นี้',
      size: 'ไซซ์ไม่ถูกต้อง',
      price: 'ราคาต้องมากกว่า 0',
      category: 'หมวดหมู่ไม่ถูกต้อง',
      condition: 'สภาพสินค้าไม่ถูกต้อง',
      images: 'ต้องมีรูปภาพอย่างน้อย 1 รูป',
    };

    render(
      <ProductForm
        mode="create"
        serverFieldErrors={serverFieldErrors}
        onSubmit={jest.fn()}
      />,
    );

    expect(screen.getByText('ชื่อสินค้านี้ถูกใช้แล้ว')).toBeTruthy();
    expect(screen.getByText('คำอธิบายสั้นเกินไป')).toBeTruthy();
    expect(screen.getByText('ไม่พบแบรนด์นี้')).toBeTruthy();
    expect(screen.getByText('ไซซ์ไม่ถูกต้อง')).toBeTruthy();
    expect(screen.getByText('ราคาต้องมากกว่า 0')).toBeTruthy();
    expect(screen.getByText('หมวดหมู่ไม่ถูกต้อง')).toBeTruthy();
    expect(screen.getByText('สภาพสินค้าไม่ถูกต้อง')).toBeTruthy();
    expect(screen.getByText('ต้องมีรูปภาพอย่างน้อย 1 รูป')).toBeTruthy();
  });

  test('supports setting an image as main image and reordering images', async () => {
    const onSubmit = jest.fn();
    const initialValues = {
      name: 'เสื้อยืด 3 รูป',
      description: 'รายละเอียด',
      size: 'M',
      condition: 'NEW',
      price: '200',
      category: 'เสื้อผ้า',
      brand: 'Nike',
      images: ['mock://img-1.jpg', 'mock://img-2.jpg', 'mock://img-3.jpg'],
    };

    render(
      <ProductForm
        mode="edit"
        initialValues={initialValues}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('★ รูปหลัก')).toBeTruthy();
    const setMainButtons = screen.getAllByText('รูปหลัก');
    expect(setMainButtons.length).toBe(2);

    await act(async () => {
      fireEvent.press(setMainButtons[0]);
    });

    const submitButton = screen.getByText('บันทึกการแก้ไข');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ['mock://img-2.jpg', 'mock://img-1.jpg', 'mock://img-3.jpg'],
      }),
    );
  });

  test('supports reordering images with left and right buttons', async () => {
    const onSubmit = jest.fn();
    const initialValues = {
      name: 'เสื้อยืดสลับรูป',
      description: 'รายละเอียด',
      size: 'L',
      condition: 'GOOD',
      price: '300',
      category: 'เสื้อผ้า',
      brand: 'Adidas',
      images: ['mock://img-A.jpg', 'mock://img-B.jpg'],
    };

    render(
      <ProductForm
        mode="edit"
        initialValues={initialValues}
        onSubmit={onSubmit}
      />,
    );

    const moveRightBtn = screen.getByText('▶');
    await act(async () => {
      fireEvent.press(moveRightBtn);
    });

    const submitButton = screen.getByText('บันทึกการแก้ไข');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        images: ['mock://img-B.jpg', 'mock://img-A.jpg'],
      }),
    );
  });

  test('updates categoryId and brandId when selecting dynamic option chips', async () => {
    const onSubmit = jest.fn();

    render(
      <ProductForm
        mode="create"
        initialValues={{ ...emptyProductFormValues, description: 'รายละเอียดสินค้า', size: 'M', images: ['mock://img.jpg'] }}
        onSubmit={onSubmit}
      />,
    );

    const specialCat = await screen.findByText('หมวดหมู่พิเศษ');
    const specialBrand = await screen.findByText('แบรนด์พิเศษ');

    await act(async () => {
      fireEvent.press(specialCat);
      fireEvent.press(specialBrand);
    });

    const nameInput = screen.getByPlaceholderText('เช่น เสื้อยืดสีขาว');
    const priceInput = screen.getByPlaceholderText('0');

    await act(async () => {
      fireEvent.changeText(nameInput, 'สินค้าใหม่เอี่ยม');
      fireEvent.changeText(priceInput, '550');
    });

    const submitBtn = screen.getByText('ลงขายสินค้า');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'สินค้าใหม่เอี่ยม',
        price: '550',
        category: 'หมวดหมู่พิเศษ',
        categoryId: 10,
        brand: 'แบรนด์พิเศษ',
        brandId: 99,
      }),
    );
  });

  test('binds initial category name to real API ID instead of stale default ID', async () => {
    mockGetCategories.mockResolvedValueOnce([
      { id: 42, name: 'เสื้อผ้า' },
      { id: 43, name: 'รองเท้า' },
    ]);
    mockGetBrands.mockResolvedValueOnce([
      { id: 101, name: 'ไม่ระบุแบรนด์' },
      { id: 102, name: 'Nike' },
    ]);

    const onSubmit = jest.fn();
    const initialValues = {
      name: 'เสื้อยืดตัวอย่าง',
      description: 'คำอธิบาย',
      size: 'M',
      condition: 'NEW',
      price: '290',
      category: 'เสื้อผ้า',
      brand: 'ไม่ระบุแบรนด์',
      images: ['mock://img.jpg'],
    };

    render(
      <ProductForm
        mode="create"
        initialValues={initialValues}
        onSubmit={onSubmit}
      />,
    );

    // Wait for options to load and category chip to appear
    await screen.findByText('เสื้อผ้า');

    const submitBtn = screen.getByText('ลงขายสินค้า');
    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'เสื้อยืดตัวอย่าง',
        price: '290',
        category: 'เสื้อผ้า',
        categoryId: 42,
        brand: 'ไม่ระบุแบรนด์',
        brandId: 101,
      }),
    );
  });

  test('displays error and retry button when loading options fails, and allows submission after retry', async () => {
    mockGetCategories.mockRejectedValueOnce(new Error('503 Service Unavailable'));
    const onSubmit = jest.fn();

    render(
      <ProductForm
        mode="create"
        initialValues={{ ...emptyProductFormValues, description: 'รายละเอียดสินค้า', size: 'M', images: ['mock://img.jpg'] }}
        onSubmit={onSubmit}
      />,
    );

    // Error banner should appear
    const errorText = await screen.findByText('503 Service Unavailable');
    expect(errorText).toBeTruthy();

    // Submit button should be disabled
    const submitBtn = screen.getByText('ลงขายสินค้า');
    await act(async () => {
      fireEvent.press(submitBtn);
    });
    expect(onSubmit).not.toHaveBeenCalled();

    // Mock successful retry
    mockGetCategories.mockResolvedValueOnce([
      { id: 42, name: 'เสื้อผ้า' },
      { id: 43, name: 'รองเท้า' },
    ]);
    mockGetBrands.mockResolvedValueOnce([
      { id: 101, name: 'ไม่ระบุแบรนด์' },
    ]);

    const retryBtn = screen.getByText('ลองใหม่อีกครั้ง');
    await act(async () => {
      fireEvent.press(retryBtn);
    });

    // Error banner should disappear and category chip should appear
    await screen.findByText('เสื้อผ้า');
    expect(screen.queryByText('503 Service Unavailable')).toBeNull();

    // Fill in required fields and submit
    const nameInput = screen.getByPlaceholderText('เช่น เสื้อยืดสีขาว');
    const priceInput = screen.getByPlaceholderText('0');
    await act(async () => {
      fireEvent.changeText(nameInput, 'กางเกงยีนส์');
      fireEvent.changeText(priceInput, '790');
    });

    await act(async () => {
      fireEvent.press(submitBtn);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'กางเกงยีนส์',
        price: '790',
        category: 'เสื้อผ้า',
        categoryId: 42,
        brandId: 101,
      }),
    );
  });

  test('blocks submission and offers retry when the brand list is empty', async () => {
    mockGetBrands.mockResolvedValueOnce([]);
    const onSubmit = jest.fn();
    render(<ProductForm mode="create" initialValues={{ ...emptyProductFormValues, images: ['mock://img.jpg'] }} onSubmit={onSubmit} />);

    expect(await screen.findByText('ไม่พบข้อมูลแบรนด์ในระบบ')).toBeTruthy();
    await act(async () => { fireEvent.press(screen.getByText('ลงขายสินค้า')); });
    expect(onSubmit).not.toHaveBeenCalled();

    await act(async () => { fireEvent.press(screen.getByText('ลองใหม่อีกครั้ง')); });
    expect(await screen.findByText('Nike')).toBeTruthy();
  });

  test('disables image picker after ten images', async () => {
    render(<ProductForm mode="edit" initialValues={{
      ...emptyProductFormValues, images: Array.from({ length: 10 }, (_, i) => `mock://img-${i}.jpg`),
    }} onSubmit={jest.fn()} />);
    const add = screen.getByRole('button', { name: 'เพิ่มรูป' });
    expect(add.props.accessibilityState?.disabled ?? add.props.disabled).toBeTruthy();
    await act(async () => { fireEvent.press(add); });
    expect(mockUploadImage).not.toHaveBeenCalled();
  });
});
