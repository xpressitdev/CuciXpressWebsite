---
name: WhatsApp receipt file share
description: How to attach a real file (PDF/image) to WhatsApp from the web, and the popup-blocker trap in the fallback.
---

# Sharing a file to WhatsApp from the browser

A `wa.me/?text=` link can only carry **text** — it can never attach a file.
To send an actual receipt file you must use the Web Share API
`navigator.share({ files: [File] })`, which on mobile opens the OS share
sheet and lets the user pick WhatsApp (sends the file as a document/photo).
Desktop browsers and WhatsApp Web do **not** support file sharing.

**Why:** users reported the WhatsApp button "only sends text" — that is the
inherent limit of the wa.me link scheme, not a bug in the message body.

**How to apply:**
- Build the file (we generate the receipt PDF with `jspdf`, laid out as text
  in a two-pass measure-then-draw so the page height fits exactly — avoids
  html2canvas and its oklch/Tailwind-gradient rendering problems).
- Probe `navigator.canShare({ files: [...] })` **synchronously, before any
  `await`**, then decide. If unsupported, open the `wa.me` text link
  immediately from the click handler.
- **Popup-blocker trap:** if you `await` (e.g. build the PDF) and only then
  call `window.open(wa.me)` on the failure/unsupported path, browsers treat
  the open as non-user-initiated and block it. The synchronous capability
  probe (with a tiny dummy `File`) keeps the gesture intact for the fallback.
- Swallow `AbortError` from `navigator.share` — that just means the user
  dismissed the share sheet; do not re-open anything.
