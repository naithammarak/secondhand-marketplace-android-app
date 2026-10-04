"""Request models for the PRODUCT-00 product contract."""

import re
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator, model_validator


PRICE_PATTERN = re.compile(r"^(?:0|[1-9]\d{0,9})(?:\.\d{1,2})?$")
PositiveStrictInt = Annotated[StrictInt, Field(gt=0)]


class ProductUploadReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    upload_id: PositiveStrictInt


class ProductImageReference(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image_id: PositiveStrictInt | None = None
    upload_id: PositiveStrictInt | None = None

    @model_validator(mode="after")
    def exactly_one_reference(self):
        if (self.image_id is None) == (self.upload_id is None):
            raise ValueError("ต้องส่ง image_id หรือ upload_id เพียงอย่างเดียว")
        return self


class ProductBrandFields(BaseModel):
    brand_id: PositiveStrictInt | None = None
    brand_name: str | None = Field(default=None, description="ชื่อแบรนด์ที่พิมพ์เอง ส่งแทน brand_id")

    @field_validator("brand_name")
    @classmethod
    def valid_brand_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not 1 <= len(value) <= 255:
            raise ValueError("ชื่อแบรนด์ต้องมีความยาว 1–255 ตัวอักษร")
        try:
            value.encode("utf-8")
        except UnicodeEncodeError:
            raise ValueError("ชื่อแบรนด์ต้องเป็นข้อความ Unicode ที่ถูกต้อง") from None
        return value


class CreateProductRequest(ProductBrandFields):
    model_config = ConfigDict(extra="forbid", json_schema_extra={
        "oneOf": [{"required": ["brand_id"]}, {"required": ["brand_name"]}],
    })

    product_name: str
    description: str
    price: str
    category_id: PositiveStrictInt
    size: str
    condition: Literal["NEW", "LIKE_NEW", "GOOD", "FAIR"]
    sale_type: Literal["FIXED_PRICE"]
    images: list[ProductUploadReference]

    @model_validator(mode="after")
    def exactly_one_brand(self):
        if (self.brand_id is None) == (self.brand_name is None):
            raise ValueError("ต้องส่ง brand_id หรือ brand_name เพียงอย่างเดียว")
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("ไม่อนุญาตให้ส่ง null")
        return self

    @field_validator("product_name")
    @classmethod
    def valid_name(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 255:
            raise ValueError("ชื่อต้องมีความยาว 1–255 ตัวอักษร")
        return value

    @field_validator("description")
    @classmethod
    def valid_description(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 1000:
            raise ValueError("รายละเอียดต้องมีความยาว 1–1000 ตัวอักษร")
        return value

    @field_validator("size")
    @classmethod
    def valid_size(cls, value: str) -> str:
        value = value.strip()
        if not 1 <= len(value) <= 100:
            raise ValueError("ขนาดต้องมีความยาว 1–100 ตัวอักษร")
        return value

    @field_validator("price")
    @classmethod
    def valid_price(cls, value: str) -> str:
        if not isinstance(value, str) or not PRICE_PATTERN.fullmatch(value):
            raise ValueError("ราคาต้องเป็นข้อความทศนิยมบวกไม่เกิน 2 ตำแหน่ง")
        amount = Decimal(value)
        if amount <= 0 or amount > Decimal("9999999999.99"):
            raise ValueError("ราคาต้องมากกว่า 0 และไม่เกิน 9999999999.99")
        return format(amount, ".2f")

    @field_validator("images")
    @classmethod
    def valid_images(cls, value: list[ProductUploadReference]) -> list[ProductUploadReference]:
        if not 1 <= len(value) <= 10:
            raise ValueError("สินค้าต้องมีรูป 1–10 รูป")
        ids = [item.upload_id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("ห้ามใช้ upload_id ซ้ำ")
        return value


class UpdateProductRequest(ProductBrandFields):
    model_config = ConfigDict(extra="forbid")

    product_name: str | None = None
    description: str | None = None
    price: str | None = None
    category_id: PositiveStrictInt | None = None
    size: str | None = None
    condition: Literal["NEW", "LIKE_NEW", "GOOD", "FAIR"] | None = None
    sale_type: Literal["FIXED_PRICE"] | None = None
    images: list[ProductImageReference] | None = None

    @model_validator(mode="after")
    def nonempty_without_nulls(self):
        if not self.model_fields_set:
            raise ValueError("ต้องส่งอย่างน้อยหนึ่งฟิลด์ที่ต้องการแก้ไข")
        null_fields = [name for name in self.model_fields_set if getattr(self, name) is None]
        if null_fields:
            raise ValueError("ไม่อนุญาตให้ส่ง null")
        if {"brand_id", "brand_name"} <= self.model_fields_set:
            raise ValueError("ต้องส่ง brand_id หรือ brand_name เพียงอย่างเดียว")
        return self

    @field_validator("product_name")
    @classmethod
    def valid_optional_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not 1 <= len(value) <= 255:
            raise ValueError("ชื่อต้องมีความยาว 1–255 ตัวอักษร")
        return value

    @field_validator("description")
    @classmethod
    def valid_optional_description(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not 1 <= len(value) <= 1000:
            raise ValueError("รายละเอียดต้องมีความยาว 1–1000 ตัวอักษร")
        return value

    @field_validator("size")
    @classmethod
    def valid_optional_size(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not 1 <= len(value) <= 100:
            raise ValueError("ขนาดต้องมีความยาว 1–100 ตัวอักษร")
        return value

    @field_validator("price")
    @classmethod
    def valid_optional_price(cls, value: str | None) -> str | None:
        if value is None:
            return value
        if not PRICE_PATTERN.fullmatch(value):
            raise ValueError("ราคาต้องเป็นข้อความทศนิยมบวกไม่เกิน 2 ตำแหน่ง")
        amount = Decimal(value)
        if amount <= 0 or amount > Decimal("9999999999.99"):
            raise ValueError("ราคาต้องมากกว่า 0 และไม่เกิน 9999999999.99")
        return format(amount, ".2f")

    @field_validator("images")
    @classmethod
    def valid_replacement_images(
        cls, value: list[ProductImageReference] | None
    ) -> list[ProductImageReference] | None:
        if value is None:
            return value
        if not 1 <= len(value) <= 10:
            raise ValueError("สินค้าต้องมีรูป 1–10 รูป")
        references = [
            ("image", item.image_id) if item.image_id is not None else ("upload", item.upload_id)
            for item in value
        ]
        if len(references) != len(set(references)):
            raise ValueError("ห้ามใช้รูปอ้างอิงซ้ำ")
        return value
