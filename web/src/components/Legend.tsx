import { INTENSITY_CLASSES } from "../lib/render";
import { formatMinutes } from "./TimeBar";

/** Colour key for the fire layer. */
export function Legend({
  mode,
  durationMin,
  burnChance,
}: {
  mode: "arrival" | "probability" | "intensity";
  durationMin: number;
  /** Rothermel ensemble checked against real fires (wind, moisture, fuel, ignition). */
  burnChance?: boolean;
}) {
  if (mode === "intensity") {
    return (
      <div className="legend legend-classes">
        <span>Intensidade:</span>
        {INTENSITY_CLASSES.map((c) => (
          <span key={c.label} className="legend-class">
            <i style={{ background: `rgb(${c.rgb.join(",")})` }} />
            {c.label}
          </span>
        ))}
      </div>
    );
  }
  return mode === "arrival" ? (
    <div className="legend">
      <span>Chegada do fogo:</span>
      <span>0</span>
      <i className="ramp ramp-arrival" />
      <span>{formatMinutes(durationMin)}</span>
    </div>
  ) : (
    <div
      className="legend"
      title={
        burnChance
          ? "Em quantos dos cenários a célula arde. Cada cenário varia o vento, a humidade do combustível, a velocidade por combustível e o ponto de ignição. Não há combate além do desenhado; por isso contra incêndios reais (combatidos) o mapa arde mais do que eles: das células em que todos os cenários ardem, arderam cerca de 22%."
          : "Fração das corridas, com o vento perturbado, em que a célula arde"
      }
    >
      <span>{burnChance ? "Cenários em que arde, sem combate além do desenhado:" : "Cenários em que arde:"}</span>
      <span>0%</span>
      <i className="ramp ramp-prob" />
      <span>100%</span>
    </div>
  );
}
