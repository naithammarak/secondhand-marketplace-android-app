import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { ProductForm } from '@/components/product-form';

let mockUploadImage = jest.fn();

jest.mock('@/services/image-upload-service', () => ({
  createImageUploadService: () => ({
    uploadImage: () => mockUploadImage(),
  }),
}));

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
      price: 100,
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
      price: 250,
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

    // 5. Form remains editable and can be submitted with latest values
    const submitButton = screen.getByText('ลงขายสินค้า');
    await act(async () => {
      fireEvent.press(submitButton);
    });

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'เสื้อผ้าที่แก้ระหว่างรออัปโหลด',
        images: [],
      }),
    );
  });
});
