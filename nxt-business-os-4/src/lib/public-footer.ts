// The three outlines follow the X in the supplied NXT Workforce wordmark.
export const businessOsUrl = 'https://nxt-business-os.vercel.app/app';

const nxtPaths = `<path pathLength="100" d="M395 408 L804 30 L685 220 L398 410 Z"/>
        <path pathLength="100" d="M419 139 L515 139 L582 200 L537 237 Z"/>
        <path pathLength="100" d="M615 301 L662 266 L777 366 L777 368 L690 369 Z"/>`;

// The overlay shares the logo image’s original coordinate system.
export const headerBrand = `<span class="header-brand-stack"><img src="/v6/assets/nxt-logo-transparent.png" alt="NXT Workforce Limited" width="1125" height="644"><svg class="header-x" viewBox="0 0 1125 644" aria-hidden="true" focusable="false"><defs><g id="header-x-shape" fill="none" stroke-linejoin="round" stroke-linecap="round">${nxtPaths}</g></defs><use href="#header-x-shape" class="hx-base"/><use href="#header-x-shape" class="hx-run hx-halo"/><use href="#header-x-shape" class="hx-run hx-edge"/></svg></span>`;

export const footerSignature = `<figure class="nxt-footer-signature" aria-label="Animated NXT brand mark">
  <input id="nxt-trace-pause" class="nxt-trace-toggle" type="checkbox" aria-label="Pause site animations">
  <svg class="nxt-trace-art" viewBox="365 0 470 440" aria-hidden="true" focusable="false">
    <defs>
      <g id="nxt-trace-shape" fill="none" stroke-linejoin="round" stroke-linecap="round">
        ${nxtPaths}
      </g>
      <radialGradient id="nxt-trace-lens" gradientUnits="userSpaceOnUse" cx="595" cy="218" r="110">
        <stop stop-color="#f0e4ff"/><stop offset=".48" stop-color="#c293ff"/><stop offset="1" stop-color="#a67aff" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <use href="#nxt-trace-shape" class="nxt-trace-base"/>
    <use href="#nxt-trace-shape" class="nxt-trace-run nxt-trace-halo"/>
    <use href="#nxt-trace-shape" class="nxt-trace-run nxt-trace-trail"/>
    <use href="#nxt-trace-shape" class="nxt-trace-run nxt-trace-head"/>
    <use href="#nxt-trace-shape" class="nxt-trace-pointer" stroke="url(#nxt-trace-lens)"/>
  </svg>
  <label class="nxt-trace-label" for="nxt-trace-pause"><span class="motion-icon" aria-hidden="true"></span></label>
</figure>`;
