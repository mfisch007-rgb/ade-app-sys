export function MediaCards() {
  return (
    <div className="media-grid">
      <div className="media-card">
        <img src="/brand-mark.png" alt="Brand Mark" onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%230A192F"/><text x="50%" y="50%" fill="%2300F2FE" dominant-baseline="middle" text-anchor="middle">Brand Mark</text></svg>'; }} />
        <p>Brand Mark Token</p>
      </div>
      <div className="media-card">
        <img src="/hero-bg.jpg" alt="Hero Background" onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%230A192F"/><text x="50%" y="50%" fill="%2300F2FE" dominant-baseline="middle" text-anchor="middle">Hero BG</text></svg>'; }} />
        <p>Glassmorphic Backdrop</p>
      </div>
      <div className="media-card">
        <img src="/logo.jpg" alt="Primary Logo" onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%230A192F"/><text x="50%" y="50%" fill="%2300F2FE" dominant-baseline="middle" text-anchor="middle">Primary Logo</text></svg>'; }} />
        <p>Primary Identity Logo</p>
      </div>
      <div className="media-card">
        <img src="/logo2.jpg" alt="Secondary Logo" onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100%" height="100%" fill="%230A192F"/><text x="50%" y="50%" fill="%2300F2FE" dominant-baseline="middle" text-anchor="middle">Secondary Logo</text></svg>'; }} />
        <p>Secondary Emblem</p>
      </div>
    </div>
  );
}
