export async function fetchCapabilities() {
  const res = await fetch('/api/v1/capabilities');
  return res.json();
}

export async function executeSearch(query) {
  const res = await fetch('/api/v1/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  return res.json();
}

export async function verifyPin(pin) {
  const res = await fetch('/api/v1/auth/pin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pin })
  });
  return res.json();
}
