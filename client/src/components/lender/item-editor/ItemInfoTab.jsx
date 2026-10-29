// ItemInfoTab - Owner: Member 5 - Requirements: 13, 14
// Props: { item, onSaved } — core fields + photos + category + deposit
//   item = null  -> create form: fields + photos are sent together in one request.
//   item = {...} -> edit form: Save sends only the changed fields; photos are added/removed right away.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link, useBlocker } from 'react-router-dom';
import { createItem, updateItem, addPhotos, removePhoto } from '../../../api/items.api';
import { listCategories } from '../../../api/categories.api';
import { getErrorMessage, getFieldErrors } from '../../../api/axios';
import { MAX_UPLOAD_MB } from '../../../utils/validators';
import { formatMoney } from '../../../utils/format';
import FormField from '../../common/FormField';
import Alert from '../../common/Alert';
import Spinner from '../../common/Spinner';
import './item-editor.css';

// Same limits as the server (items.routes.js). Lengths count like the database does (an emoji counts as 2).
const LIMITS = { title: 120, description: 4000, conditionNotes: 2000 };
const MAX_PHOTOS = 8;
const MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024; // the server rejects a file of exactly this size
const MONEY_REGEX = /^\d{1,7}(\.\d{1,2})?$/;
const MAX_DEPOSIT = 1000000;
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const IMAGE_EXT = /\.(jpe?g|png)$/i;
const FIELDS = ['title', 'description', 'category', 'depositAmount', 'conditionNotes'];

const toForm = (item) => ({
  title: item?.title || '',
  description: item?.description || '',
  category: item?.category?._id || item?.category || '',
  depositAmount: item ? String(item.depositAmount ?? '') : '',
  conditionNotes: item?.conditionNotes || '',
});

// Client-side checks (for quick feedback only - the server checks everything again).
function validate(form) {
  const errs = {};
  const title = form.title.trim();
  if (!title) errs.title = 'Title is required';
  else if (form.title.length > LIMITS.title) errs.title = `Title can be up to ${LIMITS.title} characters`;
  if (!form.description.trim()) errs.description = 'Description is required';
  else if (form.description.length > LIMITS.description) errs.description = `Description can be up to ${LIMITS.description} characters`;
  if (!form.category) errs.category = 'Choose a category';
  const dep = form.depositAmount.trim();
  if (!dep) errs.depositAmount = 'Deposit amount is required';
  else if (!MONEY_REGEX.test(dep) || Number(dep) > MAX_DEPOSIT) {
    errs.depositAmount = `Enter a number from 0 to ${MAX_DEPOSIT.toLocaleString('en')} with at most 2 decimals, e.g. 150 or 150.50`;
  }
  if (form.conditionNotes.length > LIMITS.conditionNotes) errs.conditionNotes = `Condition notes can be up to ${LIMITS.conditionNotes} characters`;
  return errs;
}

// Returns an error message for the first file that is not an acceptable photo, or '' if all are fine.
function checkFiles(files) {
  for (const f of files) {
    if (!IMAGE_TYPES.includes(f.type) || !IMAGE_EXT.test(f.name)) return `"${f.name}" is not a JPG or PNG image`;
    if (f.size >= MAX_BYTES) return `"${f.name}" is too large (max ${MAX_UPLOAD_MB} MB)`;
    if (f.size === 0) return `"${f.name}" is empty`;
  }
  return '';
}

const serverFieldErrors = (err) =>
  getFieldErrors(err).reduce((acc, e) => (e.field && !acc[e.field] ? { ...acc, [e.field]: e.message } : acc), {});

function Counter({ value, max }) {
  const over = value.length > max;
  return <div className={`item-editor-counter ${over ? 'is-over' : ''}`} aria-live={over ? 'polite' : 'off'}>{value.length} / {max}</div>;
}

export default function ItemInfoTab({ item, onSaved }) {
  const isEdit = !!item;
  const formRef = useRef(null);
  const savedNavigation = useRef(false);

  const [form, setForm] = useState(() => toForm(item));
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [focusError, setFocusError] = useState(false);

  const [categories, setCategories] = useState([]);
  const [catsLoading, setCatsLoading] = useState(true);
  const [catsError, setCatsError] = useState('');

  // Create mode: photos chosen but not uploaded yet ({ file, url, key }).
  const [newPhotos, setNewPhotos] = useState([]);
  // Photo actions (edit mode) and photo-picker problems.
  const [photoError, setPhotoError] = useState('');
  const [photoSuccess, setPhotoSuccess] = useState('');
  const [photoBusy, setPhotoBusy] = useState('');

  const baseline = useMemo(() => toForm(item), [item]);
  const changed = FIELDS.filter((f) => form[f] !== baseline[f]);
  const dirty = isEdit ? changed.length > 0 : changed.length > 0 || newPhotos.length > 0;
  const photoCount = isEdit ? item.photos.length : newPhotos.length;
  const busy = saving || !!photoBusy;
  const blocker = useBlocker(({ currentLocation, nextLocation }) =>
    dirty && !savedNavigation.current &&
    (currentLocation.pathname !== nextLocation.pathname || currentLocation.search !== nextLocation.search)
  );

  useEffect(() => {
    listCategories()
      .then((d) => setCategories(d.categories || []))
      .catch((e) => setCatsError(`Could not load categories: ${getErrorMessage(e)}`))
      .finally(() => setCatsLoading(false));
  }, []);

  // When we switch from "new" to a saved item, start the form from the saved values.
  useEffect(() => { savedNavigation.current = false; setForm(toForm(item)); }, [item?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Warn before closing / reloading the tab with unsaved changes.
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // Free the preview images when they are removed or the page closes.
  const previewsRef = useRef(newPhotos);
  previewsRef.current = newPhotos;
  useEffect(() => () => previewsRef.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  // After a failed save, move keyboard focus to the first invalid field.
  useEffect(() => {
    if (!focusError) return;
    formRef.current?.querySelector('[aria-invalid="true"]')?.focus();
    setFocusError(false);
  }, [focusError]);

  // The item's current category may have been deactivated by an admin - still show it so the select isn't blank.
  const categoryOptions = useMemo(() => {
    const current = item?.category;
    if (current?._id && !categories.some((c) => c._id === current._id)) {
      return [...categories, { _id: current._id, name: `${current.name} (no longer available)` }];
    }
    return categories;
  }, [categories, item]);

  const setField = (name) => (e) => {
    const { value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setErrors((errs) => (errs[name] ? { ...errs, [name]: undefined } : errs));
    setSuccess('');
  };

  // ---------- photos ----------
  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // so the same file can be picked again
    if (!files.length) return;
    setPhotoError('');
    setPhotoSuccess('');
    setErrors((errs) => ({ ...errs, photos: undefined }));

    const left = MAX_PHOTOS - photoCount;
    if (files.length > left) {
      setPhotoError(left === 0 ? `An item can have up to ${MAX_PHOTOS} photos.` : `An item can have up to ${MAX_PHOTOS} photos. You can add ${left} more.`);
      return;
    }
    const bad = checkFiles(files);
    if (bad) { setPhotoError(bad); return; }

    if (!isEdit) {
      setNewPhotos((list) => [...list, ...files.map((file) => ({ file, url: URL.createObjectURL(file), key: `${file.name}-${file.lastModified}-${Math.random()}` }))]);
      return;
    }
    const fd = new FormData();
    files.forEach((f) => fd.append('photos', f));
    setPhotoBusy('add');
    try {
      const d = await addPhotos(item._id, fd);
      onSaved(d.item);
      setPhotoSuccess(files.length === 1 ? 'Photo added' : `${files.length} photos added`);
    } catch (err) {
      setPhotoError(getErrorMessage(err));
    } finally {
      setPhotoBusy('');
    }
  };

  const onRemoveNew = (key) => {
    setNewPhotos((list) => {
      const p = list.find((x) => x.key === key);
      if (p) URL.revokeObjectURL(p.url);
      return list.filter((x) => x.key !== key);
    });
    setPhotoError('');
  };

  const onRemoveSaved = async (photo, index) => {
    if (!window.confirm(`Remove photo ${index + 1}${index === 0 ? ' (the cover photo)' : ''}?`)) return;
    setPhotoError('');
    setPhotoSuccess('');
    setPhotoBusy(photo._id);
    try {
      const d = await removePhoto(item._id, photo._id);
      onSaved(d.item);
      setPhotoSuccess('Photo removed');
    } catch (err) {
      setPhotoError(getErrorMessage(err));
    } finally {
      setPhotoBusy('');
    }
  };

  // ---------- save ----------
  const onSubmit = async (e) => {
    e.preventDefault();
    setFormError('');
    setSuccess('');
    const errs = validate(form);
    if (!isEdit && newPhotos.length === 0) errs.photos = 'Add at least one photo';
    if (Object.keys(errs).length) {
      setErrors(errs);
      setFormError('Please fix the highlighted fields.');
      setFocusError(true);
      return;
    }
    if (isEdit && changed.length === 0) { setSuccess('No changes to save'); return; }

    setSaving(true);
    try {
      if (isEdit) {
        const body = Object.fromEntries(changed.map((f) => [f, form[f].trim()]));
        const d = await updateItem(item._id, body);
        onSaved(d.item);
        setForm(toForm(d.item));
        setErrors({});
        setSuccess('Changes saved');
      } else {
        const fd = new FormData();
        FIELDS.forEach((f) => fd.append(f, form[f].trim()));
        newPhotos.forEach((p) => fd.append('photos', p.file));
        const d = await createItem(fd);
        newPhotos.forEach((p) => URL.revokeObjectURL(p.url));
        setNewPhotos([]);
        savedNavigation.current = true; // successful creation must not block its edit redirect
        onSaved(d.item); // the page then opens the edit URL of the new item
      }
    } catch (err) {
      const fieldErrs = serverFieldErrors(err);
      setErrors(fieldErrs);
      if (fieldErrs.photos) setPhotoError('');
      // Field problems are shown under each field; the alert above Save just points to them.
      setFormError(Object.keys(fieldErrs).length ? 'Please fix the highlighted fields.' : getErrorMessage(err));
      if (Object.keys(fieldErrs).length) setFocusError(true);
    } finally {
      setSaving(false);
    }
  };

  const depositPreview = MONEY_REGEX.test(form.depositAmount.trim()) && Number(form.depositAmount) <= MAX_DEPOSIT
    ? formatMoney(form.depositAmount) : '';

  return (
    <form ref={formRef} className="card item-editor-form" onSubmit={onSubmit} noValidate>
      {blocker.state === 'blocked' && createPortal(
        <div className="item-leave-overlay">
          <div className="card item-leave-dialog" role="alertdialog" aria-modal="true" aria-labelledby="item-leave-title" aria-describedby="item-leave-message"
            onKeyDown={(e) => {
              if (e.key === 'Escape') { e.preventDefault(); blocker.reset(); }
              if (e.key === 'Tab') {
                const buttons = e.currentTarget.querySelectorAll('button');
                if (e.shiftKey && document.activeElement === buttons[0]) { e.preventDefault(); buttons[1].focus(); }
                else if (!e.shiftKey && document.activeElement === buttons[1]) { e.preventDefault(); buttons[0].focus(); }
              }
            }}>
            <h2 id="item-leave-title">Leave without saving?</h2>
            <p id="item-leave-message">Your unsaved changes will be lost.</p>
            <div className="row">
              <button type="button" className="btn btn-secondary" autoFocus onClick={() => blocker.reset()}>Stay and keep editing</button>
              <button type="button" className="btn btn-danger" onClick={() => blocker.proceed()}>Leave without saving</button>
            </div>
          </div>
        </div>, document.body
      )}
      <div className="card-body">
        <FormField label="Title" error={errors.title}>
          <input type="text" value={form.title} onChange={setField('title')} autoComplete="off" />
        </FormField>
        <Counter value={form.title} max={LIMITS.title} />

        <FormField label="Category" error={errors.category || catsError}
          hint={catsLoading ? 'Loading categories...' : undefined}>
          <select value={form.category} onChange={setField('category')} disabled={catsLoading && !categoryOptions.length}>
            <option value="">{catsLoading ? 'Loading...' : 'Choose a category'}</option>
            {categoryOptions.map((c) => <option key={c._id} value={c._id}>{c.name}</option>)}
          </select>
        </FormField>

        <FormField label="Deposit (EGP)" error={errors.depositAmount}
          hint={depositPreview ? `Borrowers will see: ${depositPreview}` : 'For example 150 or 150.50'}>
          <input type="text" inputMode="decimal" value={form.depositAmount} onChange={setField('depositAmount')} autoComplete="off" />
        </FormField>

        <FormField label="Description" error={errors.description}>
          <textarea value={form.description} onChange={setField('description')} />
        </FormField>
        <Counter value={form.description} max={LIMITS.description} />

        <FormField label="Condition notes (optional)" error={errors.conditionNotes}
          hint="Scratches, missing parts or anything a borrower should know">
          <textarea value={form.conditionNotes} onChange={setField('conditionNotes')} />
        </FormField>
        <Counter value={form.conditionNotes} max={LIMITS.conditionNotes} />

        <fieldset className="item-editor-photos" aria-describedby="item-photos-hint">
          <legend>Photos <span className="muted">({photoCount} of {MAX_PHOTOS})</span></legend>
          <p id="item-photos-hint" className="field-hint">
            JPG or PNG, max {MAX_UPLOAD_MB} MB each, up to {MAX_PHOTOS} photos. The first photo is the cover shown in the catalog.
            {isEdit && ' Photo changes are saved right away.'}
          </p>

          {photoCount === 0 && <p className="muted">No photos yet. Add at least one.</p>}
          {photoCount > 0 && (
            <ul className="item-editor-photo-grid">
              {isEdit
                ? item.photos.map((p, i) => (
                  <li key={p._id} className="item-editor-photo">
                    <div className="item-editor-photo-media">
                      <img src={p.url} alt={`${item.title} - photo ${i + 1}`} loading="lazy" />
                      {i === 0 && <span className="badge badge-grey item-editor-cover">Cover photo</span>}
                    </div>
                    <button type="button" className="btn btn-danger btn-small" disabled={busy || item.photos.length === 1}
                      onClick={() => onRemoveSaved(p, i)} aria-label={`Remove photo ${i + 1}`}>
                      {photoBusy === p._id ? 'Removing...' : 'Remove'}
                    </button>
                  </li>
                ))
                : newPhotos.map((p, i) => (
                  <li key={p.key} className="item-editor-photo">
                    <div className="item-editor-photo-media">
                      <img src={p.url} alt={`Selected photo ${i + 1}: ${p.file.name}`} />
                      {i === 0 && <span className="badge badge-grey item-editor-cover">Cover photo</span>}
                    </div>
                    <div className="item-editor-photo-name" title={p.file.name}>{p.file.name}</div>
                    <button type="button" className="btn btn-danger btn-small" disabled={busy}
                      onClick={() => onRemoveNew(p.key)} aria-label={`Remove ${p.file.name}`}>Remove</button>
                  </li>
                ))}
            </ul>
          )}
          {isEdit && item.photos.length === 1 && <p className="field-hint">An item needs at least one photo. Add another one before removing this one.</p>}

          {photoCount < MAX_PHOTOS ? (
            <FormField label={photoBusy === 'add' ? 'Uploading...' : 'Add photos'} error={errors.photos}>
              <input type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" multiple
                onChange={onPickFiles} disabled={busy} />
            </FormField>
          ) : (
            <>
              <p className="muted">You have reached the limit of {MAX_PHOTOS} photos.</p>
              {errors.photos && <div className="field-error">{errors.photos}</div>}
            </>
          )}
          <Alert variant="error">{photoError}</Alert>
          <Alert variant="success">{photoSuccess}</Alert>
        </fieldset>

        <Alert variant="error">{formError}</Alert>
        <Alert variant="success">{success}</Alert>
        <div className="row item-editor-actions">
          <button type="submit" className="btn" disabled={busy}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Save item'}
          </button>
          <Link to="/lender/items" className="btn btn-secondary">Back to my items</Link>
        </div>
      </div>
    </form>
  );
}
