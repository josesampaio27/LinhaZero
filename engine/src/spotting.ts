// Spot fires: embers carried downwind from intense fire, landing at a lognormal distance.
//
// Distance follows Sardoy et al. (2008) as implemented in ELMFIRE (elmfire_spotting.f90,
// EMPIRICAL_PDF_PARAMETERS): the parameters of a lognormal in metres from fireline intensity I
// (MW/m) and the 10-m wind U (m/s), through the Froude number of the plume. It describes short-range
// spotting (tens to hundreds of metres), not the kilometre-range bark embers of eucalyptus.

const RHO_INF = 1.1; // air density, kg/m³
const C_PG = 1.0; // air heat capacity, kJ/(kg·K)
const T_INF = 300; // ambient temperature, K
const G = 9.81;

/** Lognormal parameters (of ln metres) of the downwind spotting distance, and the crosswind spread (m). */
export function spotDistribution(
  intensityKwM: number,
  wind10mMs: number,
): { mu: number; sigma: number; crosswindSigmaM: number } {
  const I = Math.max(intensityKwM, 1e-6) / 1000; // MW/m
  const U = Math.max(wind10mMs, 1e-3);
  const lc = Math.pow(
    (I * 1000) / (RHO_INF * C_PG * T_INF * Math.sqrt(G)),
    0.67,
  ); // plume length scale, m
  const froude = U / Math.sqrt(G * lc);
  let mu: number, sigma: number;
  if (froude <= 1) {
    mu = (1.47 * Math.pow(I, 0.54)) / Math.max(Math.pow(U, 0.55), 1e-5) + 1.14;
    sigma =
      (0.86 * Math.pow(U, 0.44)) / Math.max(Math.pow(I, 0.21), 1e-5) + 0.19;
  } else {
    mu = 1.32 * Math.pow(I, 0.26) * Math.pow(U, 0.11) - 0.02;
    sigma =
      4.95 /
        Math.max(Math.pow(I, 0.01), 1e-5) /
        Math.max(Math.pow(U, 0.02), 1e-5) -
      3.48;
  }
  return {
    mu: Math.min(mu, 5),
    sigma: Math.max(sigma, 1e-5),
    crosswindSigmaM: 0.92 * lc,
  };
}

/** Two standard normal numbers from two uniform ones in (0, 1) (Box-Muller). */
export function normals(u1: number, u2: number): [number, number] {
  const r = Math.sqrt(-2 * Math.log(Math.max(u1, 1e-12)));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}
