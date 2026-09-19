import { SEVERITY_CUT_TEXT, SEVERITY_ORDER } from '../../constants/dataClasses';
import { rampForField } from '../../utils/mapColors';

interface MapLegendProps {
  field: string;
  fieldLabel: string;
  /** Shown under the ramp — usually the field's plain-language meaning. */
  note?: string;
}

/** Legend for the active grid layer plus the two base symbols. */
export function MapLegend({ field, fieldLabel, note }: MapLegendProps) {
  const ramp = rampForField(field);

  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <div className="map-legend__title">{fieldLabel}</div>

      <div className="legend__ramp" aria-hidden="true">
        {ramp.bands.map((band) => (
          <span key={band.label} style={{ background: band.color }} />
        ))}
      </div>
      <div className="map-legend__section">
        {ramp.bands.map((band) => (
          <div className="map-legend__item" key={band.label}>
            <span className="legend__swatch" style={{ background: band.color }} />
            {band.label}
          </div>
        ))}
      </div>

      {(field.startsWith('risk') || field === 'susceptibility') && (
        <div className="map-legend__note">
          Ordinal bands, not probabilities:{' '}
          {SEVERITY_ORDER.map((c) => `${c} ${SEVERITY_CUT_TEXT[c]}`).join(' · ')}.
        </div>
      )}

      <div className="map-legend__section">Base</div>
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--hq" />
        District headquarters
      </div>
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--event" />
        Recorded event (reference catalogue)
      </div>
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--corridor" />
        Lifeline corridor
      </div>
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--worst" />
        Worst segment
      </div>

      {note && <div className="map-legend__note">{note}</div>}
    </div>
  );
}
