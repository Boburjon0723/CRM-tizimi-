import { applyErpStoreInboundFromItems } from '@/services/erpStoreInboundApply'

/**
 * CRM dan buyurtma qatorlari bo‘yicha do‘kon (ERP) zaxirasiga to‘g‘ridan-to‘g‘ri kirim.
 * (Asosiy oqim: `erp_inbound_requests` + ERP «Keltirilgan» orqali qabul.)
 */
export async function addStockToErpFromCrmOrder(orderId, orderNumber, items) {
    return applyErpStoreInboundFromItems(orderId, orderNumber, items)
}
