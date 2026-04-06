/** Xodimlar bo‘limi: menyu orqali kirganda bir marta tekshiriladi (sessionStorage). */
export const EMPLOYEES_SECTION_UNLOCK_KEY = 'crm_employees_section_unlocked_v1'

export function getEmployeesActionPin() {
    return String(
        process.env.NEXT_PUBLIC_XODIMLAR_ACTION_PIN ?? process.env.NEXT_PUBLIC_MOLIYA_DELETE_PIN ?? ''
    ).trim()
}
