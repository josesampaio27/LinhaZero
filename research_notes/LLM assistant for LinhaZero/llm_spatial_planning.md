# LLM spatial reasoning and "LLM proposes, simulator verifies" for placing fire interventions

Scope note: this is a proof of concept using a cloud LLM via an API key. Regulation, compliance and offline/local models are out of scope, per a coordinator instruction mid-task.

Source-status legend: **[PR]** = peer-reviewed (conference/journal), **[PP]** = arXiv preprint, **[OP]** = operational/agency product or documentation, **[2nd]** = secondary/aggregator summary (lower confidence).

## Q1. How good are current LLMs at spatial/geographic reasoning on maps and grids, and how do they fail?

### Takeaway
Current frontier LLMs are unreliable spatial reasoners on grids and maps once problems get beyond toy size. On a maze, accuracy roughly halves between 5×5 and 9×9. On real-map Q&A, no model reaches 67% accuracy. In an LLM-agent wildfire simulator, several LLM frameworks did worse than doing nothing at suppressing fire. The failure modes are systematic: cutting through walls or obstacles, ignoring constraints, committing early, and not keeping state across steps. An LLM should not be the thing that picks cells for a containment line.

### Cited Findings
- **Grid mazes, format and size [PP, 2026]:** four models were tested (Gemini-2.5-Flash, GPT-5-mini, Claude-Haiku-4.5, DeepSeek-Chat), 50 mazes per size from 5×5 to 9×9.
  - With chain-of-thought (CoT) on adjacency-list input, Gemini scored 0.86 / 0.78 / 0.80 / 0.52 / 0.42 from 5×5 to 9×9. Claude-Haiku-4.5 scored 0.78 → 0.24, DeepSeek 0.74 → 0.24, and GPT-5-mini 0.30 → 0.08.
  - Visual-grid input stayed at about 0.08–0.34 for all models. Gemini scored 86% (adjacency list) vs 34% (visual grid) on 5×5, and 80% vs 16% on 7×7.
  - — [Do LLMs Build Spatial World Models? (arXiv 2604.10690)](https://arxiv.org/html/2604.10690)
- **Prompting matters a lot [PP]:** without reasoning instructions, Claude-Haiku-4.5 scored 0.00 on 5×5 adjacency-list mazes, rising to 0.78 with CoT. The authors conclude that "spatial reasoning capabilities exist but require appropriate elicitation" — [arXiv 2604.10690](https://arxiv.org/html/2604.10690)
- **Named failure modes [PP]:**
  - Models pick the straight (Euclidean) route to the goal, ignore walls and get "lost in the maze".
  - They treat repeated or sequential spatial questions as independent and do not reuse earlier work.
  - — [arXiv 2604.10690](https://arxiv.org/html/2604.10690)
- **Constraint extraction is the bottleneck [PP, 2026]:** two failure modes dominate, premature commitment and constraint forgetting. TopoBench finds the bottleneck is "extracting constraints from spatial representations", not reasoning over them once extracted — [TopoBench (arXiv 2603.12133)](https://arxiv.org/html/2603.12133) (via search summary; full paper not fetched)
- **Large grids [PP]:** the "Stuck in the Matrix" study tested grids from 2×2 to 300×300. The search summary reports Claude at about 98% on the smallest grids vs 61% on the largest (no extended thinking), and GPT-4o at 80% vs 22%. These numbers come from a search snippet and were not verified in the paper — [Stuck in the Matrix (arXiv 2510.20198)](https://arxiv.org/html/2510.20198)
- **Real maps, MapEval [PR, ICML 2025]:**
  - Setup: 700 multiple-choice questions over 180 cities in 54 countries, 30 foundation models (incl. Claude-3.5-Sonnet, GPT-4o, Gemini-1.5-Pro).
  - No model exceeded 67% accuracy, and all trailed humans by more than 20 points.
  - Weakest areas: distances, directions, route planning and place-specific reasoning.
  - — [MapEval (PMLR v267)](https://proceedings.mlr.press/v267/dihan25a.html); [arXiv 2501.00316](https://arxiv.org/pdf/2501.00316)
- **Map-image pathfinding, MapBench [PP, 2025]:**
  - 100 map images and 1,649 queries.
  - Only a small subset of vision-language models even produced valid, evaluable responses.
  - Reported failures include invalid detours, cutting through obstacles and poor long-range planning.
  - — [Can LVLMs Read Maps Like a Human? (arXiv 2503.14607)](https://arxiv.org/pdf/2503.14607); failure list via [Emergent Mind summary](https://www.emergentmind.com/topics/mapbench) [2nd]
- **Wildfire-specific multi-agent LLM benchmark, CREW-Wildfire [PR, TMLR Dec 2025]:**
  - Environment: cellular-automaton fire spread with slope, wind, vegetation and moisture. LLMs received ASCII minimaps converted to text summaries.
  - Frameworks: CAMON, COELA, Embodied and HMAS-2, all GPT-4o, zero-shot.
  - Cutting trees on a sparse large map was mostly fine: CAMON 72/75.
  - Scouting the fire on the large map and the rescue tasks scored **0.00 for every framework**.
  - Suppress Fire: CAMON −593 vs **Do Nothing −520**, so LLM teams did worse than inaction. Full environment: CAMON −5572 vs Do Nothing −5503.
  - Spatial-reasoning competency score was at most 0.368.
  - Observed failures:
    - overlapping instructions, with several agents cutting the same tree instead of decomposing a firebreak plan;
    - keeping outdated trajectories after the fire breached a boundary.
  - — [CREW-Wildfire (arXiv 2507.05178)](https://arxiv.org/html/2507.05178v2); [TMLR listing](https://mlanthology.org/tmlr/2025/hyun2025tmlr-crewwildfire/)
- **Geospatial grounding helps LLM forecasts of resource needs [PP, 2025]:**
  - The "Geospatial Awareness Layer" (PostGIS queries for stations, population, land cover, terrain, gridMET weather) feeds a unit-annotated "perception script" to the LLM.
  - On 5 held-out 2020 California fires, an LLM gave the lowest error for daily personnel and budget forecasts. Example: CZU personnel MAE 2.28 (o3-mini) vs 3.22 for a physical baseline.
  - The authors call LLMs "text-bound and blind to geography" without such a layer.
  - The system forecasts resource *quantities*. It does not prescribe tactical placements.
  - — [arXiv 2510.12061](https://arxiv.org/html/2510.12061v2)

### Inferences
- LinhaZero grids have hundreds × hundreds of cells at 30 m or 100 m. The benchmarks show sharp degradation well before that (9×9 mazes, 50-node TSP), so asking an LLM to output cell-level line geometry is out of its reliable range.
- The CREW-Wildfire "worse than doing nothing" result is the clearest domain warning. LLMs acting directly on a fire grid can actively hurt outcomes, so any LLM-proposed intervention must pass through the simulator before it is shown as a recommendation.
- TopoBench locates the failure in "constraint extraction from spatial representations", and the GAL paper shows that grounding works. Together they argue for pre-digesting the grid into explicit, named facts: critical paths, arrival times, road and ridge segments, villages. The LLM should reason over those facts, not over raw rasters.

### Gaps
- No benchmark found that tests LLMs on *fire-spread-aware* placement (choosing where a line intercepts a moving front). CREW-Wildfire is closest, but has no scripted or heuristic planner baseline, only "Do Nothing".
- No 2026 frontier-model numbers (e.g., latest Claude, GPT or Gemini reasoning models) on MapEval or maze-scale tests were found. Results on newer models may be better, but this is unverified.

## Q2. LLM-as-optimizer and generate-and-verify loops: how do they compare with classical baselines?

### Takeaway
LLMs used as *direct* black-box optimizers (OPRO-style) match or beat simple heuristics only on tiny instances and degrade sharply with size. LLM-guided search works when an exact evaluator scores every candidate and the LLM writes programs or edits candidates rather than solutions; FunSearch, LLM-evolved planning heuristics and SimTIO are examples. Even then, gains over well-designed classical or random baselines are modest and sometimes not statistically significant. The consensus framing (ICML 2024, LLM-Modulo) is that LLMs generate candidates and external verifiers decide.

### Cited Findings
- **OPRO on the travelling salesman problem (TSP) [PR, ICLR 2024]:**
  - Optimality gaps vs Gurobi, 5 instances per size:
    - n=10: all LLMs 0.0%, vs nearest neighbour 13.0% and farthest insertion 3.2%;
    - n=20: farthest insertion 0.2% beats GPT-4 at 1.4%;
    - n=50: GPT-4 11.0% vs farthest insertion 9.8%; gpt-3.5-turbo 133% and text-bison 220%.
  - The authors say OPRO "degrades dramatically on problems with larger sizes", partly because of context length, and was not meant to beat specialised solvers.
  - — [Large Language Models as Optimizers (arXiv 2309.03409)](https://arxiv.org/html/2309.03409v3)
- **FunSearch [PR, Nature 2023]:** an LLM evolves *programs*, which an automatic evaluator scores. It found new constructions and online bin-packing heuristics that improved on widely used baselines. The key design point is that the LLM proposes code and a deterministic evaluator guards against hallucination — [Nature s41586-023-06924-6](https://www.nature.com/articles/s41586-023-06924-6); summary via [Emergent Mind](https://www.emergentmind.com/topics/funsearch-algorithm) [2nd]
- **LLM-evolved heuristics for classical planning [PP, 2026]:** LLM-driven evolutionary program synthesis produced pattern-database heuristics. They matched state-of-the-art domain-independent baselines on several domains while evaluating states faster, but fell behind on Floortile and Miconic — [arXiv 2606.02438](https://arxiv.org/html/2606.02438)
- **Simulator-in-the-loop intervention design, SimTIO [PP, Sep 2026]:** this is the closest analogue to LinhaZero.
  - Loop:
    - a baseline simulation (SUMO, a traffic microsimulator) first finds the 10 bottleneck edges;
    - a grounded sampler proposes signal, speed and routing actions;
    - three LLM specialist agents choose *one-parameter* refinements from validated mutation catalogs, based on simulation feedback;
    - compatible actions are combined and re-simulated;
    - a no-op fallback is always kept.
  - Results on 15 cases:
    - 9.18% average cut in bottleneck time loss and 2.78% in network delay;
    - found a feasible improving plan in 86.7% of cases, vs 73.3% for grounded random search and 80.0% for a deterministic heuristic, under the same 7-simulation budget;
    - **the differences were not statistically significant**.
  - The authors conclude that LLMs work best as "constrained, feedback-guided local search operators, with final decisions left to executable tools, microscopic simulation, and safety constraints."
  - — [arXiv 2609.05740](https://arxiv.org/abs/2609.05740)
- **LLM-Modulo position [PR, ICML 2024]:**
  - Autoregressive LLMs cannot plan or self-verify on their own.
  - The paper also rejects the "LLM is only a format translator" extreme. It proposes LLMs as approximate knowledge sources tightly coupled with external model-based verifiers, in a generate-test-critique loop.
  - — [PMLR v235 kambhampati24a](https://proceedings.mlr.press/v235/kambhampati24a.html); [arXiv 2402.01817](https://arxiv.org/abs/2402.01817)
- **Evolution without exact oracles is weaker:** recent work studies driving evolution with LLM *judges* instead of exact evaluators, which highlights that most successes rely on a cheap exact evaluator — [arXiv 2511.19489](https://www.arxiv.org/pdf/2511.19489) (title-level only; not read in detail)

### Inferences
- LinhaZero already has what the successful hybrids depend on: a fast, deterministic evaluator (under 1 s per run) and a paired ensemble that gives a statistically meaningful score. This is the FunSearch/SimTIO precondition, so "LLM proposes, engine verifies" is technically feasible.
- The evidence does not say the LLM will out-optimise a classical method on a well-posed objective. SimTIO beat random search and a heuristic only modestly and not significantly. For "where should the line go to protect village X", the roadmap's min-cut on the arrival-time graph should be expected to be at least as good as, and much cheaper than, an LLM loop.
- The LLM's plausible value-add is narrower: choosing *which* objective and constraints to optimise, proposing a small set of qualitatively different strategies, and explaining trade-offs. Examples of strategies: defend Aldeia X with a road-anchored line vs a direct attack on the head vs a protected zone. Each of those then goes to the optimiser and simulator.
- Budget design: SimTIO used 7 simulations per case. LinhaZero can afford hundreds of single runs plus a 200–500-member ensemble, so the LLM's call latency (seconds per proposal), not simulation, is the bottleneck. This favours few LLM calls with many cheap engine evaluations.

### Gaps
- No published LLM-in-the-loop study on wildfire *containment-line* placement with a fire simulator as verifier was found.
- No head-to-head of LLM-guided search vs min-cut or MIP on spatial interdiction-type problems (cut a graph to protect targets) was found.

## Q3. Hybrid designs: the LLM translates intent into constraints for a classical optimiser, then explains the result

### Takeaway
Translating natural-language problem statements into formal optimisation models is the best-studied, best-performing LLM role in operations research. Agentic pipelines reach roughly 70–88% correctness on textbook benchmarks, but drop to 20–45% on harder industrial sets. That is good enough to *draft* constraints a human confirms, not to run unattended. Disaster/emergency papers converge on the same pattern: LLM for intent and tool orchestration, solver for the optimisation. They report that LLMs solving directly miss constraints.

### Cited Findings
- **OptiMUS (LLM agent → MILP solver) [PP; earlier version at ICML 2024]:**
  - OptiMUS-0.3 with GPT-4o: about 86.6–88.6% on easy and 73.7–78.2% on hard instances, depending on paper version. Reported as over 43% (easy) and 18% (hard) better than GPT-4o alone.
  - Real-world case studies: 28.6% vs 0% for fine-tuned specialists.
  - — [arXiv 2407.19633](https://arxiv.org/html/2407.19633v4); earlier version [OpenReview](https://openreview.net/pdf?id=2FAPahXyVh)
- **Independent re-evaluation [PP, 2026]:** OptiMUS scored 83.0% on NL4Opt, 73.6% on ComplexOR, 45.0% on Mamo, 31.0% on IndustryOR and 20.2% on OptMATH, averaged over 5 runs. Accuracy falls sharply on realistic industrial problems — [Opt-Verifier (arXiv 2605.29556)](https://arxiv.org/pdf/2605.29556)
- **Survey caveat [PR, IJCAI 2025]:** benchmark versions and metrics differ across papers, so direct comparisons are unreliable — [IJCAI 2025 survey](https://www.ijcai.org/proceedings/2025/1192.pdf)
- **Emergency/disaster pattern:**
  - *Post-disaster scheduling [PP]:* current LLMs' "comprehension and reasoning abilities are insufficient" for the complex post-disaster scheduling problem, and they often failed to account for the full constraint set — [arXiv 2506.04276](https://arxiv.org/pdf/2506.04276)
  - *TopoLLM, emergency network planning [PR]:* uses tool calls to optimisation algorithms because LLMs "may misinterpret disaster parameters, neglect implicit constraints, or mishandle multi-step optimization workflows" — [TopoLLM (ScienceDirect)](https://www.sciencedirect.com/science/article/pii/S2352864825001476)
  - *Generative AI for social impact [PP, 2026]:* describes an LLM agent that turns temporal, geographic or policy instructions into formal constraints passed to off-the-shelf solvers — [arXiv 2601.04238](https://arxiv.org/pdf/2601.04238)
  - *Asynchronous split [PP, 2026]:* a fast optimiser runs continuously, while a slower LLM reads a natural-language policy and adjusts it at a different time scale, so LLM latency never blocks the optimiser — [arXiv 2604.21316](https://arxiv.org/pdf/2604.21316) (search summary; not read in detail)
- **Wildfire containment as classical optimisation (precedent for the optimiser side):**
  - *Wei et al. 2019 [PR]:* a MIP selects a response area made of pre-identified operational delineations (PODs), and a second model times fireline construction so containment finishes before the fire reaches that area's edges. Applied to the 2017 Sliderock Fire — [frames.gov catalog](https://www.frames.gov/catalog/57646); [USFS Treesearch](https://research.fs.usda.gov/download/treesearch/48943.pdf)
  - *Belval, Wei, Bevers [PR]:* a spatial MIP places suppression at raster-cell nodes, with fire spread paths and arrival times as model outputs. Suppression that changes the minimum-travel-time path also changes arrival times — [USFS Treesearch 55936](https://research.fs.usda.gov/treesearch/55936); [Mountain Scholar](https://mountainscholar.org/handle/10217/82490)
  - *Integrated simulation and optimisation [PR]:* a stochastic MIP for initial-attack dispatch is paired with an agent-based suppression simulator that feeds back into the plan — [ACM 10.1145/1596519.1596524](https://dl.acm.org/doi/10.1145/1596519.1596524)

### Inferences
**Recommended division of labour for LinhaZero** (synthesis from the evidence above; not taken from any single source):

1. **LLM, intent to spec:** turns "protect Aldeia X, 2 crews arriving in 40 min, keep the N-2 road open" into a structured, schema-validated request:
   - targets to protect (named villages or buildings);
   - resources and arrival times (crews × line-building rate × available hours, giving a maximum line length);
   - anchor preferences (roads, ridges, rivers);
   - forbidden areas;
   - objective weights (buildings vs area).

   The UI shows the parsed spec for the coordinator to confirm. This mirrors OptiMUS and TopoLLM, and given the 20–45% accuracy on hard sets, human confirmation is essential.
2. **Classical optimiser, geometry:**
   - Min-cut on the arrival-time graph, restricted to cells reachable by crews before the fire arrives (arrival time > crew ETA + build time) and to a length budget. This is the Belval/Wei logic in graph form.
   - A few alternatives can come from different anchors and budgets, or from k-diverse cuts.
   - The optimiser, not the LLM, produces every cell of every line.
3. **Simulator and paired ensemble, verdict:** each candidate is run through the engine and the 200–500-member wind ensemble against a no-intervention baseline and against the user's own drawing. Only the ensemble result ("wins in N of M scenarios") is presented as evidence. SimTIO also keeps a no-op fallback and only accepts verified improvements.
4. **LLM, critique and explanation:**
   - Reads the engine outputs (critical path to each village, speed breakdown, ensemble win rates, scenarios where the line fails) and explains them in pt-PT.
   - Proposes *qualitative* variants for the optimiser to try (e.g., "line fails under NW wind; try anchoring on the ridge further north"). This is the LLM-Modulo bi-directional loop.
5. **Human, decision:** the coordinator chooses, edits or rejects. The app frames outputs as decision support (A vs B), not orders.

Further inferences:
- The roadmap's min-cut fits as the "solver" in this pattern. The LLM adds intent parsing, alternative generation at the strategy level, and explanation. It does not add better geometry.
- Latency: an LLM round-trip of seconds plus an ensemble of seconds fits the "first minutes" use case only if the LLM is called a few times per request. Long autonomous LLM loops would not fit.

### Gaps
- No paper found that applies the intent→optimiser pattern specifically to wildfire suppression or containment-line siting. The pattern is extrapolated from operations-research and other emergency domains.
- No user studies found with fire coordinators on trust in LLM-generated explanations of simulation output.

## Q4. Firebreak / containment-line placement with ML or LLMs (Cell2Fire + RL, etc.)

### Takeaway
ML for firebreak placement is dominated by deep RL and simulation-optimisation on small synthetic grids for *prevention* (fuel breaks), mostly around Cell2Fire. Operational containment work uses statistical ML for "potential control locations" plus MIPs. I found **no** published LLM-based firebreak or containment-line placement method. Existing LLM-wildfire work covers risk insight, resource-quantity forecasting and multi-agent benchmarks.

### Cited Findings
- **Deep RL on Cell2Fire [PP, 2024; journal version 2025]:**
  - Methods: DQN, Double DQN and Dueling Double DQN with CNNs on Cell2Fire, pre-trained to imitate a heuristic.
  - Converges on grids "as large as 40 × 40 cells" and "consistently exceeds" the heuristic it imitated.
  - A journal version is on ScienceDirect; the ISSN prefix suggests Applied Soft Computing, inferred and not confirmed. The authors note MIP and stochastic optimisation are effective but computationally demanding.
  - — [arXiv 2404.08523](https://arxiv.org/abs/2404.08523); [ScienceDirect S1568494625003540](https://www.sciencedirect.com/science/article/abs/pii/S1568494625003540); [SSRN 4931823](https://papers.ssrn.com/sol3/papers.cfm?abstract_id=4931823)
  - A secondary review says firebreaks were limited to 5% of cells — [themoonlight review](https://themoonlight.io/review/advancing-forest-fire-prevention-deep-reinforcement-learning-for-effective-firebreak-placement) [2nd, unverified]
- **Dynamic firebreaks in a learned CA model [PR, NHESS 2026]:** a cellular-automaton model with movable temporary and permanent firebreaks, validated on three California fires, with resource caps of 50 pixels per firebreak type — [NHESS 26, 2871](https://nhess.copernicus.org/articles/26/2871/2026/) (search summary)
- **Fuel-break optimisation for communities [PR, Fire Ecology 2026]:** burn probability + structure-loss model + network optimisation selects fuel-break locations under budget — [Springer s42408-026-00550-z](https://link.springer.com/article/10.1186/s42408-026-00550-z) (search summary)
- **Simulation-optimisation for fuel breaks [PR, Forest Ecology and Management, 2010]:** fuel-break location chosen to minimise expected losses under ignition and spread uncertainty — [ScienceDirect S0378112710001593](https://www.sciencedirect.com/science/article/abs/pii/S0378112710001593)
- **RL for helitack suppression [PP, 2026]:** lists firebreaks and ground crews as future work — [arXiv 2601.14238](https://arxiv.org/pdf/2601.14238)
- **Potential Control Locations (PCL), USFS:**
  - *[PR, IJWF 2017]:* boosted logistic regression on 238 large fires reached 69% accuracy on independent data at predicting where final perimeters fall, using topography, fuels, roads and suppression effort and no per-fire weather — [O'Connor, Calkin & Thompson, IJWF](https://connectsci.au/wf/article-pdf/26/7/587/846972/wf16135.pdf)
  - *[OP]:* the operational PCL Suitability layer (0–100) is a gradient-boosting model trained on 2002–2021 containment outcomes. Predictors include road distance, travel cost, barriers and ridges/valleys — [USFS PCL metadata](https://apps.fs.usda.gov/fsgisx03/rest/services/wo_spf_fam/Potential_Control_Location/ImageServer/info/iteminfo)
  - *[OP]:* it does not capture how control opportunities evolve during an event, and USFS and Microsoft Research are working on adding real-time weather and fire behaviour — [USFS–Microsoft opportunity](https://www.zintellect.com/Opportunity/Details/USDA-FS-RMRS-2024-0193)
- **Commercial non-LLM precedent [OP/blog]:** OroraTech lets users draw or upload fire breaks and compare containment scenarios, the same interaction model as LinhaZero — [OroraTech blog](https://ororatech.com/resources/news-blog/introducing-fire-break-simulation-for-smarter-wildfire-containment)
- **LLM wildfire systems (none place lines):**
  - WildfireGPT/MARSHA does retrieval-augmented risk insight, evaluated in 10 expert case studies [PR, npj Climate Action 2025] — [Nature s44168-025-00254-1](https://www.nature.com/articles/s44168-025-00254-1)
  - The GAL paper forecasts personnel and budget (Q1) — [arXiv 2510.12061](https://arxiv.org/html/2510.12061v2)
  - CREW-Wildfire is a multi-agent benchmark (Q1) — [arXiv 2507.05178](https://arxiv.org/html/2507.05178v2)
  - An AI-for-wildfire review lists agent-based suppression simulation as still an open direction — [MDPI AI 6(10):253](https://www.mdpi.com/2673-2688/6/10/253)

### Inferences
- LinhaZero would be in novel territory with LLM-assisted containment proposals. That is a positive for a hackathon, but there is no validated precedent to cite for accuracy, so claims must rest on LinhaZero's own ensemble verification.
- RL is a poor fit for this proof of concept: it needs a trained policy per landscape, and the published work only converges on 40×40 grids. Min-cut/MIP on the existing arrival-time graph needs no training and scales to LinhaZero grids.
- A PCL-like "where can fire realistically be stopped" layer is a good input to both the optimiser and the LLM. A cheap version uses roads, tracks, ridges, rivers and low-fuel cells from OSM, DEM and FUMOD data LinhaZero already has. It gives anchors that coordinators recognise by name.

### Gaps
- No Portuguese or European study of ML or optimisation for *suppression-time* containment-line siting was found in this pass.
- The Fire Ecology 2026 and NHESS 2026 items were seen only via search summaries.

## Q5. Which candidate representations work best for the LLM: place names and paths, coarse grids, coordinates or images?

### Takeaway
Structured text beats images for current models on spatial tasks: an adjacency or graph list scored 2–5× higher than a visual grid. Raw pixels and maps remain weak, with no model above 67% on MapEval and few valid answers on MapBench. Raw numeric coordinates help little. The best-performing systems pre-compute geospatial facts with tools (SQL/GIS) and give the LLM a compact, unit-annotated, named text summary. For LinhaZero, that means named features, paths and segments with attributes (arrival time, distance, fuel, crew ETA), not grids, coordinates or screenshots.

### Cited Findings
- **Adjacency list vs visual grid:** 86% vs 34% (5×5) and 80% vs 16% (7×7) for Gemini-2.5-Flash with CoT, described as a "2–5× difference". GPT-5-mini was the exception — [arXiv 2604.10690](https://arxiv.org/html/2604.10690)
- **Text vs image on a puzzle grid:** with no worked example, o4-mini's accuracy fell from 12.6% to 5.6% when shown a picture instead of a text grid. The source page also names an unverifiable model, so treat this as low confidence — [Towards Data Science](https://towardsdatascience.com/spatial-reasoning-in-ai-models-taken-apart/) [2nd]
- **Grounding via a tool-built "perception script":** structured, unit-annotated text produced from PostGIS queries gave more stable temporal alignment, and retrieval-augmented analog days reduced RMSE in most cases — [arXiv 2510.12061](https://arxiv.org/html/2510.12061v2)
- **CREW-Wildfire:** converts raw state to ASCII minimaps and then to text summaries for LLMs, and LLM commands are compiled back to primitive actions by an execution module. LLMs still failed at spatial coordination at scale — [arXiv 2507.05178](https://arxiv.org/html/2507.05178v2)
- **Numeric orientation values alone** did not help spatial reasoning much, and converting images to text loses detail [PR, EMNLP 2025] — [ACL Anthology 2025.emnlp-main.759](https://aclanthology.org/2025.emnlp-main.759.pdf)
- **Urban-agent practice:**
  - LLMs generate semantic activities, while GIS or transport modules assign concrete destinations, routes and times — [arXiv 2608.25952](https://arxiv.org/pdf/2608.25952)
  - CityPlanner requires the agent to submit structured spatial plans that evaluators verify — [arXiv 2609.09578](https://arxiv.org/pdf/2609.09578)
  - A survey groups urban-agent inputs into geovector, time-series, trajectory, visual and text types — [arXiv 2507.00914](https://arxiv.org/pdf/2507.00914)
- **SimTIO** constrained the LLM to "validated mutation catalogs" (one-parameter edits) over pre-identified bottleneck edges, a discrete, named action space instead of free geometry — [arXiv 2609.05740](https://arxiv.org/abs/2609.05740)

### Inferences
- **Recommended representation for LinhaZero:**
  - *Input to the LLM:* a compact JSON/text "situation script" with named villages; the critical path to each, as an ordered list of named segments with fire arrival time, spread speed and dominant driver (from the speed breakdown); candidate anchor features (road or track IDs and names, ridges, rivers) with length, distance from the front and crew ETA; and ensemble summary statistics.
  - *Output from the LLM:* a choice among discrete, IDed options (anchor IDs, target village, resource allocation, objective weights), never cell coordinates or polygons. A deterministic module converts options into geometry: min-cut restricted to the anchors, buffer around the village, or attack at segment K.
  - *Validation:* every LLM output is checked against a schema. Invalid IDs are rejected and re-prompted.
- **Images:** a map screenshot to a vision model is not recommended as the primary channel, given MapEval/MapBench and the adjacency-vs-visual gap. It could at most be a secondary sanity check.
- **Coarse grids:** useful only as a tiny overview (e.g., an 8×8 sector summary), since accuracy drops sharply beyond about 7×7.
- **CoT:** reasoning elicitation moved maze accuracy from 0.00 to 0.78, so reasoning or extended-thinking modes should be on for the strategy-proposal step.

### Gaps
- No study found that directly compares place names vs coordinates vs images on the *same* geographic planning task for current frontier models.
- No evidence found on how well LLMs handle Portuguese toponyms and local feature names (e.g., estradas municipais, caminhos florestais) in spatial reasoning.
