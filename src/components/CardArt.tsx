import type { Identity } from '../../shared/types';

// Original illustrations shown on revealed cards. Each identity has its own scene
// (red-lit corridor, blue cell bars, cream sketch, black hood) so revealed cards stay
// distinguishable by shape and texture as well as colour.

const SCENES: Record<Identity, { from: string; to: string; body: string; rim: string }> = {
  red: { from: '#d0422f', to: '#4d0b09', body: '#2a0605', rim: '#ff9f86' },
  blue: { from: '#2f6ad6', to: '#0a1b45', body: '#05122c', rim: '#9cc2ff' },
  neutral: { from: '#f4e7cc', to: '#d9c39b', body: 'none', rim: '#7a6140' },
  assassin: { from: '#24242c', to: '#000000', body: '#050507', rim: '#ff3b3b' },
};

function Figure({ variant, body, rim, sketch }: { variant: number; body: string; rim: string; sketch: boolean }) {
  const stroke = sketch ? rim : rim;
  const fill = sketch ? 'none' : body;
  const sw = sketch ? 1.6 : 1.2;
  return (
    <g stroke={stroke} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round">
      {/* shoulders / coat */}
      <path d="M26 64c2-12 10-18 24-18s22 6 24 18" fill={fill} />
      <path d="M44 47l6 9 6-9" fill="none" opacity=".7" />
      {/* head */}
      <ellipse cx="50" cy="33" rx="9" ry="10.5" fill={fill} />
      {variant === 0 ? (
        <>
          {/* fedora */}
          <path d="M36 25.5c0-1.6 4-2.6 6-2.8l2-6.4c.4-1.2 1.6-1.6 2.6-1.2L50 16l3.4-1c1-.4 2.2 0 2.6 1.2l2 6.4c2 .2 6 1.2 6 2.8 0 1.6-6.4 2.6-14 2.6s-14-1-14-2.6Z" fill={sketch ? 'none' : body} />
          {/* sunglasses */}
          <path d="M42.5 33h5.5M52 33h5.5" strokeWidth="2.6" />
        </>
      ) : variant === 1 ? (
        <>
          {/* cap */}
          <path d="M41 26c1-5 5-7.5 9-7.5s8 2.5 9 7.5c-3 .9-6 1.2-9 1.2s-6-.3-9-1.2Z" fill={sketch ? 'none' : body} />
          <path d="M57 25.5l7 1.5" strokeWidth="2" />
          {/* raised collar */}
          <path d="M38 52l6-6M62 52l-6-6" opacity=".8" />
        </>
      ) : (
        <>
          {/* swept hair */}
          <path d="M41 30c-1-8 5-12 11-11s9 5 7 11c-3-4-9-5-18 0Z" fill={sketch ? 'none' : body} />
          {/* round glasses */}
          <circle cx="46" cy="34" r="2.6" fill="none" />
          <circle cx="54" cy="34" r="2.6" fill="none" />
        </>
      )}
    </g>
  );
}

export function CardArt({ identity, seed }: { identity: Identity; seed: number }) {
  const sc = SCENES[identity];
  const id = `g${identity}${seed}`;
  const variant = seed % 3;
  return (
    <svg className="card-art" viewBox="0 0 100 64" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0.4" y2="1">
          <stop offset="0" stopColor={sc.from} />
          <stop offset="1" stopColor={sc.to} />
        </linearGradient>
      </defs>
      <rect width="100" height="64" fill={`url(#${id})`} />
      {identity === 'red' ? (
        // corridor light streaks
        <g stroke="#ffb199" strokeOpacity=".22" strokeWidth="1.2">
          <path d="M0 10 38 30M100 10 62 30M0 54 38 38M100 54 62 38" />
          <rect x="38" y="26" width="24" height="16" fill="#ffcfb8" fillOpacity=".08" />
        </g>
      ) : identity === 'blue' ? (
        // cell bars
        <g stroke="#a9c8ff" strokeOpacity=".22" strokeWidth="2">
          {[8, 18, 28, 72, 82, 92].map((x) => (
            <path key={x} d={`M${x} 0v64`} />
          ))}
          <path d="M0 12h30M70 12h30" />
        </g>
      ) : identity === 'neutral' ? (
        // sketch hatching
        <g stroke="#7a6140" strokeOpacity=".18" strokeWidth=".8">
          {[6, 14, 22, 78, 86, 94].map((x) => (
            <path key={x} d={`M${x} 64 ${x + 10} 0`} />
          ))}
        </g>
      ) : (
        // red glow
        <circle cx="50" cy="32" r="26" fill="#ff2a2a" fillOpacity=".08" />
      )}
      {identity === 'assassin' ? (
        <g>
          <path d="M30 64c0-16 8-30 20-34s20 18 20 34Z" fill={sc.body} stroke="#3a1010" strokeWidth="1.2" />
          <path d="M38 30c2-10 7-14 12-14s10 4 12 14c-4 6-8 8-12 8s-8-2-12-8Z" fill="#0d0d12" stroke="#3a1010" strokeWidth="1.2" />
          <path d="M44 30l4 1.2M56 30l-4 1.2" stroke={sc.rim} strokeWidth="2.4" strokeLinecap="round" />
        </g>
      ) : (
        <Figure variant={variant} body={sc.body} rim={sc.rim} sketch={identity === 'neutral'} />
      )}
    </svg>
  );
}
