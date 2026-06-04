import { useEffect, useRef } from 'react'

/**
 * useModalA11y — keyboard + focus accessibility for modal dialogs.
 *
 * Designed for use with a native <dialog> element ref (opened via showModal()).
 * The hook will:
 *  1. Call showModal() so the browser activates the top-layer modal.
 *  2. Save the previously-focused element and restore it on unmount.
 *  3. Focus the first focusable descendant (or the dialog itself) on open.
 *  4. Trap Tab / Shift+Tab focus within the dialog while it is open.
 *  5. Wire the native 'cancel' event (browser Escape) to onClose so the React
 *     state stays in sync when the user presses Escape.
 *
 * Usage:
 *   const dialogRef = useRef(null)
 *   useModalA11y(onClose, dialogRef)
 *   <dialog ref={dialogRef} aria-labelledby="title-id" ...>
 *
 * For div-based overlays where native <dialog> would break the visual layout
 * (e.g. a slide-in panel), use useDivModalA11y instead:
 *   const panelRef = useRef(null)
 *   useDivModalA11y(onClose, panelRef)
 *   <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="title-id" ...>
 */

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'textarea:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ')

export default function useModalA11y(onClose, dialogRef) {
  const previouslyFocusedRef = useRef(null)
  // Keep a stable ref to onClose so the keydown handler always calls the
  // current version without needing to be re-registered on every render.
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const el = dialogRef?.current
    if (!el) return

    // 1. Save previously focused element.
    previouslyFocusedRef.current = document.activeElement

    // 2. Open as a top-layer modal (no-op if already open).
    if (typeof el.showModal === 'function' && !el.open) {
      el.showModal()
    }

    // 3. Focus first focusable child, or the dialog itself.
    const focusable = el.querySelectorAll(FOCUSABLE)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus()
    }

    // 4. Tab trap — supplement the browser's native dialog focus containment.
    function handleKeyDown(e) {
      if (e.key === 'Tab') {
        const focusableEls = Array.from(el.querySelectorAll(FOCUSABLE))
        if (focusableEls.length === 0) { e.preventDefault(); return }
        const first = focusableEls[0]
        const last  = focusableEls.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    // 5. Native 'cancel' event fires when user presses Escape on a <dialog>.
    //    Prevent the browser from closing the dialog itself; let React handle it.
    function handleCancel(e) {
      e.preventDefault()
      onCloseRef.current?.()
    }

    el.addEventListener('keydown', handleKeyDown)
    el.addEventListener('cancel',  handleCancel)

    return () => {
      el.removeEventListener('keydown', handleKeyDown)
      el.removeEventListener('cancel',  handleCancel)
      // Close the native dialog if still open.
      if (el.open && typeof el.close === 'function') el.close()
      // Restore focus.
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus() } catch { /* ignore — element may have been removed */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount/unmount
}

/**
 * useDivModalA11y — keyboard + focus accessibility for div-based overlay modals.
 *
 * Use this when native <dialog>/showModal() would change the visual layout
 * (e.g. slide-in panels, full-bleed overlays).  The component keeps its <div>
 * with role="dialog" aria-modal="true" aria-labelledby="…"; this hook adds:
 *  1. Saves previously-focused element and restores it on unmount.
 *  2. Focuses the first focusable descendant (or the panel itself) on open.
 *  3. Traps Tab / Shift+Tab focus within the panel.
 *  4. Listens for Escape on the document and calls onClose.
 *
 * Usage:
 *   const panelRef = useRef(null)
 *   useDivModalA11y(onClose, panelRef)
 *   <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby="title-id" ...>
 */
export function useDivModalA11y(onClose, panelRef) {
  const previouslyFocusedRef = useRef(null)
  const onCloseRef = useRef(onClose)
  useEffect(() => { onCloseRef.current = onClose })

  useEffect(() => {
    const el = panelRef?.current
    if (!el) return

    // 1. Save previously focused element.
    previouslyFocusedRef.current = document.activeElement

    // 2. Focus first focusable child, or the panel itself.
    const focusable = el.querySelectorAll(FOCUSABLE)
    if (focusable.length > 0) {
      focusable[0].focus()
    } else {
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
      el.focus()
    }

    // 3. Tab trap.
    function handleKeyDown(e) {
      if (e.key === 'Tab') {
        const focusableEls = Array.from(el.querySelectorAll(FOCUSABLE))
        if (focusableEls.length === 0) { e.preventDefault(); return }
        const first = focusableEls[0]
        const last  = focusableEls.at(-1)
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault(); last.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault(); first.focus()
        }
      }
    }

    // 4. Escape on document.
    function handleDocKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current?.()
      }
    }

    el.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keydown', handleDocKeyDown)

    return () => {
      el.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keydown', handleDocKeyDown)
      // Restore focus.
      const prev = previouslyFocusedRef.current
      if (prev && typeof prev.focus === 'function') {
        try { prev.focus() } catch { /* ignore */ }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // intentionally run once on mount/unmount
}
