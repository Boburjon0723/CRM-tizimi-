'use client'

import { useEffect } from 'react'

/**
 * input[type=number]: scroll/wheel qiymatni o‘zgartirmasin;
 * ArrowUp/Down ham o‘chiriladi. Butun CRM uchun global.
 */
export default function DisableNumberInputScroll() {
  useEffect(() => {
    const onWheel = (e) => {
      const t = e.target
      if (!(t instanceof HTMLInputElement)) return
      if (t.type !== 'number') return
      // Blur → wheel qiymatni o‘zgartirmaydi; sahifa scrolli davom etadi
      t.blur()
    }

    const blockKeyStep = (e) => {
      const t = e.target
      if (!(t instanceof HTMLInputElement)) return
      if (t.type !== 'number') return
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
      }
    }

    document.addEventListener('wheel', onWheel, { passive: true, capture: true })
    document.addEventListener('keydown', blockKeyStep, { capture: true })
    return () => {
      document.removeEventListener('wheel', onWheel, { capture: true })
      document.removeEventListener('keydown', blockKeyStep, { capture: true })
    }
  }, [])

  return null
}
