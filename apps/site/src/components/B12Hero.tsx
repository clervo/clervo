import { useEffect, useState } from 'react';

import { launchState } from '../product';
import { Link } from '../router';

function useOpeningSequence() {
  const [active, setActive] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setActive(true);
      return;
    }
    const frame = requestAnimationFrame(() => setActive(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return active;
}

function DesktopApex({ verified }: { verified: boolean }) {
  const active = useOpeningSequence();
  return (
    <svg
      className={`b12-opening__machine b12-opening__machine--desktop${active ? ' is-active' : ''}${verified ? ' is-verified' : ''}`}
      viewBox="-820 -500 1640 1000"
      role="img"
      aria-labelledby="b12-desktop-machine-title b12-desktop-machine-desc"
    >
      <title id="b12-desktop-machine-title">Clervo outcome mechanism</title>
      <desc id="b12-desktop-machine-desc">
        A red request enters a dark dimensional Apex, cyan qualification paths resolve inside,
        and a verified gold proof object emerges.
      </desc>
      <defs>
        <linearGradient id="b12d-left" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#0b0c0e" />
          <stop offset=".18" stopColor="#292f33" />
          <stop offset=".34" stopColor="#090a0b" />
          <stop offset=".74" stopColor="#020202" />
          <stop offset="1" stopColor="#171a1d" />
        </linearGradient>
        <linearGradient id="b12d-right" x1="0" y1="0" x2=".8" y2="1">
          <stop stopColor="#f0f4f2" stopOpacity=".78" />
          <stop offset=".055" stopColor="#4c5559" stopOpacity=".72" />
          <stop offset=".17" stopColor="#15191b" />
          <stop offset=".57" stopColor="#040505" />
          <stop offset="1" stopColor="#202529" />
        </linearGradient>
        <linearGradient id="b12d-inner" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#020303" />
          <stop offset=".52" stopColor="#051214" />
          <stop offset="1" stopColor="#020303" />
        </linearGradient>
        <linearGradient id="b12d-red" x1="0" x2="1">
          <stop stopColor="#ff3b30" stopOpacity="0" />
          <stop offset=".42" stopColor="#ff3b30" stopOpacity=".28" />
          <stop offset=".82" stopColor="#ff3b30" stopOpacity=".8" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
        <linearGradient id="b12d-cyan" x1="0" x2="1">
          <stop stopColor="#00e5ff" stopOpacity=".12" />
          <stop offset=".55" stopColor="#00e5ff" stopOpacity=".82" />
          <stop offset="1" stopColor="#f2ffff" />
        </linearGradient>
        <linearGradient id="b12d-gold" x1="0" x2="1">
          <stop stopColor="#fff" />
          <stop offset=".22" stopColor="#ffc800" />
          <stop offset="1" stopColor="#ffc800" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="b12d-proof-metal" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#fff2a1" />
          <stop offset=".16" stopColor="#ffc800" />
          <stop offset=".5" stopColor="#6d4c00" />
          <stop offset=".72" stopColor="#ffc800" />
          <stop offset="1" stopColor="#3a2800" />
        </linearGradient>
        <radialGradient id="b12d-cyan-core">
          <stop stopColor="#fff" />
          <stop offset=".08" stopColor="#dfffff" />
          <stop offset=".22" stopColor="#00e5ff" stopOpacity=".58" />
          <stop offset="1" stopColor="#00e5ff" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="b12d-red-impact">
          <stop stopColor="#fff" />
          <stop offset=".1" stopColor="#ff8a83" />
          <stop offset=".28" stopColor="#ff3b30" stopOpacity=".78" />
          <stop offset="1" stopColor="#ff3b30" stopOpacity="0" />
        </radialGradient>
        <filter id="b12d-blur8" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" /></filter>
        <filter id="b12d-blur18" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="18" /></filter>
        <filter id="b12d-shadow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="24" /></filter>
        <filter id="b12d-soft" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3.5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <clipPath id="b12d-inner-clip"><path d="M-148 316 104-342 338 316Z" /></clipPath>
      </defs>

      <g className="b12-opening__camera">
        <ellipse className="b12-opening__ground-shadow" cx="112" cy="382" rx="380" ry="42" />
        <ellipse className="b12-opening__ground-reflection" cx="120" cy="370" rx="292" ry="19" />

        <g className="b12-opening__request">
          <path className="b12-opening__request-bloom" d="M-820 96C-656 92-474 76-260 36" />
          <path className="b12-opening__request-line" d="M-820 96C-656 92-474 76-260 36" />
          <circle className="b12-opening__request-impact" cx="-260" cy="36" r="60" />
          <circle className="b12-opening__request-contact" cx="-260" cy="36" r="5" />
        </g>

        <g className="b12-opening__apex">
          <path className="b12-opening__apex-shadow" d="M-300 352 92-430 405 352Z" />

          <g className="b12-opening__shell b12-opening__shell--left">
            <path d="M-294 342 92-425 82 342Z" fill="url(#b12d-left)" />
            <path className="b12-opening__edge b12-opening__edge--left" d="M-294 342 92-425" />
            <path className="b12-opening__reflection b12-opening__reflection--left" d="M-258 302 76-366" />
          </g>

          <g className="b12-opening__shell b12-opening__shell--right">
            <path d="M92-425 405 342H82Z" fill="url(#b12d-right)" />
            <path className="b12-opening__edge b12-opening__edge--right" d="M92-425 405 342" />
            <path className="b12-opening__reflection b12-opening__reflection--right" d="M111-365 369 287" />
          </g>

          <path className="b12-opening__inner-glass" d="M-148 316 104-342 338 316Z" fill="url(#b12d-inner)" />

          <g className="b12-opening__inside" clipPath="url(#b12d-inner-clip)">
            <g className="b12-opening__structure">
              <path d="M-122 262 315 262M-94 198 290 198M-68 134 266 134M-44 70 241 70M-18 6 217 6M12-58 192-58M39-122 167-122M66-186 142-186" />
              <path d="M-94 286 100-328M-18 306 104-330M74 314 108-330M168 308 111-330M256 286 114-328" />
            </g>
            <g className="b12-opening__routes" fill="none">
              <path d="M-247 36C-151-142-54-112 43-69S191-23 333-9" />
              <path d="M-247 36C-145-82-52-69 44-42S195-14 333-9" />
              <path d="M-247 36C-145-31-48-24 48-16S201-8 333-9" />
              <path d="M-247 36C-140 30-47 34 49 25S205 2 333-9" />
              <path d="M-247 36C-132 92-35 100 59 70S210 12 333-9" />
              <path d="M-247 36C-119 154-11 164 83 111S224 26 333-9" />
            </g>
            <g className="b12-opening__nodes">
              <circle cx="-112" cy="-90" r="3"/><circle cx="-56" cy="-57" r="2.3"/><circle cx="4" cy="-31" r="2.7"/>
              <circle cx="-92" cy="64" r="2.5"/><circle cx="-24" cy="87" r="3"/><circle cx="64" cy="47" r="2.4"/>
              <circle cx="145" cy="1" r="3"/><circle cx="224" cy="-6" r="2.5"/><circle cx="274" cy="-9" r="2.8"/>
            </g>
            <ellipse className="b12-opening__cyan-haze" cx="212" cy="-8" rx="156" ry="114" />
          </g>

          <g className="b12-opening__verification">
            <ellipse className="b12-opening__verification-haze" cx="284" cy="-8" rx="98" ry="70" />
            <path d="M192-74C240-58 268-37 302-8 270 20 242 43 192 59" />
            <path d="M220-54C256-43 280-26 304-8 281 11 257 27 220 39" />
            <path d="M253-33C279-24 294-16 307-8 295 1 280 11 253 19" />
          </g>

          <path className="b12-opening__spine" d="M75-397 110-397 124 326H65Z" />
          <path className="b12-opening__seam" d="M93-402 96 327" />
          <path className="b12-opening__base-highlight" d="M-283 339 397 339" />
        </g>

        <g className="b12-opening__outcome">
          <path className="b12-opening__outcome-bloom" d="M322-8C452-5 565 0 744 18" />
          <path className="b12-opening__outcome-line" d="M322-8C452-5 565 0 744 18" />
          <circle className="b12-opening__outcome-contact" cx="322" cy="-8" r="5" />
          <g className="b12-opening__proof-object" transform="translate(646 -24) rotate(7)">
            <path d="M0 0 40 6 36 38-4 32Z" fill="#050505" stroke="url(#b12d-proof-metal)" strokeWidth="2" />
            <path d="M7 8 31 12M5 16 27 19M4 24 20 26" />
            <circle cx="29" cy="28" r="4.8" />
          </g>
        </g>
      </g>
    </svg>
  );
}

function MobileApex({ verified }: { verified: boolean }) {
  const active = useOpeningSequence();
  return (
    <svg
      className={`b12-opening__machine b12-opening__machine--mobile${active ? ' is-active' : ''}${verified ? ' is-verified' : ''}`}
      viewBox="-330 -360 660 720"
      role="img"
      aria-labelledby="b12-mobile-machine-title b12-mobile-machine-desc"
    >
      <title id="b12-mobile-machine-title">Clervo outcome mechanism</title>
      <desc id="b12-mobile-machine-desc">
        A red request enters a dark Apex, cyan qualification resolves inside, and a small verified gold proof emerges.
      </desc>
      <defs>
        <linearGradient id="b12m-left" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#101214"/><stop offset=".2" stopColor="#333a3e"/><stop offset=".36" stopColor="#090a0b"/><stop offset="1" stopColor="#020202"/>
        </linearGradient>
        <linearGradient id="b12m-right" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#eef4f2" stopOpacity=".72"/><stop offset=".07" stopColor="#454e52"/><stop offset=".2" stopColor="#121517"/><stop offset=".7" stopColor="#030404"/><stop offset="1" stopColor="#171b1e"/>
        </linearGradient>
        <linearGradient id="b12m-red" x1="0" x2="1"><stop stopColor="#ff3b30" stopOpacity="0"/><stop offset=".5" stopColor="#ff3b30" stopOpacity=".5"/><stop offset="1" stopColor="#fff"/></linearGradient>
        <linearGradient id="b12m-cyan" x1="0" x2="1"><stop stopColor="#00e5ff" stopOpacity=".08"/><stop offset=".55" stopColor="#00e5ff"/><stop offset="1" stopColor="#fff"/></linearGradient>
        <linearGradient id="b12m-gold" x1="0" x2="1"><stop stopColor="#fff"/><stop offset=".2" stopColor="#ffc800"/><stop offset="1" stopColor="#ffc800" stopOpacity="0"/></linearGradient>
        <radialGradient id="b12m-cyan-core"><stop stopColor="#fff"/><stop offset=".12" stopColor="#00e5ff" stopOpacity=".72"/><stop offset="1" stopColor="#00e5ff" stopOpacity="0"/></radialGradient>
        <radialGradient id="b12m-red-impact"><stop stopColor="#fff"/><stop offset=".12" stopColor="#ff3b30"/><stop offset="1" stopColor="#ff3b30" stopOpacity="0"/></radialGradient>
        <filter id="b12m-blur8" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8"/></filter>
        <filter id="b12m-blur16" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="16"/></filter>
        <filter id="b12m-soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        <clipPath id="b12m-clip"><path d="M-117 260 12-260 156 260Z"/></clipPath>
      </defs>
      <ellipse className="b12-opening__ground-shadow" cx="22" cy="292" rx="190" ry="26" />
      <ellipse className="b12-opening__ground-reflection" cx="23" cy="286" rx="145" ry="12" />
      <g className="b12-opening__request">
        <path className="b12-opening__request-bloom" d="M-330 30C-266 29-203 25-133 13"/>
        <path className="b12-opening__request-line" d="M-330 30C-266 29-203 25-133 13"/>
        <circle className="b12-opening__request-impact" cx="-133" cy="13" r="38"/>
        <circle className="b12-opening__request-contact" cx="-133" cy="13" r="4"/>
      </g>
      <g className="b12-opening__apex">
        <path className="b12-opening__apex-shadow" d="M-145 278 12-306 177 278Z"/>
        <g className="b12-opening__shell b12-opening__shell--left"><path d="M-142 270 12-302 7 270Z" fill="url(#b12m-left)"/><path className="b12-opening__edge b12-opening__edge--left" d="M-142 270 12-302"/><path className="b12-opening__reflection b12-opening__reflection--left" d="M-122 233 7-247"/></g>
        <g className="b12-opening__shell b12-opening__shell--right"><path d="M12-302 177 270H7Z" fill="url(#b12m-right)"/><path className="b12-opening__edge b12-opening__edge--right" d="M12-302 177 270"/><path className="b12-opening__reflection b12-opening__reflection--right" d="M22-255 156 225"/></g>
        <path className="b12-opening__inner-glass" d="M-117 260 12-260 156 260Z" fill="#031012"/>
        <g className="b12-opening__inside" clipPath="url(#b12m-clip)">
          <g className="b12-opening__structure"><path d="M-101 209H143M-83 154H126M-65 99H110M-47 44H94M-29-11H78M-11-66H62M7-121H46"/><path d="M-92 230 9-250M-30 250 11-252M36 251 13-252M101 231 15-250"/></g>
          <g className="b12-opening__routes" fill="none">
            <path d="M-129 13C-87-92-43-72 5-47S76-10 154-4"/><path d="M-129 13C-81-47-37-39 8-25S81-6 154-4"/><path d="M-129 13C-76-10-32-6 12-1S86-1 154-4"/><path d="M-129 13C-72 37-25 43 20 27S92 3 154-4"/><path d="M-129 13C-66 79-16 91 35 57S101 10 154-4"/>
          </g>
          <g className="b12-opening__nodes"><circle cx="-60" cy="-48" r="2.5"/><circle cx="-25" cy="-28" r="2"/><circle cx="17" cy="-8" r="2.4"/><circle cx="-42" cy="44" r="2.2"/><circle cx="15" cy="51" r="2.6"/><circle cx="71" cy="12" r="2.3"/><circle cx="112" cy="0" r="2.5"/></g>
          <ellipse className="b12-opening__cyan-haze" cx="103" cy="-4" rx="84" ry="65"/>
        </g>
        <g className="b12-opening__verification"><ellipse className="b12-opening__verification-haze" cx="127" cy="-4" rx="58" ry="42"/><path d="M77-43C101-34 117-22 136-4 118 13 102 25 77 34"/><path d="M95-30C114-24 126-15 138-4 127 7 115 15 95 21"/><path d="M115-18C126-14 135-9 141-4 135 1 127 6 115 10"/></g>
        <path className="b12-opening__spine" d="M2-278 22-278 29 259H-2Z"/><path className="b12-opening__seam" d="M12-286 13 260"/><path className="b12-opening__base-highlight" d="M-136 268 171 268"/>
      </g>
      <g className="b12-opening__outcome">
        <path className="b12-opening__outcome-bloom" d="M157-4C203-3 250 0 322 8"/>
        <path className="b12-opening__outcome-line" d="M157-4C203-3 250 0 322 8"/>
        <circle className="b12-opening__outcome-contact" cx="157" cy="-4" r="4"/>
        <g className="b12-opening__proof-object" transform="translate(273 -9) rotate(9)"><path d="M0 0 24 4 21 25-3 21Z"/><path d="M5 7 18 9M4 12 16 14M3 17 11 18"/><circle cx="16" cy="19" r="3"/></g>
      </g>
    </svg>
  );
}

export function B12Hero() {
  const proof = launchState.paymentProof;
  const verified = proof.settlementConfirmed
    && proof.usefulResult
    && proof.replaySameReceipt
    && proof.secondCharge === false;

  return (
    <section className="b12-opening" aria-labelledby="b12-opening-title">
      <div className="b12-opening__desktop-copy">
        <h1 id="b12-opening-title">Give your agent a task.<br />Get a verified result.</h1>
        <p>{launchState.identity.commercialPromise}</p>
        <Link className="button button--primary b12-opening__cta" to="/start">Set up Clervo</Link>
      </div>

      <div className="b12-opening__desktop-art" aria-hidden="true"><DesktopApex verified={verified} /></div>

      <div className="b12-opening__mobile">
        <h1>Give your agent a task.<br />Get a verified result.</h1>
        <div className="b12-opening__mobile-art" aria-hidden="true"><MobileApex verified={verified} /></div>
        <Link className="button button--primary b12-opening__cta" to="/start">Set up Clervo</Link>
        <p>{launchState.identity.commercialPromise}</p>
      </div>
    </section>
  );
}
