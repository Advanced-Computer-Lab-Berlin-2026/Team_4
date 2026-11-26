// ConditionPhotoPanel - Owner: Member 3 - Requirements: 79, 80
// Props: { reservationId, readOnly?, onChange?(photos) }
// Member 5 embeds it on the lender's reservation page; Member 3's damage pages use it read-only as the before/after evidence.
// The server decides who may upload/remove (canUpload / canRemove); photos are private, so they are fetched as blobs.
import useFeedback from '../../feedback/useFeedback';
import { useCallback, useEffect, useId, useState } from 'react';
import Alert from '../../common/Alert';
import Spinner from '../../common/Spinner';
import { getErrorMessage } from '../../../api/axios';
import { getPhotoFile, listPhotos, removePhoto, uploadPhotos } from '../../../api/conditionPhotos.api';
import { MAX_UPLOAD_MB } from '../../../utils/validators';
import { formatDateTime } from '../../../utils/format';
import styles from '../../../styles/sprint2/member3.module.css';

const STAGES = [
  ['pickup', 'At pickup (before)'],
  ['return', 'At return (after)'],
];
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const PER_UPLOAD = 5;

function Thumb({ reservationId, photo, label, canRemove, onRemove }) {
  const { confirm } = useFeedback();
  const [url, setUrl] = useState('');
  const [failed, setFailed] = useState(false);
  const [removing, setRemoving] = useState(false);

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    getPhotoFile(reservationId, photo._id)
      .then((blob) => { if (active) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl); } })
      .catch(() => active && setFailed(true));
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [reservationId, photo._id]);

  const remove = async () => {
    if (!(await confirm({ title: 'Remove condition photo?', description: photo.originalName, confirmLabel: 'Remove photo', danger: true }))) return;
    setRemoving(true);
    try { await onRemove(photo); } finally { setRemoving(false); }
  };

  return (
    <figure className={styles.photo}>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" aria-label={`Open ${label} full size`}>
          <img src={url} alt={label} className={styles.photoImg} />
        </a>
      ) : (
        <div className={styles.photoPlaceholder} role="status">{failed ? 'Unavailable' : 'Loading...'}</div>
      )}
      <figcaption className="muted">{formatDateTime(photo.takenAt)}</figcaption>
      {canRemove && (
        <button type="button" className="btn btn-small btn-danger" onClick={remove} disabled={removing}>
          {removing ? 'Removing...' : 'Remove'}
        </button>
      )}
    </figure>
  );
}

function StageUploader({ reservationId, stage, label, remaining, onUploaded }) {
  const inputId = useId();
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState('');

  const handle = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if (!files.length) return;
    setError('');
    if (files.some((f) => !IMAGE_TYPES.includes(f.type))) return setError('Only JPG, JPEG or PNG photos are allowed');
    if (files.some((f) => f.size > MAX_UPLOAD_MB * 1024 * 1024)) return setError(`Each photo must be at most ${MAX_UPLOAD_MB} MB`);
    if (files.length > Math.min(PER_UPLOAD, remaining)) {
      return setError(`Choose at most ${Math.min(PER_UPLOAD, remaining)} photo${Math.min(PER_UPLOAD, remaining) === 1 ? '' : 's'} at a time`);
    }
    setProgress(0);
    try {
      const { photos } = await uploadPhotos(reservationId, stage, files, setProgress);
      onUploaded(photos);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setProgress(null);
    }
    return undefined;
  };

  return (
    <div className="field">
      <label htmlFor={inputId}>Add {label} photos</label>
      <input id={inputId} type="file" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png" onChange={handle} disabled={progress !== null} />
      <div className="field-hint">JPG or PNG, up to {MAX_UPLOAD_MB} MB each, {PER_UPLOAD} at a time · {remaining} more allowed</div>
      {progress !== null && <progress className={styles.fullWidth} max="100" value={progress} aria-label={`Uploading ${label} photos`}>{progress}%</progress>}
      <Alert variant="error">{error}</Alert>
    </div>
  );
}

export default function ConditionPhotoPanel({ reservationId, readOnly = false, onChange }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    return listPhotos(reservationId).then(setData).catch((err) => setError(getErrorMessage(err)));
  }, [reservationId]);
  useEffect(() => { load(); }, [load]);

  const changed = async (photos) => {
    await load(); // refresh canUpload / canRemove from the server
    onChange?.(photos);
  };

  const remove = async (photo) => {
    try {
      const { photos } = await removePhoto(reservationId, photo._id);
      await changed(photos);
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  if (!data && !error) return <Spinner label="Loading photos..." />;
  if (!data) return <Alert variant="error">{error}</Alert>;

  return (
    <div>
      <Alert variant="error">{error}</Alert>
      {data.locked && !readOnly && <p className="muted">These photos are locked as evidence because a damage report was opened.</p>}
      <div className={styles.photoGroups}>
        {STAGES.map(([stage, label]) => {
          const photos = data.photos[stage];
          return (
            <section key={stage} aria-label={`${label} photos`}>
              <h3>{label}</h3>
              {photos.length === 0 ? <p className="muted">No photos.</p> : (
                <div className={styles.photoGrid}>
                  {photos.map((p, i) => (
                    <Thumb
                      key={p._id}
                      reservationId={reservationId}
                      photo={p}
                      label={`${label} photo ${i + 1}: ${p.originalName}`}
                      canRemove={!readOnly && data.canRemove?.[stage]}
                      onRemove={remove}
                    />
                  ))}
                </div>
              )}
              {!readOnly && data.canUpload[stage] && (
                <StageUploader
                  reservationId={reservationId}
                  stage={stage}
                  label={stage}
                  remaining={data.maxPerStage - photos.length}
                  onUploaded={changed}
                />
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
