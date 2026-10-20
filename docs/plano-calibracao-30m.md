# Plan: calibrating the engine for the 30 m Guimarães grid

Oct 20, 2026

> **Status (Oct 20, 2026, evening):** done, with changes to this plan.
>
> - **Method:** the 30 m grid was calibrated standalone, from the physical values, with no matching against 100 m.
> - **Results:** [ADR 0062](decisoes/0062-calibracao-da-grelha-de-30-m.md). The fit did not pass the rule.
> - **What ships:** the 100 m values, which beat physics on the 30 m fires they never saw.
> - **Next refit:** [plano-refit-30m.md](plano-refit-30m.md).

## Summary

The engine's physics is sound, but **the current calibration (`PT_CALIBRATION`: rosAdj 0.5, windAdj 2.5, holdWidthPerFlame 5, crownAdj 0.35) cannot simply be carried to 30 m, and it cannot be refit yet either**. Three reasons:

1. **The calibration absorbs engine artefacts that are resolution-dependent.** These are:
   - a solver bug with hourly weather;
   - roads as 100 m no-fuel strips;
   - the restart artefact in the interval objective;
   - a ~20% under-convergence of the 100 m solver in mixed fuels.

   At 30 m all four shrink, so the same parameters burn more: +17% to +43% in area for the same ignitions.
2. **The committed calibration report does not describe the shipped engine.** It predates ADR 0058, and its git hash is not in history. The adopted numbers have no reproducible artefact behind them.
3. **The evidence near Guimarães is all in-sample.** Every tier A fire within ~80 km is one of the 7 fires the incumbent was fit on.

The plan has five parts, in this order:

- fix the engine;
- make the calibration tooling resolution-aware and reproducible;
- rebuild the reference cases at 100 m and 30 m;
- re-establish a valid 100 m baseline;
- run a pre-registered, multi-fidelity 30 m calibration with a paired adoption rule.

Expected compute is ~4–5 h on 8 cores after the code work.

This plan merges two audits made on Oct 20, 2026: an engine audit and a calibration audit. Their repro scripts are in the session scratchpad (`engine-audit/`, `calib-audit/`) and should become tests (see Phase 1).

---

## 1. What we know

### 1.1 The engine (what it really does)

The pipeline matches the docs, with a few corrections.

- **Solver:** Dijkstra on a 32-direction stencil with 0.6 sectors, plus 8 two-cell road jumps.
  - Each step's time is split over **all crossed cells, origin included**. The docs say "destination-cell ROS", which is wrong.
  - The sector trick is scale-free and correct: uniform media agree to 0.99–1.00 across resolutions. It cannot route fire around barriers.
- **Rothermel / BehavePlus:**
  - The NFDRS, Van Wagner, Cruz, Albini-Baughman and Anderson ellipse formulas all match their references.
  - `rosAdj` touches ROS only; `windAdj` multiplies midflame wind. That means it also affects L/B, intensity, breaches and crown initiation, but **not** the Cruz crown rate or spotting distance, which use the open U10.
- **No hard-coded 100 m:** everything goes through `cellSize`, and spotting is per hectare.

### 1.2 Engine bugs that change calibration

| ID | Bug | Where | Effect | Severity |
| --- | --- | --- | --- | --- |
| **B1** | **Stale steps across weather changes.** A step's cost is fixed with the weather at departure, and expanded cells are never re-expanded after a change. | `spread-rothermel.ts:249`, `:296-318` (caveat in `spread.ts:62`) | Calm 0–120 min then 8 m/s burns **1 ha at 100 m** vs 331 ha at 30 m and 15 m: the fire is frozen. Dry-then-wet overshoots +21% at 100 m. Every PT-FireSprd run uses hourly weather, so `rosAdj`/`windAdj` partly absorb this. | **High** |
| B2 | **Corner leak.** Moves of the (1,1) and (1,3) families pass exactly through cell corners, so a diagonal-only barrier pair, even water, is never checked. | `crossedCells`, `spread-rothermel.ts:66` | 10 sites at 100 m, 5 at 30 m today. Latent for water polygons (`all_touched=False`). | Low/latent |
| B3 | **Crown intensity bookkeeping.** The surface part is ÷rosAdj, and the crown part is ×crownAdj. | `surface.ts:209, 219` | M-PIN at 10 m/s gives 26.9 MW/m vs 48.4 MW/m. Feeds spotting, attack fade and breaches in forest. | Low |
| B4 | **Buildings in non-burnable cells never count.** | `metrics.ts`, `simulate.ts:165` | 81% of buildings can never be "reached". | Medium (metric, not calibration) |
| B5 | **Ignition jitter falls back to the exact ignition.** When the jittered cell is non-burnable, `ignitionFor` returns the original point. | `simulate.ts:139` | 30–35% point mass on the original ignition. Distorts the reliability fit. | Low |
| B5′ | **Embers ignore holding lines.** | `spread-rothermel.ts:279-284` | Spot fires can land on a holding containment line. | Low |
| B5″ | **Variants break pairing.** Under grid variants, ignition rejection and `nearestBurnable` use each decision's own grid. | `simulate.ts` | Pairing breaks when a variant edits fuel or barriers near the ignition. | Low |

### 1.3 Design concerns (hypotheses, not bugs)

- **Sheltered WAF.** It uses `crownFill = cover/3`, which means crown ratio 1; BehavePlus uses `cover·CR/3`. So WAF is low by about √CR (`rothermel.ts:163`). There is also a ~×2 WAF jump at 15% cover.
- **windAdj 2.5.** It gives midflame wind above the 20 ft wind in shrubs, and L/B saturates at 8 around 10 m/s.
- **Cruz 2005 on eucalyptus.** Cruz 2005 is a conifer crown model, but it is applied to eucalyptus (M-EUC is 25% of Guimarães). Canopy parameters are provisional.
- **The DEM is a DSM.** Copernicus GLO-30 includes stand and building edges, which create spurious slopes at 30 m.
- **Fuel stays 100 m.** The 30 m grid has identical class proportions to the 100 m one and no extra detail.

### 1.4 The calibration (how sound it is)

The design is good: a per-interval restart objective, slow intervals down-weighted, CMA-ES in log space with a weak prior towards physical values, and held-out splits fit only on training fires (no leakage inside the loop). The problems:

| # | Problem | Severity |
| --- | --- | --- |
| C1 | `engine/reports/pt-firesprd-2026-10-19.json` is stale. Its hash is not in git, it lacks the keys today's `calibrate.ts` writes, and its baselines are from before ADR 0058. | High |
| C2 | The adopted 0.5 / 2.5 / 5 were fit in ADR 0053 under conditions that no longer exist: 7 fires, Sørensen from ignition, 16 directions, and `rosAdj` also halving intensity. The 0.35 crown factor and the "honest refit 0.55/2.2" have no report. | High |
| C3 | **holdWidthPerFlame 5 is outside every estimate.** Bootstrap gives 1.99 (90% interval 1.04–2.26), and folds give 0.88–2.14. Since ADR 0058 made intensity physical, flames are ~1.37× longer, so 5 now means "roads almost never hold": hold 5 and hold 10 score the same. | High |
| C4 | **A global rosAdj 0.5 halves the understory (M) fuels**, yet the group fit puts M at 1.00 (0.60–1.24) and litter at 0.97. M-EUC + M-CAD are ~47% of Guimarães's burnable cells. The test fires were mostly shrub, so the "tie" says little about Guimarães. | High for Guimarães |
| C5 | **Statistical power is low.** With 26 fires, the SE of the mean is ~0.018 cost and ~0.02 Sørensen. Even calibrated vs uncalibrated is t≈1.3. Detecting a 0.02 cost gain at 80% power needs ~160 fires. The crown, shelter, spotting and ERA5-Land decisions were all within noise. | High |
| C6 | Discrete choices were made on the same test fires (ADR 0058 #9). The incumbent was tuned on one of the two adoption metrics, so the rule is biased towards the status quo. | Medium–High |
| C7 | "Norte 0.42" is mostly training fit. A held-out Norte fit gives Sørensen 0.356. | High for Guimarães |
| C8 | The bootstrap warm-starts at the optimum (σ 0.25, 20 generations), and its Brier is in-sample. It understates uncertainty. | Medium |
| C9 | The ensemble scale choice is pinned at the cap: Brier falls monotonically, and all folds pick the corner. | Medium |
| C10 | The objective ignores spotting and random breaches (deterministic p<0.5), so `holdSteepness` is uncalibrated. | Medium |
| C11 | The shuffle is biased (`sort(() => rng()-0.5)`). The Norte split is dropped silently. The "engine follows the report" test passes vacuously. | Low |

**The restart artefact** (synthetic fire scored against itself, ratio of simulated to observed new cells):

| Case | 30 m | 100 m |
| --- | --- | --- |
| 1 m/s, 120 min intervals | 0.90–0.94 | 0.79–0.83 |
| 6 m/s, 40 min | 0.98 | 0.91–0.95 |
| 1 m/s, 40 min | 0.87–0.98 | **0** |

The 100 m fit absorbs a growth deficit of roughly 5–20%.

**The earlier "30 m check"** (docs `calibracao-e-validacao.md:149`) has no script, fire list or report. It was probably run on the pre-0058 engine, on 10 small fires, with a 5-cell interval gate that means 5 ha at 100 m but 0.45 ha at 30 m. **It never refit at 30 m.** It only showed the 100 m parameters don't get worse there.

### 1.5 Resolution dependence, 100 → 30 m

| Item | Effect at 30 m | Parameter it moves |
| --- | --- | --- |
| Solver convergence in mixed fuels | +19–25% area with the same data, flat terrain, no barriers | rosAdj, windAdj ↓ |
| B1 weather lag | Step durations ÷3.3; calm-start freeze and night overshoot mostly vanish | rosAdj, windAdj (moisture offset) |
| Road rasterisation | Non-burnable road cells 13.3% → 4.5% of the grid; the landscape becomes more connected | holdWidthPerFlame ↓, rosAdj ↓ |
| Restart artefact | 5–20% deficit → 2–10% | rosAdj, windAdj ↓ |
| Slope (Horn on resampled DEM) | Mean tan² +60%; cells > 20°: 0.6% → 4.7% | rosAdj (no slope knob) |
| Canopy / WAF | F/M mean WAF +15%; unsheltered F/M cells 8% → 18% | windAdj |
| Crown threshold 30% | Crown-capable cells passing: 83% → 78% | crownAdj |
| Spotting | Rate per ha preserved; short spots now resolvable (+2–3.5% area) | spotPerHa (test only) |
| Objective gates | `minNewCells`=5 and +1-cell smoothing are in cells | must become hectares |
| Sector, cell-crossing, ellipse | Scale-free (verified) | — |
| Fuel | Nearest from 100 m; identical proportions | — |
| Cost | ×9–10 per evaluation | budget |

**Expected direction at 30 m:**
- **rosAdj, windAdj:** down 5–15%, after B1 is fixed (B1 itself may move the 100 m values first).
- **holdWidthPerFlame:** down towards 1–2.
- **crownAdj:** unknown. Crown off beat 0.35 in-sample on 7 CI fires at 100 m.
- **deadMoistureOffset:** stays ~0.

---

## 2. The plan

### Phase 0 — Fix the engine first (≈1–2 days)

Calibration must not absorb solver artefacts that vanish at 30 m. Every fix goes in with a regression test built from the audit repros.

1. **B1, re-expansion on weather change.** When the clock passes a change at T:
   - before switching rates, find the frontier: cells with arrival ≤ T that have an unburned neighbour whose tentative arrival is > T;
   - for each frontier cell i and move m, compute the fraction of the old step done by T: f = (T − tᵢ)/c_old, clamped to [0, 1);
   - switch the weather;
   - re-relax with `ta = T + (1 − f)·c_new`.

   A stale arrival can be wrong in either direction: too late (calm then windy) or too early (dry then wet). Re-relaxing alone only fixes the first case. So first **clear** every tentative arrival > T, then recompute from the frontier.

   - **Simplest correct version:** at each change, clear the tentative arrivals > T and rebuild the heap from the frontier. This costs O(frontier) per hour, which is negligible.
   - **Tests:** the calm-start case (1 ha → ~331 ha at 100 m, agreeing within 5% between 100/50/30/15 m), the dry→wet case (no overshoot beyond 5% across resolutions), and constant wind unchanged.
   - Update the caveat in `spread.ts:62`.
2. **B2, corner crossings.** When a move passes exactly through a corner, block it if both side cells are non-burnable and not breached. Test with an 8-connected diagonal water line, which must give 0 cells burned beyond it.
3. **B3, crown intensity.** Compute intensity from the rate actually used: surface heat per unit rate at the physical rate, plus canopy heat, times the crown rate. Test that M-PIN at 10 m/s is close to 48 MW/m.
4. **B5, ignition jitter.** Redraw (a fixed number of hash draws, which keeps pairing) or move to the nearest burnable cell, instead of falling back to the exact point.
5. **B5′, embers on holding lines.** Embers must not ignite a cell on an active, holding containment line.
6. **Not for calibration, but schedule it: B4 buildings.** Count a building cell as reached if any 8-neighbour burns. Treat this as a product decision and record it in an ADR.
7. **Leave as hypotheses for Phase 4, not fixes:**
   - the WAF crown ratio;
   - smoothing of the WAF jump at 15% cover;
   - DEM smoothing (DSM);
   - Cruz on eucalyptus.

**Exit criterion:** `npm test` green; the new tests pass; the 9 CI fires re-scored, with the new values written to `reference.test.ts` together with the reason.

### Phase 1 — Make the tooling resolution-aware and reproducible (≈1 day)

1. **Case and output paths.**
   - Add `--cases <dir>` and `--outdir <dir>` to `calibrate.ts` (`:76, :79, :371`), `reliability.ts:38` and `tier-a-scores.ts:21`, and `--set <dir>` to `validate.ts:26`. The calibration audit's `calibrate-smoke.mts` proves this works.
   - Add `--manifest <path>` to `build_references.py`, so a 30 m build doesn't overwrite `engine/test/reference/manifest.json`.
2. **Resolution-invariant objective** (`intervals.ts:199, :272`, and the same in `ensembleIntervals`/`brierIntervals`):
   - minimum new area **in ha** (proposal: 2 ha);
   - area smoothing **+1 ha**, not +1 cell;
   - free-running labels computed from ha/h.
3. **Restart artefact.**
   - Seed each restart's active-front cells at `t = −½·cellSize / ROS_local`, crediting half a cell of progress, instead of t=0.
   - Accept the change only if the synthetic self-score ratio rises to ≥ 0.95 at both resolutions (`restart-artefact.mts` → test).
   - If it doesn't, keep t=0 and document the residual.
4. **Warm start.** Add `--x0 <json>` and `--sigma`.
5. **Parameter spaces.** Add `groupCrown`: rosAdj V, H, M; windAdj; holdWidthPerFlame; crownAdj. Fix litter and moisture offset at the physical values.
6. **Remove the hard-coded `OLD_FIT`** (`calibrate.ts:199`, `tier-a-scores.ts:30`). Store `seenFires` in the calibration metadata instead.
7. **Report provenance.** The report stores the git hash, the engine options and the full parameter vector of the incumbent. Add a test that the report's "current" equals `PT_CALIBRATION` (or the 30 m entry).
8. **Small fixes:**
   - replace the biased shuffle with Fisher–Yates on the seeded rng;
   - warn, instead of silently dropping, when the Norte split is too small;
   - log CMA-ES convergence (best and σ per generation) into the report.
9. **Data-prep image.** Fix `data-prep/Dockerfile` so it copies `canopy.py` and `fuel_params*`, or document the bind-mount run.

**Exit criterion:** a smoke calibration (3 generations, 2 folds) runs end-to-end at 100 m and at 30 m from explicit directories, and writes a report with provenance.

### Phase 2 — Rebuild the reference cases (≈½ day, mostly downloads)

1. Get PT-FireSprd v0.08 from Zenodo (10.5281/zenodo.7495506): `L1_FireProgressions`, `L2_FireBehavior`. Python 3 is not on this machine, so use the data-prep Docker image with a bind mount.
2. Build both sets with the same code path as `guimaraes-30m`:
   - fuel: FUMOD of the fire's year, nearest neighbour;
   - elevation: GLO-30 mean;
   - barriers: OSM all_touched;
   - canopy: TCD mean, on;
   - observed arrival re-rasterised from L1 at cell centres;
   - origin snapped to multiples of the cell size in EPSG:3763.

   ```bash
   docker build -t lz-prep data-prep
   docker run --rm -v C:/projects/LinhaZero:/repo -v <PTFS>:/ptfs -w /repo/data-prep --entrypoint python lz-prep \
     build_references.py --ptfs /ptfs --cell 100 --out out/reference     --manifest out/reference/manifest.json
   docker run --rm -v C:/projects/LinhaZero:/repo -v <PTFS>:/ptfs -w /repo/data-prep --entrypoint python lz-prep \
     build_references.py --ptfs /ptfs --cell 30  --out out/reference-30m --manifest out/reference-30m/manifest.json
   ```
3. At 30 m, reduce `MARGIN_M` from 3000 to 1500 (`build_reference.py:45`). First check on the 100 m runs that no simulated fire reaches 1.5 km beyond the observed scar.
4. **Optional but valuable: restore pre-fire fuel inside the scars of the Minho tier B fires.** For example, replace the cells inside the scar with the fuel of the nearest unburned cells in the same COS 2015 land-cover class. Without this, tier B is still usable for **paired** comparisons (incumbent vs challenger on the same biased fuel), but not for absolute scores.

### Phase 3 — Pre-register the protocol (before looking at any 30 m score)

Write a short ADR (proposal: ADR 0061) with the following, frozen:

- **Objective:** the interval cost as in ADR 0054, with the Phase 1 changes: ha gates, +1 ha smoothing, area weight 0.5, slow weight 0.25, cap ln 5.
- **Parameter space:** `groupCrown` (6 parameters), weak prior 0.01·Σ ln² towards 1, bounds as today.
- **Discrete hypotheses**, each tested with nested CV and adopted only by the rule below:
  1. crown on vs off;
  2. WAF with crown ratio (CR 0.5) vs without;
  3. 3×3 DEM smoothing vs raw GLO-30;
  4. a separate M factor vs a global factor.

  Cap the list at these four: power is too low for more.
- **Locked final test set:** the Minho/Norte tier B fires nearest Guimarães (Vieira do Minho, Cabeceiras de Basto, Ponte de Lima, Arcos de Valdevez, Paredes de Coura, Monção ×2, Caminha, Vila Nova de Cerveira).
  - Never used for any choice; read once, at the end, as a paired comparison.
  - Tier A 2021 is **not** locked: tier A is only 32 fires and power is already the binding constraint. Nested CV handles honesty there.
- **Adoption rule (challenger vs incumbent, both run at 30 m):**
  - mean paired cost difference on pooled 5-fold held-out fires **≤ −0.02**, with a 90% bootstrap-over-fires interval that excludes 0;
  - **and** Sørensen from ignition not worse by more than 0.01;
  - **and** the locked set does not reverse the sign.
- **Tie-breaking: physical plausibility.** Power is too low to separate most options, so on a tie, prefer the parameter value closer to physical, or inside the fitted interval, rather than the incumbent. This applies in particular to holdWidthPerFlame 5, which sits outside every estimate. This reverses ADR 0054's "tie keeps the incumbent"; the reason is C3 and C6.
- **Reporting:**
  - always report the Norte subset and the fires most like Guimarães (Oliveira de Frades: 48% M-EUC, 52% canopy; Valença), never as the deciding test;
  - always report results per fuel group.

### Phase 4 — Re-establish the 100 m baseline (≈1.5 h compute)

1. Run the full protocol (main fit, 5-fold, year-out, Norte-out; bootstrap 10×10) at 100 m on the **fixed** engine, with the new objective.
2. Commit the report. This is the first report that matches the shipped engine.
3. It answers:
   - Do 0.5 / 2.5 / 5 / 0.35 still hold after B1 and the restart fix?
   - Does M stay ≈1?
   - Does hold go to ≈2?
4. If the 100 m refit passes the rule, adopt it for the 100 m grid, as a separate decision from 30 m.

### Phase 5 — The 30 m calibration, multi-fidelity and nested (≈3 h compute)

1. **For each of the 5 folds,** using only that fold's training fires:
   - a 100 m CMA-ES from the physical values (40 generations, already done in Phase 4, so reuse it);
   - a 30 m CMA-ES warm-started at that fold's 100 m optimum (σ 0.25, 25 generations);
   - score the held-out fold at 30 m.

   **Never warm-start a fold from the global best**: that would leak the test fires.
2. **Main 30 m fit:** the 100 m main optimum, then 30 m with σ 0.25 and 30 generations on all fit fires.
3. **Discrete hypotheses** (Phase 3): one nested refit each, only at 30 m, sharing the 100 m stage where the hypothesis doesn't change it.
4. **Bootstrap:** only if the ensemble will draw parameter samples. In that case, 10 refits × 15 generations from the **fold** optimum, not from the main optimum (fixes C8).
5. **Budget:** ~10× the 100 m cost per evaluation.
   - Main fit ≈ 0.5 h; 5-fold ≈ 1.5–2 h; hypotheses ≈ 1 h (use fewer generations if needed).
   - Use `--jobs` on all cores, overnight if needed.

### Phase 6 — Ensemble at 30 m (≈1 h)

1. Re-run `reliability.ts` on the 30 m cases with the new calibration.
2. Weight Brier by hectares, not cells, so it is comparable to 100 m.
3. **Redesign the scale grid** so the optimum can be interior.
   - Today Brier falls monotonically to the cap (C9). Extend one step beyond the cap to see whether it turns.
   - If it does not, keep the cap and say so: the cap is a plausibility choice, not a fitted value.
4. Include spotting and random breaches in this run (they matter at 30 m). Check `holdSteepness` 3 with a 3-value sweep (C10).

### Phase 7 — Ship (≈½ day)

1. **Per-resolution calibration:**
   - `engine/src/calibration.ts` exports `calibrationFor(cellSize)`, with `PT_CALIBRATION_100M` and `PT_CALIBRATION_30M`;
   - `scenario.ts:127` selects it by grid cell size;
   - the web app and the engine-worker use the same selection (both go through `buildScenario`).

   A grid with another cell size uses the nearest one and the app warns.
2. **CI:** add the 9 CI fires at 30 m to `engine/test/reference/` (~2.5 s) with their own recorded scores and margin. The "engine follows the report" test checks both resolutions.
3. **Sanity checks on Guimarães:**
   - the demo scenarios still pass (`demo-scenario.test.ts`);
   - 30 m with `PT_CALIBRATION_30M` vs 100 m with `PT_CALIBRATION_100M` on the 8 audit ignitions: burned areas within ±15% at 5 and 10 m/s (today: +17% to +43% with the same parameters);
   - report how M-EUC spreads at 10 m/s.
4. **Docs:**
   - **`docs/modelo/propagacao.md`:**
     - remove the old exp() section and "Rothermel not yet default";
     - the step uses all crossed cells;
     - intensity is now exposed.
   - **`docs/modelo/incerteza.md`:**
     - today's perturbations are ±30°, ±37.5%, moisture, fuel and ignition.
   - **`docs/modelo/calibracao-e-validacao.md`, `o-motor-explicado.md` and `validacao-resumo.md`:**
     - new numbers;
     - remove "the 100 m calibration serves at 30 m";
     - the Norte figures marked as in-sample or held-out;
     - the power caveat (≈0.02 SE).
   - **ADR 0058:** the 30 m ensemble timing is 1.1–1.8 s per decision, not 0.6 s.

---

## 3. Order, effort and risks

| Phase | Effort | Compute | Blocks |
| --- | --- | --- | --- |
| 0 Engine fixes | 1–2 days | — | everything |
| 1 Tooling | 1 day | — | 4, 5, 6 |
| 2 Reference cases | ½ day | downloads | 4, 5, 6 |
| 3 Pre-registration ADR | 1–2 h | — | 4, 5 |
| 4 100 m baseline | — | ~1.5 h | 5 |
| 5 30 m calibration | — | ~3 h | 6, 7 |
| 6 Ensemble at 30 m | — | ~1 h | 7 |
| 7 Ship | ½ day | — | — |

Phases 0–1 and 2 can run in parallel.

**Risks:**
- **Most comparisons will be ties.** With 32 fires, only cost differences of about 0.04 or more are detectable. The plan accepts this: ties fall back to physical plausibility (Phase 3), and the locked Minho set is a sign check, not a significance test.
- **B1 changes everything at 100 m too.** Expect the 100 m numbers in the docs and the CI thresholds to move. That is the point of Phase 4.
- **The fuel is still 100 m.** The 30 m grid gains roads, rivers, slope and canopy detail, but no fuel detail. A 30 m fuel map (e.g. FUMOD refined with COS 2023 or COSc) is the next lever, and out of scope here.
- **The DEM is a DSM.** If hypothesis 3 (smoothing) ties, consider a true DTM (DGT LiDAR, where available) as later work.
- **Data access.** PT-FireSprd, FUMOD, Copernicus and Overpass must all be reachable for the first build; after that the cache makes it offline.

## 4. Decisions needed from the project

1. Fix the engine (Phase 0) before any recalibration, accepting that the published 100 m numbers will change. **Recommended: yes.**
2. Replace "a tie keeps the incumbent" with "a tie falls back to physical plausibility". **Recommended: yes**, mainly because of hold = 5.
3. The locked test set: Minho tier B only (recommended), or also lock tier A 2021.
4. Whether to invest in restoring pre-fire fuel for tier B (Phase 2, step 4) now or later.
