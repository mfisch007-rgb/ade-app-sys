import React, { useState, useRef } from 'react';

export function SecurityChallengeModal({ isOpen, onClose, onSuccess }) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputsRef = useRef([]);

  if (!isOpen) return null;

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);

    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const paste = e.clipboardData.getData('text').trim();
    if (/^\d{6}$/.test(paste)) {
      setDigits(paste.split(''));
      inputsRef.current[5]?.focus();
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const pin = digits.join('');
    if (pin.length !== 6) {
      setErrorMsg('Please enter all 6 digits');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg('');

    try {
      const res = await fetch('/api/v1/auth/pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json();

      if (data.success) {
        localStorage.setItem('ade_jwt_token', data.token);
        localStorage.setItem('ade_auth_level', data.authLevel);
        onSuccess(data);
        onClose();
      } else {
        setErrorMsg(data.error || 'Authentication failed');
        setDigits(['', '', '', '', '', '']);
        inputsRef.current[0]?.focus();
      }
    } catch (err) {
      setErrorMsg('Network error verifying PIN');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box glass-panel" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px', textAlign: 'center' }}>
        <h3 style={{ color: 'var(--accent-cyan)', marginTop: 0 }}>Level 3 Admin Verification</h3>
        <p style={{ color: '#8892B0', fontSize: '0.9rem' }}>Enter 6-Digit Founder PIN to unlock restricted capabilities</p>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', margin: '20px 0' }} onPaste={handlePaste}>
            {digits.map((digit, i) => (
              <input
                key={i}
                ref={el => inputsRef.current[i] = el}
                type="password"
                maxLength="1"
                value={digit}
                onChange={e => handleChange(i, e.target.value)}
                onKeyDown={e => handleKeyDown(i, e)}
                style={{
                  width: '45px',
                  height: '55px',
                  fontSize: '1.5rem',
                  textAlign: 'center',
                  background: 'rgba(0,0,0,0.6)',
                  border: '1px solid var(--accent-cyan)',
                  color: '#FFF',
                  borderRadius: '6px'
                }}
                autoFocus={i === 0}
              />
            ))}
          </div>

          {errorMsg && <div style={{ color: 'var(--accent-coral)', marginBottom: '15px', fontSize: '0.88rem' }}>{errorMsg}</div>}

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
            <button type="button" onClick={onClose} style={{ padding: '8px 16px', background: 'transparent', border: '1px solid #8892B0', color: '#8892B0', borderRadius: '6px', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={isSubmitting} style={{ padding: '8px 20px', background: 'var(--accent-cyan)', border: 'none', color: '#030B1E', fontWeight: 700, borderRadius: '6px', cursor: 'pointer' }}>
              {isSubmitting ? 'Verifying...' : 'Authorize'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
