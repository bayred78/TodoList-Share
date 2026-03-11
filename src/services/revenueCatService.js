import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL, PRORATION_MODE } from '@revenuecat/purchases-capacitor';

const RC_API_KEY_GOOGLE = 'goog_uROmLHJcvyXQeyQjsPxOrHgCWpk';

export async function initializeRevenueCat(appUserId) {
    if (!Capacitor.isNativePlatform()) {
        console.warn('RevenueCat은 네이티브 환경(Android/iOS)에서만 동작합니다.');
        return;
    }

    try {
        await Purchases.setLogLevel({ level: LOG_LEVEL.DEBUG });

        if (Capacitor.getPlatform() === 'android') {
            await Purchases.configure({ apiKey: RC_API_KEY_GOOGLE, appUserID: appUserId });
        }
        console.log('RevenueCat initialized for user:', appUserId);
    } catch (e) {
        console.error('Failed to initialize RevenueCat:', e);
    }
}

export async function getStoreProducts(productIds) {
    if (!Capacitor.isNativePlatform()) return [];
    try {
        const { products } = await Purchases.getProducts({ productIdentifiers: productIds });
        return products;
    } catch (e) {
        console.error('Failed to fetch RevenueCat products:', e);
        return [];
    }
}

/**
 * 스토어 상품(StoreProduct) 직접 구매 함수
 * @param {Object} product - RevenueCat StoreProduct 객체
 * @param {string|null} oldProductId - Pro -> Team 업그레이드 시 이전 구독의 Identifier
 */
export async function purchaseStoreProduct(product, oldProductId = null) {
    if (!Capacitor.isNativePlatform()) {
        throw new Error('인앱 결제는 모바일 앱에서만 지원됩니다.');
    }

    try {
        let result;
        if (oldProductId) {
            // 업그레이드(교체) 모드
            result = await Purchases.purchaseStoreProduct({
                product: product,
                googleProductChangeInfo: {
                    oldProductIdentifier: oldProductId,
                    prorationMode: PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION
                }
            });
        } else {
            // 신규 구독
            result = await Purchases.purchaseStoreProduct({ product: product });
        }
        return result;
    } catch (error) {
        const isCancelled = error.userCancelled === true || error.code === 1 || String(error.message).toLowerCase().includes('cancel');
        if (!isCancelled) {
            console.error("Purchase failed", error);
        }
        throw error;
    }
}

export function subscribeToCustomerInfoUpdate(callback) {
    if (!Capacitor.isNativePlatform()) return null;
    return Purchases.addCustomerInfoUpdateListener((customerInfo) => {
        callback(customerInfo);
    });
}

export async function getCustomerInfo() {
    if (!Capacitor.isNativePlatform()) return null;
    try {
        const { customerInfo } = await Purchases.getCustomerInfo();
        return customerInfo;
    } catch (e) {
        console.error('Customer info 획득 실패:', e);
        return null;
    }
}
