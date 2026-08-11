export function B12HeroApex() {
  return (
    <svg
      aria-labelledby="b12-apex-title b12-apex-desc"
      className="b12-apex"
      role="img"
      viewBox="0 0 760 600"
    >
      <title id="b12-apex-title">Clervo Apex Core</title>
      <desc id="b12-apex-desc">
        A solid faceted mechanism. A red agent task enters, cyan qualification selects a route, and gold exits after verification.
      </desc>
      <defs>
        <radialGradient id="b12-halo">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".66" />
          <stop offset=".34" stopColor="#ffffff" stopOpacity=".15" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="b12-face1" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#161616" />
          <stop offset="1" stopColor="#020202" />
        </linearGradient>
        <linearGradient id="b12-face2" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#090909" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
        <filter height="300%" id="b12-glow" width="300%" x="-100%" y="-100%">
          <feGaussianBlur stdDeviation="9" />
        </filter>
      </defs>

      <ellipse className="b12-halo" cx="380" cy="294" rx="215" ry="215" />
      <ellipse className="b12-shadow" cx="380" cy="522" rx="195" ry="25" />
      <path className="b12-body-main" d="M402 91 147 517h510L402 91Z" />
      <path className="b12-body-left" d="M402 91 372 108 117 534l30-17L402 91Z" />
      <path className="b12-body-right" d="M372 108 402 91l255 426-30 17-255-426Z" />
      <path className="b12-body-bottom" d="M117 534h510l30-17H147l-30 17Z" />
      <path className="b12-face-1" d="M372 108 249 313l123 18Z" />
      <path className="b12-face-2" d="M372 108v223l123-18Z" />
      <path className="b12-face-3" d="M249 313 117 534l255-203Z" />
      <path className="b12-face-4" d="M117 534h255V331L117 534Z" />
      <path className="b12-face-5" d="M372 331v203h255L372 331Z" />
      <path className="b12-face-6" d="M495 313 372 331l255 203-132-221Z" />
      <g aria-hidden="true">
        <path className="b12-route" d="M183 393 303 291 372 331" />
        <path className="b12-route" d="M169 420 292 327 372 331" />
        <path className="b12-route" d="M155 447 300 366 372 331" />
        <path className="b12-route" d="M155 474 304 407 372 331" />
        <path className="b12-route" d="M169 501 321 449 372 331" />
        <path className="b12-route b12-route-selected" d="M183 520 343 475 372 331 480 389 566 462" />
      </g>
      <path className="b12-edge-left" d="M372 108 117 534" />
      <path className="b12-edge-right" d="M372 108 627 534" />
      <path className="b12-edge-base" d="M117 534h510" />
      <path className="b12-edge-depth" d="M402 91 657 517H147L402 91Z" />
      <g aria-hidden="true" className="b12-signal b12-request">
        <path className="b12-signal-glow" d="M0 331h286" />
        <path className="b12-signal-line" d="M0 331h286" />
        <circle cx="8" cy="331" r="4" />
      </g>
      <g aria-hidden="true" className="b12-signal b12-qualify">
        <path className="b12-signal-glow" d="M286 331h174" />
        <path className="b12-signal-line" d="M286 331h174" />
        <circle cx="372" cy="331" r="5" />
      </g>
      <g aria-hidden="true" className="b12-signal b12-outcome">
        <path className="b12-signal-glow" d="M460 331h300" />
        <path className="b12-signal-line" d="M460 331h300" />
        <circle cx="752" cy="331" r="4" />
      </g>
    </svg>
  );
}
