"""Per-fire Sørensen of the tier A fires: python plot_tier_a.py <scores.json> <manifest.json> <out.png> (needs matplotlib)."""
import json, sys
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
rep = json.load(open(sys.argv[1])); man = {e["fire"]: e for e in json.load(open(sys.argv[2]))["cases"]}
rows = [p for p in rep["perFire"] if p["tier"] == "A"]
rows.sort(key=lambda p: p["sorensen"]["current"])
names = [p["fire"].rsplit("_", 1)[0] + " " + p["fire"][-4:] + (" (N)" if man[p["fire"]]["region"] == "Norte" else "") for p in rows]
fig, ax = plt.subplots(figsize=(7.5, 9))
y = range(len(rows))
for key, label, color, m in [("legacy", "Simples", "#999999", "o"), ("uncalibrated", "Rothermel sem calibração", "#4c9be8", "s"), ("current", "Rothermel calibrado, com fogo de copas", "#d9480f", "D")]:
    ax.scatter([p["sorensen"][key] for p in rows], y, label=label, color=color, marker=m, s=22, zorder=3)
ax.set_yticks(list(y)); ax.set_yticklabels(names, fontsize=7.5)
ax.set_xlabel("Sørensen médio nas horas observadas (desde a ignição)")
ax.set_xlim(0, 1); ax.grid(axis="x", alpha=0.3)
ax.set_title("PT-FireSprd tier A (2018–2021): 34 incêndios\n(N) = região Norte", fontsize=10)
ax.legend(loc="lower right", fontsize=8)
fig.tight_layout(); fig.savefig(sys.argv[3], dpi=130)
