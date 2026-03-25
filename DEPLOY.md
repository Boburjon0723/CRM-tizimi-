# CRM ni Vercel ga deploy qilish

## 1. Loyiha ildizi (eng muhim)

Bu repoda **ildizda** boshqa loyiha bor (`react-scripts` / `vercel.json` → `build`).

**Vercel**da shu CRM ni deploy qilmoqchi bo‘lsangiz:

1. **Project → Settings → General → Root Directory**
2. Qiymat: `CRM-tizimi--master/CRM-tizimi--master`
3. Saqlang va **Redeploy** qiling.

Agar Root Directory **bo‘sh** yoki reponing ildizi bo‘lsa, Vercel **Next CRM** emas, ildizdagi **CRA** loyihasini yig‘adi — `buyurtmalar` dagi o‘zgarishlar **hech qachon** chiqmaydi.

## 2. Yangilanish ko‘rinishi (PWA)

Standart: **service worker yo‘q** (`NEXT_PUBLIC_ENABLE_PWA` o‘rnatilmagan).

- Yangi deploydan keyin brauzer yangi JS ni oladi.
- Offline/PWA kerak bo‘lsa, Vercel Environment Variables ga qo‘ying:

  `NEXT_PUBLIC_ENABLE_PWA` = `true`

  Keyin qayta deploy.

## 3. Eski kesh (bir marta)

Agar ilgari PWA yoqilgan build ochilgan bo‘lsa: brauzerda **Application → Service Workers → Unregister** yoki **Sayt ma’lumotlarini tozalash**.
