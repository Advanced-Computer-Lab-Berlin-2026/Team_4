import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../common/Icon';
import ActionDialog from './ActionDialog';
import { FeedbackContext } from './useFeedback';
import './feedback.css';

const toastIcons = { success: 'check', error: 'warning', info: 'info' };

function Toast({ item, dismiss }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (hovered || focused || item.kind === 'error') return undefined;
    const timer = setTimeout(() => dismiss(item.id), 6000);
    return () => clearTimeout(timer);
  }, [dismiss, focused, hovered, item]);

  return (
    <div className={'toast toast-' + item.kind} onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}>
      <span className="toast-icon"><Icon name={toastIcons[item.kind]} size={19} /></span>
      <p>{item.message}</p>
      <button type="button" className="toast-dismiss" aria-label="Dismiss notification" onClick={() => dismiss(item.id)}>
        <Icon name="close" size={17} />
      </button>
    </div>
  );
}

export default function FeedbackProvider({ children }) {
  const { key: locationKey } = useLocation();
  const pending = useRef(null);
  const nextId = useRef(0);
  const [request, setRequest] = useState(null);
  const [toasts, setToasts] = useState([]);
  const [announcement, setAnnouncement] = useState(null);

  const finish = useCallback((accepted, value = '') => {
    const active = pending.current;
    if (!active) return;
    pending.current = null;
    setRequest(null);
    active.resolve(accepted ? (active.inputLabel ? value : true) : active.cancelValue);
  }, []);

  useEffect(() => {
    if (request && request.locationKey !== locationKey) finish(false);
  }, [finish, locationKey, request]);

  useEffect(() => () => {
    pending.current?.resolve(pending.current.cancelValue);
    pending.current = null;
  }, []);

  const ask = useCallback((options, cancelValue) => new Promise((resolve) => {
    if (pending.current) {
      resolve(cancelValue);
      return;
    }
    const active = { ...options, resolve, cancelValue, locationKey };
    pending.current = active;
    setRequest(active);
  }), [locationKey]);

  const dismiss = useCallback((id) => setToasts((items) => items.filter((item) => item.id !== id)), []);

  const toast = useCallback((message, kind = 'success') => {
    if (!message) return;
    const item = { id: ++nextId.current, message, kind };
    setToasts((items) => [...items.filter((entry) => entry.message !== message).slice(-2), item]);
    setAnnouncement(item);
  }, []);

  const value = useMemo(() => ({
    confirm: (options) => ask(options, false),
    prompt: (options) => ask(options, null),
    toast,
  }), [ask, toast]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      {request && request.locationKey === locationKey && (
        <ActionDialog title={request.title} description={request.description} confirmLabel={request.confirmLabel}
          cancelLabel={request.cancelLabel} danger={request.danger} inputLabel={request.inputLabel}
          maxLength={request.maxLength} onResolve={finish} />
      )}
      <div className="feedback-announcement" role="status">
        {announcement && <span key={announcement.id}>{announcement.message}</span>}
      </div>
      <div className="toast-stack" role="region" aria-label="Recent feedback" hidden={!toasts.length}>
        {toasts.map((item) => <Toast key={item.id} item={item} dismiss={dismiss} />)}
      </div>
    </FeedbackContext.Provider>
  );
}
