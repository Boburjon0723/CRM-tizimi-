import { saveOrder } from '@/app/buyurtmalar/lib/saveOrder'

/** Buyurtmalar2: workspace majburiy, ombor/merge o‘chirilgan (saveOrder ichida). */
export async function saveBuyurtma2Order(args) {
    return saveOrder({
        ...args,
        form: {
            ...(args.form || {}),
            workspace: 'buyurtmalar2',
        },
        mergeSourceAgg: null,
        mergeSourceOrderIds: null,
        mergeArchiveSources: false,
    })
}
