import type { ReactNode } from "react";
import { setMapPrefs, useMapPrefs } from "../lib/map-prefs";
import { Popover, Toggle } from "./Shell";

/**
 * The "Camadas" menu over the map: base map, contours and 3D relief, the same on every page.
 * `before` and `after` hold the page's own toggles (the observed fire, active incidents).
 */
export function MapLayers({ before, after, badge }: { before?: ReactNode; after?: ReactNode; badge?: number }) {
  const prefs = useMapPrefs();
  return (
    <Popover className="layers" icon="layers" label="Camadas" badge={badge}>
      {() => (
        <div className="menu-body">
          {before}
          <Toggle checked={prefs.baseMap === "osm"} onChange={(on) => setMapPrefs({ baseMap: on ? "osm" : null })}>
            Mapa de ruas (OpenStreetMap)
          </Toggle>
          <Toggle checked={prefs.baseMap === "satellite"} onChange={(on) => setMapPrefs({ baseMap: on ? "satellite" : null })}>
            Imagem de satélite
            <small>Portugal continental em 2023 (DGT)</small>
          </Toggle>
          <Toggle checked={prefs.contours} onChange={(contours) => setMapPrefs({ contours })}>
            Curvas de nível
            <small>Mais grossa a cada 5 curvas</small>
          </Toggle>
          <Toggle checked={prefs.terrain3d} onChange={(terrain3d) => setMapPrefs({ terrain3d })}>
            Relevo 3D
            <small>Inclinar com dois dedos ou arrastar com o botão direito do rato</small>
          </Toggle>
          {after}
          <p className="hint">OSM e satélite precisam de internet</p>
        </div>
      )}
    </Popover>
  );
}
