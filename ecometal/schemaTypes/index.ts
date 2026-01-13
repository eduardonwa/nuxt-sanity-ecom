import { orderType } from "./documents/order";
import { productType } from "./documents/product";
import { variantType } from "./documents/variant";
import { orderItemType } from "./objects/orderItem";

export const schemaTypes = [
    // documentos
    orderType,
    productType,
    variantType,

    // objects
    orderItemType
]
