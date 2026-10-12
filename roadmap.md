# Chat refresh
- [x] Repair message history, realtime cache updates, and sending errors; reject non-shareable attachments.
- [x] Add reaction event persistence, replies, copy, and conversation search.
- [x] Restore chat styling, transitions, and mobile chat access.
- [x] Run focused tests, lint, preview build checks, and isolated browser interaction/persistence checks.
- [ ] Verify real account-to-account message delivery and reactions — blocked by unavailable signed-in test session for the existing external authentication service.
- [x] Enable file and voice delivery via Supabase Storage (chat-files bucket, storage_files tracking).
- [ ] Verify encrypted delivery — blocked by missing peer public-key exchange; unsafe self-key fallback now fails explicitly.

# Spec: attachments, identity, sessions, sync
- [x] 5GB per-user storage quota with real-time upload validation (45s video cap, format checks, quota blocking).
- [x] Settings → Storage section: usage metrics, per-type breakdown, individual/bulk delete with instant stats refresh.
- [x] Persistent sessions (Supabase persistSession + autoRefreshToken) and logout only in Settings and header profile dropdown.
- [x] Contacts synced to Supabase per user with realtime updates across devices.
- [ ] Paid storage upgrades (USD tiers, receipts) — blocked: needs payment provider choice (Stripe/Paddle) and seller country.
- [ ] Facial ID verification + blue/gold badges — blocked: needs a facial-recognition provider (e.g. a third-party KYC API) choice and credentials.
