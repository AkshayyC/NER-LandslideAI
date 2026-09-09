import { DATA_CLASSES } from '../../constants/dataClasses';
import { SEVERITY_META } from '../../constants/dataClasses';

/** Map legend overlay. Symbols mirror what NERMap can actually render —
 * unavailable layers are listed explicitly as pending, never faked. */
export function MapLegend({
  inventoryCount,
  showReferenceMarkers = true,
}: {
  inventoryCount?: number | null;
  showReferenceMarkers?: boolean;
}) {
  return (
    <div className="map-legend" role="region" aria-label="Map legend">
      <div className="map-legend__title">LEGEND</div>

      <div className="map-legend__section">Susceptibility category</div>
      {(Object.keys(SEVERITY_META) as Array<keyof typeof SEVERITY_META>).map((key) => (
        <div className="map-legend__item" key={key}>
          <span className="legend__swatch" style={{ background: SEVERITY_META[key].color }} />
          <span>{SEVERITY_META[key].label}</span>
        </div>
      ))}

      <div className="map-legend__section">Symbols</div>
      {showReferenceMarkers && (
        <div className="map-legend__item">
          <span className="legend__symbol legend__symbol--ref" />
          <span>State reference center (navigation only)</span>
        </div>
      )}
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--inv" />
        <span>
          Historical inventory point{' '}
          {inventoryCount == null ? (
            <em className="map-legend__pending">— no backend data</em>
          ) : (
            <em className="map-legend__count">({inventoryCount} plotted)</em>
          )}
        </span>
      </div>
      <div className="map-legend__item">
        <span className="legend__symbol legend__symbol--pick" />
        <span>Inspected location (your map click)</span>
      </div>

      <div className="map-legend__note">
        State/district susceptibility polygons require GIS boundaries from the backend — pending.
        Trigger layer: {DATA_CLASSES.trigger.statusLabel.toLowerCase()}.
      </div>
      <div className="map-legend__attrib mono">© OpenStreetMap contributors · © CARTO</div>
    </div>
  );
}
