// API client for /api/condition-photos - Owner: Member 3 (Sprint 2)
// One function per endpoint; components never call axios directly. Return response.data.
import api from './axios';

/** GET /api/condition-photos/:reservationId - Req 79, 80 -> { photos: { pickup, return }, canUpload, canRemove, maxPerStage, locked } */
export const listPhotos = (reservationId) => api.get(`/condition-photos/${reservationId}`).then((r) => r.data);

/** POST /api/condition-photos/:reservationId/:stage - Req 79 - files: File[] (1-5 JPEG/PNG) -> { photos } */
export const uploadPhotos = (reservationId, stage, files, onProgress) => {
  const data = new FormData();
  for (const file of files) data.append('photos', file);
  return api
    .post(`/condition-photos/${reservationId}/${stage}`, data, {
      onUploadProgress: onProgress && ((e) => e.total && onProgress(Math.round((e.loaded * 100) / e.total))),
    })
    .then((r) => r.data);
};

/** GET /api/condition-photos/:reservationId/:photoId/file - Req 79, 80 - resolves to a Blob */
export const getPhotoFile = (reservationId, photoId) =>
  api.get(`/condition-photos/${reservationId}/${photoId}/file`, { responseType: 'blob' }).then((r) => r.data);

/** DELETE /api/condition-photos/:reservationId/:photoId - Req 79 -> { photos } */
export const removePhoto = (reservationId, photoId) => api.delete(`/condition-photos/${reservationId}/${photoId}`).then((r) => r.data);
