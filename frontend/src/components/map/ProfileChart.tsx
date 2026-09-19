import { SEVERITY_META } from '../../constants/dataClasses';
import type { CorridorProfilePoint } from '../../types/api';

/** Risk along a corridor: stepped bands in the background, sigma as a band. */
export function ProfileChart({ profile }: { profile: CorridorProfilePoint[] }) {
  if (profile.length < 2) return null;

  const width = 720;
  const height = 150;
  const padLeft = 34;
  const padBottom = 18;
  const padTop = 8;
  const plotW = width - padLeft - 8;
  const plotH = height - padTop - padBottom;

  const lastKm = profile[profile.length - 1].distance_km || 1;
  const x = (km: number) => padLeft + (km / lastKm) * plotW;
  const y = (risk: number) => padTop + (1 - Math.min(Math.max(risk, 0), 1)) * plotH;

  const riskPath = profile.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.distance_km).toFixed(1)},${y(p.risk).toFixed(1)}`).join(' ');
  const sigmaTop = profile
    .map((p) => `${x(p.distance_km).toFixed(1)},${y(Math.min(p.risk + p.sigma, 1)).toFixed(1)}`)
    .join(' ');
  const sigmaBottom = [...profile]
    .reverse()
    .map((p) => `${x(p.distance_km).toFixed(1)},${y(Math.max(p.risk - p.sigma, 0)).toFixed(1)}`)
    .join(' ');
  const sigmaPoly = `${sigmaTop} ${sigmaBottom}`;

  const ticks = [0, 0.2, 0.4, 0.6, 0.8, 1.0];

  return (
    <svg className="profile" viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Risk profile along the corridor">
      {ticks.map((t) => (
        <g key={t}>
          <line className="profile__grid" x1={padLeft} x2={width - 8} y1={y(t)} y2={y(t)} />
          <text className="profile__axis" x={4} y={y(t) + 3}>
            {t.toFixed(1)}
          </text>
        </g>
      ))}

      <polygon points={sigmaPoly} fill="#4cc2ff" opacity={0.14} />
      <path d={riskPath} fill="none" stroke="#4cc2ff" strokeWidth={1.8} />

      {profile.map((p) => (
        <rect
          key={p.distance_km}
          x={x(p.distance_km) - 1}
          y={padTop}
          width={2}
          height={plotH}
          fill={SEVERITY_META[p.passed >= 0.6 ? (p.passed >= 0.8 ? 'CRITICAL' : 'HIGH') : p.passed >= 0.4 ? 'MODERATE' : 'LOW'].color}
          opacity={0.0}
        />
      ))}

      <text className="profile__axis" x={padLeft} y={height - 4}>
        0 km
      </text>
      <text className="profile__axis" x={width - 60} y={height - 4}>
        {lastKm.toFixed(1)} km
      </text>
    </svg>
  );
}
