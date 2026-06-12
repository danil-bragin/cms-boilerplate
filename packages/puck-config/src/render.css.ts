/** Static CSS for public render components — injected once per page instead of
 *  repeating large inline-style objects on every element (smaller HTML, faster
 *  style recalc, cacheable). Class names are prefixed `pk-` to avoid collisions. */
export const renderCss = `
.pk-card{display:flex;flex-direction:column;border-radius:14px;overflow:hidden;border:1px solid #e6e8f0;background:#fff;text-decoration:none;color:inherit;height:100%;box-shadow:0 1px 2px rgba(16,24,40,.04)}
.pk-card-img{width:100%;aspect-ratio:16/9;object-fit:cover;display:block;background:#eef1f6}
.pk-card-ph{width:100%;aspect-ratio:16/9;background:linear-gradient(135deg,#eef2ff,#e0e7ff)}
.pk-card-body{padding:20px;display:flex;flex-direction:column;gap:8px;flex:1}
.pk-card-h{margin:0;font-size:1.2rem;line-height:1.25;letter-spacing:-.2px}
.pk-card-p{margin:0;color:#5b6072;line-height:1.55;font-size:15px;flex:1}
.pk-card-meta{color:#8a90a2;font-size:13px;margin-top:4px}
.pk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:24px}
`;
