# LLM assistants in decision-support, simulation and map apps: patterns and examples (wildfire / emergency focus)

Scope note: the user narrowed scope mid-task. This is a proof of concept with a cloud LLM via API key, so regulation, compliance and offline/local models are excluded. The notes cover interaction patterns, real examples and how map copilots give the LLM spatial context.

Source-quality legend: **[eval]** = peer-reviewed or preprint with an evaluation; **[self-eval]** = authors evaluated their own system; **[vendor]** = vendor marketing or roadmap, not independently evaluated; **[abstract-only]** = I read only the abstract or metadata.

## 1. Which products and research already put LLMs into wildfire / emergency-management tools, and what do they do?

### Takeaway
The only well-documented wildfire LLM system is WildfireGPT (Argonne, 2024–2025). It is a RAG chat assistant for *long-term risk and planning*, not for live incident tactics. Wildfire vendors (Technosylva, Pano AI, Google's wildfire work) market AI as ML/simulation/detection, and I found no public evidence of an LLM assistant in their fire products. Research closest to LinhaZero's "decision A vs B" question comes from military and evacuation planning: LLM-generated courses of action checked in a simulator, and LLM "commanders" in multi-agent evacuation sims.

### Cited Findings
**WildfireGPT (Argonne National Laboratory + UPenn) [self-eval]**
- Prototype RAG multi-agent LLM. Argonne calls it the first proof of concept of its Argonne Resilience AI Assistant (ARAIA) project. Intended users: engineers, urban planners, emergency managers, infrastructure operators — [Argonne ARAIA](https://www.anl.gov/dis/argonne-resilience-ai-assistant); [Argonne event page](https://alcf.anl.gov/events/tailored-large-language-models-site-specific-wildfire-risk-assessment-and-decision-making); [NeurIPS 2024 CCAI workshop paper](https://climatechange.ai/papers/neurips2024/36)
- Architecture: three agents plus a task orchestrator. A **user-profile agent** asks fixed questions (profession, concern, location, timeframe) and drafts a profile for the user to confirm. A **planning agent** proposes a step-by-step analysis plan (datasets, literature focus) that the user can revise. An **analyst agent** retrieves data and literature, presents findings and answers follow-ups. Built on GPT-4 Turbo, the OpenAI Assistants API and a Streamlit chat UI — [arXiv 2504.17200 (HTML)](https://arxiv.org/html/2504.17200v1)
- Data retrieved by tools, not from model memory: Fire Weather Index projections (ClimRR), wildfire incident records 2015–2023, tree-ring/sediment fire histories, census poverty/housing data, and literature abstracts via BERT semantic search. Outputs include interactive FWI maps (36 km radius), incident maps, trend charts and census overlays alongside text with citations — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- Evaluation: 10 case studies, each a one-hour structured interview with domain experts, on a 3-point scale. Relevance 96.67–100%, entailment 92.86%, "no jargon" 99.26%, "sufficient explanation" 94.85%. GPT-4-as-judge agreed with experts only 62.99% (relevance) to 75% (entailment) of the time and was stricter than the experts — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- Versus ChatClimate and Perplexity: location specificity 9/9 vs 0/6 vs 4/9; data accuracy 8/9 vs n/a vs 2/8. Perplexity sometimes misread coordinates and applied European reports to US locations — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- The abstract claims it "significantly outperforms existing LLM-based solutions for decision support" — [arXiv abs 2504.17200](https://arxiv.org/abs/2504.17200)

**Other wildfire / emergency research systems**
- *Geospatial Awareness Layer (GAL)* (Chen et al., arXiv 2510.12061, Oct 2025, v2 May 2026). Starting from raw wildfire detections, it pulls infrastructure, demographics, terrain and weather from geodatabases into a concise, **unit-annotated text "perception script"**. LLM agents use it to recommend resource allocation (personnel, budget). Historical analogs and daily change signals drive incremental updates. Claims grounded agents "can outperform baselines" on real wildfire scenarios across several LLMs. No metrics in the abstract — [arXiv 2510.12061](https://arxiv.org/abs/2510.12061v1) [abstract-only]
- *LLM as incident commander for firefighting aircraft*, in a system-of-systems model. The LLM commander made "adaptive and context-aware decisions" that could be analysed through decision logs (Cambridge Aeronautical Journal, 2025) — [Cambridge PDF](https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/EAA19838D50B29132CE1226CC7745F68/S0001924025100973a.pdf/contextualised-generative-ai-in-system-of-systems-modelling-an-approach-for-firefighting-aircraft-requirements.pdf) [abstract-only, via search snippet]
- *LLM Commander for multi-agent evacuation* (AAMAS 2026 demo). In a zero-shot fire scenario, the LLM commander raised the evacuation rate to 74.2% without memory and 82.5% with episodic memory — [AAMAS 2026](https://ifaamas.org/Proceedings/aamas2026/pdfs/SEYR5220.pdf) [search snippet only]
- *FLARE* (arXiv 2502.17701, 2025): LLM chain-of-thought plus behavioural theory plus an RL module to predict residents' wildfire evacuation decisions — [arXiv 2502.17701](https://arxiv.org/html/2502.17701v2) [abstract-only]
- *Ontology + Big Data + LLM forest-fire decision support* (arXiv 2405.11346, 2024): answers rule-based questions about fire response actions — [arXiv 2405.11346](https://arxiv.org/pdf/2405.11346) [abstract-only]

**Closest analogue to "what happens if I do A or B": COA-GPT (US Army DEVCOM ARL, 2024) [self-eval, simulated]**
- The LLM is prompted with doctrine and constraints (in-context learning). Commanders give mission information as text or images, the model proposes several courses of action, and humans refine them in natural language until one is chosen. Evaluated in a militarized StarCraft II against an expert human and RL baselines. Reached near-human-expert performance after two rounds of human feedback and was faster — [arXiv 2402.01786](https://arxiv.org/abs/2402.01786v2); [ICMCIS 2024 listing via PapersWithCode](https://paperswithcode.com/paper/coa-gpt-generative-pre-trained-transformers)

**Vendors**
- *Technosylva*: AI/ML on weather, live fuels and assets, and simulations combining camera, weather, vegetation, soil moisture, terrain and Earth-observation data. Customers include CAL FIRE (picked from 131 proposals) and PG&E/SCE/SDG&E. I found **no** public evidence of a generative-AI / LLM assistant in Wildfire Analyst — [EEJournal](https://eejournal.com/fish_fry/fighting-fire-with-ai-technosylva-and-the-future-of-wildfire-prediction/); [Renewable Energy World](https://www.renewableenergyworld.com/power-grid/outage-management/utility-executives-begin-their-day-with-this-companys-wildfire-ai-data/); [NWCG doc listing Wildfire Analyst products](https://fsapps.nwcg.gov/nirops/docs/upload/3_1_Intterra_TSYL_Version_FINAL.pdf) [vendor]
- *Technosylva + Pano AI*: integration pairing predictive risk modelling with live camera feeds and ignition intelligence. This is a data integration, not an LLM product — [International Fire & Safety Journal](https://internationalfireandsafetyjournal.com/wildfire-technosylva-pano/) [vendor]
- *Esri ArcGIS* (the most mature GIS LLM line-up, mostly beta) [vendor roadmap]:
  - Arcade Assistant: writes expressions. Added to Map Viewer in June 2025, then extended to Scene Viewer and field calculations.
  - ArcGIS Pro assistant (private beta): searches documentation, generates SQL/Cypher, **triggers common Pro actions**, generates ArcPy. Developers can register custom .NET "AI functions" that the assistant calls.
  - Notebook assistant (Python).
  - Item-details assistant: writes metadata, framed as "metadata is key for … AI agents".
  - **Data Explorer Instant App** (beta Q1 2026): "natural language for map exploration, essential geographic analysis and filtering, data summarization", e.g. "Identify all parcels with tax values below the average".
  - ArcGIS Agent Builder (beta 2026): no-code geospatial agents, exposable via A2A.
  - Generative AI is opt-in per organization, with "Transparency Cards" per AI feature.
  - Sources: [Esri NSGIC deck, Nov 2025](https://nsgic.org/wp-content/uploads/2025/11/2025-11-18-AI-in-ArcGIS-Update-for-NSGIC.pdf); [Esri blog Oct 2025](https://www.esri.com/arcgis-blog/products/arcgis-online/geoai/whats-new-in-ai-assistants-october-2025) (search snippet; page returned 403); [Esri 2026 AI assistants deck](https://www.esri.com/content/dam/esrisites/en-us/media/powerpoints/2026-ai-assistants-micro-region.pdf)
  - The Oct 2025 Map Viewer assistant covers field calculations, pop-ups, expressions, labels and smart-mapping renderers — [Esri blog Oct 2025](https://www.esri.com/arcgis-blog/products/arcgis-online/geoai/whats-new-in-ai-assistants-october-2025) [snippet]

### Inferences
- No product found does what LinhaZero would do: an LLM attached to an operational fire-spread simulator comparing interventions. The gap is real, so a hackathon demo would be novel. It also means there is no field evidence of what works for fire coordinators in the first minutes.
- WildfireGPT's design choices — tool-retrieved data instead of model knowledge, a confirmation step for profile and location, a user-editable plan before analysis — map directly onto LinhaZero. Its domain (multi-year risk) differs, so its evaluation scores don't transfer to tactical use.
- COA-GPT is the best template for "LLM drafts options → simulator scores them → human refines". In LinhaZero the engine and the paired ensemble do the scoring, so the LLM never has to judge which plan wins.

### Gaps
- No public information found on LLM features from Technosylva, Pano AI or Google's wildfire teams (FireSat, boundary tracking). Absence of evidence: they may exist privately. A search for Pano AI generative features returned nothing.
- No field deployments of LLMs in live wildfire incident command with reported outcomes.
- European sources (EU JRC/EFFIS, Copernicus EMS, Portuguese ANEPC/AGIF) on LLMs were not covered in my call budget.

## 2. Interaction patterns for LLMs in simulators / digital twins / what-if tools (with examples)

### Takeaway
Seven recurring patterns, with the following evidence:

| Pattern | Evidence |
|---|---|
| (a) Natural-language scenario setup into structured data | Well documented in simulation research |
| (b) LLM drafting options/interventions for a simulator to score | COA-GPT |
| (c) Plain-language explanation and comparison of results | WildfireGPT; humanitarian sitreps |
| (d) Plan critique | Only indirect evidence |
| (e) Briefing / sitrep generation | Several evaluated systems; humans always review |
| (f) Q&A over docs and doctrine (RAG) | The most common deployed pattern |
| (g) Map-aware copilots driving map/UI actions | Esri, Mapbox/MapLibre tooling |

The common recipe is: the LLM emits structured data or tool calls, deterministic code validates and executes, and the user confirms.

### Cited Findings
**(a) Natural-language scenario setup → structured config**
- Supply-chain simulation (MODSIM 2025): a fine-tuned LLM converts natural-language scenarios into a **structured representation first**, then code for a Python discrete-event simulation engine — [Chotaliya et al., MODSIM 2025](https://mssanz.org.au/modsim2025/files/M02.chotaliya.pdf); [WSC 2025](https://www.informs-sim.org/wsc25papers/inv188.pdf)
- FactoryFlow (arXiv 2603.25898): LLM-assisted structural modelling for manufacturing digital twins. **Hallucinations were more frequent when compact natural-language descriptions expanded into large structured (netlist) representations** — [arXiv 2603.25898](https://arxiv.org/pdf/2603.25898v2)
- Production systems (Procedia CIRP): expert discussions and documents → textual requirements → simulation configuration — [KIT](https://publikationen.bibliothek.kit.edu/1000191160/176230678) [snippet]
- Autonomous-driving digital twin: an LLM interface edits driving scenarios online from natural-language prompts — [arXiv 2507.00319](https://arxiv.org/html/2507.00319v2) [snippet]
- Social Digital Twinner (PAAMS 2025): agent-based what-if simulator with a natural-language interface to the simulation and its agents. Three parts: data layer, LLM-enabled engine, UI. Demo on school dropouts in Kragerø, Norway — [arXiv 2505.10681](https://arxiv.org/pdf/2505.10681)

**(b) LLM drafts options for a simulator to score; human refines**
- COA-GPT: LLM proposes several courses of action from doctrine plus mission text/image, the simulator scores them, the commander refines in natural language. Two feedback rounds reached near-expert results — [arXiv 2402.01786](https://arxiv.org/abs/2402.01786v2)
- GAL: LLM agents recommend resource allocation from a grounded perception script — [arXiv 2510.12061](https://arxiv.org/abs/2510.12061v1)

**(c) Explaining results in plain language, tailored to the user**
- WildfireGPT: profile granularity changed recommendations from generic to sector-specific. Planners and homeowners wanted more explanation, climate scientists wanted concise answers. Weaknesses: long-winded answers, no clear prioritization, recommendations not traceable to sources — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)

**(d) Critiquing a user's plan**
- I found no evaluated system that critiques a human's tactical fire plan. Closest: COA-GPT's iterative refinement (human critiques the LLM, not the reverse) and the decision logs of the Cambridge LLM-commander study — [arXiv 2402.01786](https://arxiv.org/abs/2402.01786v2); [Cambridge](https://resolve.cambridge.org/core/services/aop-cambridge-core/content/view/EAA19838D50B29132CE1226CC7745F68/S0001924025100973a.pdf/contextualised-generative-ai-in-system-of-systems-modelling-an-approach-for-firefighting-aircraft-requirements.pdf)

**(e) Briefing / situation-report generation**
- ISI Foundation + UNICEF (arXiv 2512.19475, Dec 2025): an LLM pipeline turns heterogeneous humanitarian documents into "structured and evidence-grounded" situation reports. Tested on 13 events and 1,100+ documents; citation precision and recall both above 76% — [arXiv 2512.19475](https://arxiv.org/html/2512.19475v1) [self-eval]
- DataKind SitRep Summary: drafts a UNOCHA-style sitrep from source documents. Its own limitations note says the draft "does not replace expert review" — [DataKind](https://sitrep.datakind.org/about)
- SmartBook (2023, older): grounded timelines and summaries for the Ukraine conflict. It notes general chatbots do not update in real time and lack fact-checking — [arXiv 2303.14337](https://arxiv.org/html/2303.14337v3)
- LT4CPR 2026 shared task: structured sitreps from crisis social media — [ACL portal](https://www.aclweb.org/portal/content/shared-task-first-workshop-language-technologies-crisis-preparedness-and-response-lt4cpr)
- Outside emergency services, incident.io reports a 63% direct acceptance rate for AI-suggested incident summaries — [ZenML LLMOps database](https://www.zenml.io/llmops-database/building-and-deploying-an-ai-powered-incident-summary-generator) (secondary, via search snippet)

**(f) Q&A over docs / doctrine (RAG)**
- WildfireGPT literature RAG (BERT semantic search over an Argonne corpus) — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- ArcGIS Pro assistant: documentation Q&A — [Esri NSGIC deck](https://nsgic.org/wp-content/uploads/2025/11/2025-11-18-AI-in-ArcGIS-Update-for-NSGIC.pdf)
- COA-GPT puts doctrine into the prompt (in-context learning) instead of a retrieval index — [arXiv 2402.01786](https://arxiv.org/abs/2402.01786v2)

**(g) Map-aware copilot that acts on the map/UI**
- ArcGIS Pro assistant "trigger common actions", with developer-registered AI functions — [Esri NSGIC deck](https://nsgic.org/wp-content/uploads/2025/11/2025-11-18-AI-in-ArcGIS-Update-for-NSGIC.pdf)
- Esri Data Explorer: natural-language filtering and summaries over map layers — [Esri NSGIC deck](https://nsgic.org/wp-content/uploads/2025/11/2025-11-18-AI-in-ArcGIS-Update-for-NSGIC.pdf)
- map-mcp: an agent reads and drives a live **MapLibre GL** map — viewport, rendered features, layer toggles. It needs a one-line hook in the app — [map-mcp on PyPI](https://pypi.org/project/map-mcp/)
- FOSS4G 2026 talk: LLM function calling over a MapLibre GL JS app so users query geodata in natural language instead of toggling layers — [FOSS4G 2026](https://talks.osgeo.org/foss4g-2026/speaker/ENEZXN/) [abstract-only]

### Inferences
LinhaZero-specific mapping of the patterns:
- **(a)/(b) are the highest-leverage and the best fit.** The engine already accepts structured interventions (containment line, attack, protected zone, aerial drop, with start/end minutes). An LLM tool such as `propose_interventions` would emit that JSON for a "Decision B" map. The engine plus the paired ensemble then decides which plan wins, so the LLM's wrong judgments are caught by simulation rather than trusted.
- FactoryFlow's finding argues against free-form geometry. The LLM should not invent long polylines from scratch. It should anchor to features the app computes, such as the critical fire path, ridgelines/roads/firebreaks from the grid, or ETA to buildings ("line along road X between point P and Q"), and the app snaps geometry.
- **(c)** fits naturally on top of the existing "explain the result" outputs: critical path, speed split into fuel/wind/slope, ensemble win counts. The LLM rewrites already-computed numbers into pt-PT prose and must not compute them itself. WildfireGPT's complaints (verbosity, no prioritization) suggest a fixed short format, e.g. three bullets plus "what would change the answer".
- **(d)** Plan critique is plausible but unevaluated. A safer variant uses rule- and engine-grounded checks ("your line ends 200 m before the fire reaches it at min 40", "line starts after the arrival time") phrased by the LLM.
- **(e)** A briefing "export decision A vs B for the CODIS/COS" is a low-risk, high-demo-value pattern. All evidence keeps a human reviewer in the loop.
- **(f)** Doctrine Q&A over LinhaZero's own `docs/` (model limits, what a parameter means) is cheap. Q&A over Portuguese operational doctrine would need a corpus.

### Gaps
- No evaluated "LLM critiques a fire suppression plan" study found.
- No study measuring whether LLM explanations of fire-spread simulation outputs improve coordinator decisions (speed or quality).

## 3. What practitioners found useful vs. what failed (hallucinated geography, overtrust, latency)

### Takeaway
Reported successes are confirmation steps, tool-retrieved data and citations. Reported failures are:
- geographic and spatial reasoning: LLMs misplace coordinates, apply out-of-region evidence and fail at distance/direction;
- silent substitutions and over-extrapolation;
- verbose, unprioritized output;
- acting on unverified inputs.

There is evidence of favourable expert ratings that may coexist with known gaps, an overtrust risk. I found no reported latency data for emergency use.

### Cited Findings
**Useful**
- Confirmation steps (profile, plan) give users oversight. Tool-retrieved location-specific data beat general chatbots on location specificity (9/9 vs 0/6 and 4/9) — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- Human feedback rounds bring LLM-generated plans close to expert level — [COA-GPT](https://arxiv.org/abs/2402.01786v2)
- Citation-grounded drafts reach over 76% citation precision/recall in humanitarian sitreps — [arXiv 2512.19475](https://arxiv.org/html/2512.19475v1)

**Failures / risks**
- WildfireGPT:
  - When asked for RCP 8.5, it silently answered with RCP 4.5, the only data available.
  - Literature mismatched geography (West Coast studies for Virginia) or scope (fuel-treatment papers for power-line protection).
  - It extrapolated beyond the data ("relatively stable" from a minimal FWI change).
  - Some recommendations were impractical; answers were long-winded and not traceable.
  - Source: [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- Perplexity (WildfireGPT baseline) misrepresented coordinates and applied European reports to US locations — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- MapEval (ICML 2025), map-grounded questions: no model above 67% across 30 models, more than 20 points behind humans. Failures in straight-line distance, cardinal direction, routing and counting nearby places; some commonsense failures from hallucination — [arXiv 2501.00316](https://arxiv.org/pdf/2501.00316)
- GPSBench (Feb 2026): GPS/coordinate reasoning "remains challenging". Better on real-world geographic knowledge than geometric computation. Strong at country level, weak at city level — [arXiv 2602.16105](https://arxiv.org/html/2602.16105v1)
- MultiGlobeQA (46k questions, 201 territories): models fail basic distance/containment computations despite knowing geography — [ModelWire summary](https://themodelwire.com/article/benchmark-reveals-llms-struggle-with-geospatial-reasoning-across-201-territories-01KZ7ZS5ZT3DV5T7VZ5NM9PQJ3) (secondary)
- GAL's motivation: LLMs "remain text-bound and blind to geography" — [arXiv 2510.12061](https://arxiv.org/abs/2510.12061v1)
- Fabricated crisis inputs (2026): models generated priority actions from falsified crisis reports "without adequate source verification" — [DKU journal](https://ojs.vvg.hr/index.php/DKU/article/view/865) [abstract-only]
- Emergency managers rated ChatGPT's protective-action advice as largely accurate and complete, but weaker on evacuation. Their attitude toward AI became more favourable after evaluating it, a possible overtrust signal. Publication date not confirmed; may predate 2024 — [CORE](https://core.ac.uk/works/142318207)
- Survey of 272 people (Peru, Chile, 2026, public not responders): disaster expertise lowered trust in AI recommendations, AI familiarity raised it — [CENTRUM PUCP](https://centrumthink.pucp.edu.pe/articulosacademicos/the-more-you-know-the-less-you-trust-knowledge-paradox-in-ai-driven-disaster-management/)
- LLM-as-judge is unreliable for this domain: GPT-4 agreed with experts only 63–75% of the time — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)

### Inferences
- In LinhaZero the LLM should **never compute** distances, ETAs, directions or burned buildings. It should call the engine or app functions and quote the results. Benchmarks show exactly these computations are where LLMs fail.
- Silent substitution (the RCP case) has a direct LinhaZero analogue: a fallback wind or weather source used without saying so. Tool results should carry provenance (IPMA vs Open-Meteo vs user-set), and the prompt should require stating it.
- Overtrust mitigation already exists in the product: the ensemble win count ("B wins in 312/500 scenarios"). The LLM should always surface the uncertainty figure, not a single verdict.
- Latency: a first-minutes tool cannot block on a multi-step agent. Patterns where the LLM runs while the user works — e.g. drafting a briefing after the ensemble finishes, or proposing a decision B in the background — tolerate latency better than a chat that gates the map.

### Gaps
- No field reports from wildfire coordinators using LLM tools during live incidents.
- No published latency measurements for LLM copilots in emergency apps.
- No evaluation of vision-model reading of fire-spread maps.

## 4. How map-based copilots give the LLM spatial context

### Takeaway
Four approaches are seen in practice:
1. **Pre-computed text "perception scripts"** with units (GAL, WildfireGPT profile and location confirmation).
2. **Tool calls** that query the live map or GIS: viewport, rendered features, filters, layer toggles (map-mcp, Esri Data Explorer and Pro AI functions, FOSS4G talk).
3. **Structured data** in or out, e.g. GeoJSON layers (Mapbox MCP render tool, llmaps).
4. **Images** of maps or mission inputs (COA-GPT accepts mission information as images).

The evidence favours text and tools, because LLMs are weak at raw coordinate math.

### Cited Findings
- GAL compiles geodatabase retrievals (infrastructure, demographics, terrain, weather) into a **concise, unit-annotated text perception script**. It adds historical analogs and daily change signals for incremental updates — [arXiv 2510.12061](https://arxiv.org/abs/2510.12061v1)
- WildfireGPT has the user confirm exact coordinates before retrieval. Analysis is bounded to a 36 km radius; results come back as interactive maps plus text — [arXiv 2504.17200](https://arxiv.org/html/2504.17200v1)
- map-mcp exposes a live MapLibre GL map to an agent as tools: read viewport, query rendered features, toggle layers. v1, MapLibre-only, needs an app hook, does not generate maps — [map-mcp](https://pypi.org/project/map-mcp/)
- Mapbox MCP `render_map_tool`: accepts the caller's own GeoJSON layers. Stateless per call, so all layers go in one call — [DEV / Mapbox](https://dev.to/mapbox/putting-a-live-map-inside-your-ai-agents-chat-mcp-apps-and-rendermaptool-mkm); [Mapbox DevKit MCP docs](https://docs.mapbox.com/location-ai/mcp-servers/devkit-mcp-server.md)
- llmaps: generates standalone MapLibre HTML with inline GeoJSON, aimed at LLM-written code rather than a runtime copilot — [llmaps](https://pypi.org/project/llmaps/)
- Esri "Natural Language GIS": geospatial agents use GIS tools and data under rules. Item metadata (titles, field descriptions) is described as key for AI agents, i.e. layer schemas plus descriptions are the context — [Esri NSGIC deck](https://nsgic.org/wp-content/uploads/2025/11/2025-11-18-AI-in-ArcGIS-Update-for-NSGIC.pdf)
- COA-GPT accepts mission information as text or images (multimodal input) — [arXiv 2402.01786](https://arxiv.org/abs/2402.01786v2)
- MapEval tests models on map-grounded content (textual place info, API-based tool use and visual map snapshots). Even top models stay below 67% — [arXiv 2501.00316](https://arxiv.org/pdf/2501.00316)

### Inferences
Concrete recommendation for LinhaZero's context bundle:
- **Text summary built by the app**, not the raw grid. Include:
  - ignition time and place (with a toponym from OSM/fogos.pt);
  - wind and weather plus source;
  - per-decision KPIs (area, buildings burned, ensemble wins);
  - the critical path to each threatened place, with ETA and the speed split into fuel/wind/slope;
  - interventions as a list with type, start/end minutes, length and nearest named feature.
- This mirrors GAL's "unit-annotated perception script".
- **Tools for anything spatial or numerical**, for example `get_arrival_time(place)`, `list_threatened_places()`, `explain_path(place)`, `propose_intervention({type, anchor, start, end})`, `run_compare()`. The engine and ensemble stay authoritative.
- **GeoJSON only for output** (proposed interventions), always passed through a validator and a snap-to-grid step, shown as a "draft" layer the user accepts. This matches MapLibre/map-mcp-style integration.
- Screenshots to a vision model are optional and the weakest-evidenced channel. They might help a "describe what I see" feature, but should not drive decisions.

### Gaps
- No head-to-head study comparing spatial-context methods (text vs GeoJSON vs screenshots vs tool calls) for map copilots.
- I could not open Esri's 2025–2026 "What's new in AI assistants" posts (HTTP 403); their capabilities come from search snippets and the NSGIC deck. The release plan is "tentative, subject to change".
