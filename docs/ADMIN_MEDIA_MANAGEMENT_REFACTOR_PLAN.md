# Admin media management refactor plan

## Scope and baseline

The work combines two related concerns: keep the episode editor stable and expose the existing upload, processing, HLS, and storage domain through one administrative media library. The current build was reproduced before this plan was written. Editing episode `cmsflg12j000e2t3zcmhotxeg`, toggling `published` from `false` to `true` and back, and changing the title without saving left the page responsive and preserved the original values.

## Episode editor root cause

The historical editor handler used `setForm({ ...form, published: checked })`. That copied a stale render snapshot while episode details, season selection, and processing-job data could be loaded asynchronously. The editor also treated the API value as an ordinary truthy value, which makes legacy values such as `"false"` unsafe. No effect depending on `form` or `form.published` exists in the corrected editor, and the current reproduction produced no `Maximum update depth exceeded`, `Too many re-renders`, or browser exception.

The corrected implementation is in `EpisodesAdminPage.tsx`: the native checkbox receives a `ChangeEvent<HTMLInputElement>`, reads `event.currentTarget.checked`, and performs a functional state update. `episode-editor.ts` owns a form-specific type, explicit normalization, immutable `withEpisodePublished`, API-to-form mapping, and an explicit update payload. Publication validation computes whether the linked video is ready; it does not write `published` from an effect. The list works differently because it sends literal booleans directly to the bulk endpoint and refreshes only after the request completes.

## Existing multimedia architecture

- `ResumableUpload` records initiated, uploading, assembling, completed, cancelled, expired, and failed upload sessions.
- `MediaFile` records original videos, generated HLS manifests, thumbnails, and subtitles with storage keys and byte sizes.
- `VideoProcessingJob` links input and output media, BullMQ state, FFmpeg stage, progress, generated qualities, HLS and thumbnail keys, optional episode/movie target, retry count, and `retainOriginal`.
- `ObjectStorageService` is the only storage abstraction. It normalizes keys and supports local and S3-compatible drivers.
- `VideoProcessingJobsProvider` is the single frontend source of processing truth and polls every 2.5 seconds only while active jobs exist.
- Episode and movie records retain the published/catalog state and playback URLs. No new Prisma model is required.

## Normalized media library

Add guarded `/api/admin/media` routes backed by the existing models:

- `GET /api/admin/media` returns jobs plus active uploads and unassigned media, with search, content type, status, publication, sorting, and pagination.
- `GET /api/admin/media/:id` returns one normalized item.
- `POST /api/admin/media/:id/cancel` delegates job cancellation to the existing processing service.
- `POST /api/admin/media/:id/retry` delegates the existing bounded retry flow.
- `POST /api/admin/media/:id/publish` validates a completed job, an existing HLS master, and a valid target before publishing.
- `POST /api/admin/media/:id/unpublish` updates the linked episode or movie.
- `DELETE /api/admin/media/:id/hls` deletes only the server-derived `hls/<jobId>` prefix, keeps the original, clears HLS metadata, and unpublishes/clears playback references in one reconciled operation.
- Original deletion remains a separate, stricter action and is rejected when `retainOriginal` is true or the file is still required.

All routes use `JwtAuthGuard` and `AdminGuard`. IDs select database records; clients never submit paths. `normalizeStorageKey` and the fixed `hls/<cuid>` prefix prevent traversal.

## HLS deletion consistency

The service first validates the target and computes byte totals from database/storage metadata. It unpublishes linked content and marks the database output unavailable in a transaction, then deletes the storage prefix. If storage deletion fails, the operation reports failure and records a recoverable job error instead of reporting false success. The original media record and object are never deleted by the HLS action. A confirmation dialog describes playlists, variants, segments, affected content, and estimated bytes.

## UI changes

- Add `Biblioteca multimedia` between Processing and Storage.
- Reuse the global processing provider and refresh it after mutations; do not add a second active-job poller.
- Provide search, type/status/publication filters, sortable columns, pagination, status badges, progress, sizes, resolution/qualities, target links, and contextual actions.
- Require confirmation for cancellation and HLS deletion. Retry and publish/unpublish remain explicit buttons with backend validation.
- Extend dashboard cards with active, failed, completed, unassigned, published, and draft summaries linked to relevant admin pages.
- Extend storage reporting into original, HLS, temporary, and total byte groups without automatic deletion.

## Files expected to change

- Backend video-processing module: new admin media controller, DTOs, service, and tests.
- Storage/admin services: categorized storage statistics and reconciliation helpers.
- Frontend routing, admin shell, media library page, models/helpers, dashboard, storage page, and tests.
- Documentation only; Prisma schema and migrations should remain unchanged unless implementation reveals a missing persistent invariant.

## Risks

- Deleting objects before a database update can leave stale URLs; updating the database first can leave recoverable orphaned objects. The chosen flow favors unavailable content over broken published playback and records deletion failures for reconciliation.
- Existing HLS output is represented by one manifest `MediaFile` whose size is the aggregate generated size. Storage totals must avoid double counting it.
- Historical jobs can have incomplete targets or missing objects. They must remain visible as unassigned/unavailable instead of being silently removed.
- A processing worker can finish while an administrator cancels or deletes output. Status preconditions and transactional updates must reject stale actions.

## Migration and rollback

No schema migration is planned. Existing optional target/output fields are sufficient. Rollback consists of removing the new controller/page/routes; existing processing, upload, and storage data remain unchanged. No migration or rollback deletes files.

## Tests

- Keep editor normalization, immutable toggle, payload, DTO, controller guard, and video-link preservation coverage.
- Backend media tests cover normalization, filters, active upload, completed/unassigned jobs, publish validation, unpublish, retry/cancel delegation, HLS deletion, original preservation, missing object, traversal-resistant server keys, and guards.
- Frontend tests cover filtering, badges/progress, action availability, confirmation dialogs, publish/unpublish, retry/cancel, deletion errors, and responsive empty/loading states.
- Final checks: lint, typecheck, all tests, production build, Prisma format/validate/migrate status, Compose config/build/recreate, health, logs, and non-destructive browser verification.
