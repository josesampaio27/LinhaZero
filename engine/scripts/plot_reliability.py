"""Reliability diagram from engine/src/calibration-reports/reliability-<date>.json (npm run reliability).

  python engine/scripts/plot_reliability.py <report.json> docs/modelo/fiabilidade.png   (needs matplotlib)
"""
import json
import sys

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402

rep = json.load(open(sys.argv[1]))
fig, axes = plt.subplots(1, 2, figsize=(9, 5.4), sharey=True)
for ax, (prefix, title) in zip(axes, [("unfought", "Fogo livre: intervalos livres e 1.ª observação"), ("fromIgnition", "Fogo inteiro desde a ignição (foi combatido)")]):
    ax.plot([0, 1], [0, 1], color="#888", lw=1, ls="--", label="perfeito")
    for name, label, color, m in [
        ("WindOnly", "só vento", "#4c9be8", "s"),
        ("Tuned", "aplicação: vento, humidade, combustível, ignição", "#d9480f", "D"),
    ]:
        s = rep["heldOut"][prefix + name]
        pts = [(b["predicted"], b["observed"]) for b in s["reliability"] if b["n"] >= 50]
        ax.plot([p for p, _ in pts], [o for _, o in pts], marker=m, color=color, ms=4,
                label=f"{label}\n(Brier {s['brier']:.3f}, cobertura {s['coverage']:.0%})")
    ax.set_title(title, fontsize=10)
    ax.set_xlabel("probabilidade prevista de arder")
    ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.grid(alpha=0.3)
    ax.legend(fontsize=6.5, loc="upper left", bbox_to_anchor=(0, -0.18), frameon=False)
axes[0].set_ylabel("fração que ardeu de facto")
fig.suptitle("Probabilidade sem combate contra os incêndios reais (PT-FireSprd, fogos de teste)", fontsize=10)
fig.tight_layout()
fig.savefig(sys.argv[2], dpi=130)
