import { useEffect, useRef, useState } from 'react';

export default function LeaveWaitlistButton({ promoted, busy, onLeave }) {
  const [confirming, setConfirming] = useState(false);
  const confirmButton = useRef(null);
  const leaveButton = useRef(null);

  useEffect(() => {
    if (confirming) confirmButton.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    leaveButton.current?.focus();
  }

  return (
    <div>
      <button type="button" className="btn btn-secondary" ref={leaveButton} disabled={busy}
        aria-expanded={confirming} onClick={() => setConfirming(!confirming)}>
        {busy ? 'Working…' : promoted ? 'Give up offer' : 'Leave waitlist'}
      </button>
      {confirming && (
        <div role="group" aria-label={promoted ? 'Give up this offer?' : 'Leave this waitlist?'}
          onKeyDown={(event) => { if (event.key === 'Escape') cancel(); }}>
          <p>{promoted ? 'Give up this offer?' : 'Leave this waitlist?'}</p>
          <div className="row">
            <button type="button" className="btn" ref={confirmButton} onClick={() => { setConfirming(false); onLeave(); }}>
              {promoted ? 'Confirm giving up offer' : 'Confirm leaving'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={cancel}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
