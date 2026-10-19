# Generates behave-anderson.json: Behave (BehavePlus C++ core) results via pyrothermel 0.1.4.
# Run: pip install pyrothermel==0.1.4 && python make_behave_reference.py > behave-anderson.json
# Uses the us_standard preset: the metric preset of 0.1.4 mislabels SAV units.
import json
import pyrothermel as p
CHH_TO_MMIN = 20.1168 / 60.0      # chains/h -> m/min
BTU_FTS_TO_KWM = 3.46141
FT_TO_M = 0.3048
MS_TO_MPH = 2.2369363
ms = p.MoistureScenario(0.06, 0.07, 0.08, 0.60, 0.90)
out = []
# windFromDeg is meteorological (direction the wind blows from); aspect = downslope direction
cases = [
  # aligned: wind from south (blows north), slope faces south (upslope north)
  dict(windMs=0.0, windFromDeg=180, slopeDeg=0.0, aspectDeg=180),
  dict(windMs=1.0, windFromDeg=180, slopeDeg=0.0, aspectDeg=180),
  dict(windMs=3.0, windFromDeg=180, slopeDeg=0.0, aspectDeg=180),
  dict(windMs=0.0, windFromDeg=180, slopeDeg=26.565051, aspectDeg=180),
  dict(windMs=3.0, windFromDeg=180, slopeDeg=26.565051, aspectDeg=180),
  # cross: wind from west (blows east), upslope north
  dict(windMs=3.0, windFromDeg=270, slopeDeg=26.565051, aspectDeg=180),
  # very strong wind (tests the wind limit)
  dict(windMs=12.0, windFromDeg=180, slopeDeg=0.0, aspectDeg=180),
]
for num in (1, 2, 4, 8, 9, 10, 13):
    fm = p.FuelModel.from_existing(num, units_preset='us_standard')
    for c in cases:
        r = p.PyrothermelRun(fm, ms, c['windMs'] * MS_TO_MPH, units_preset='us_standard',
                             wind_input_mode='direct_midflame', wind_direction=c['windFromDeg'],
                             slope=c['slopeDeg'], aspect=c['aspectDeg'])
        res = r.run_surface_fire_in_direction_of_max_spread()
        head = dict(ros=res['spread_rate'] * CHH_TO_MMIN,
                    intensity=res['fireline_intensity'] * BTU_FTS_TO_KWM,
                    flame=res['flame_length'] * FT_TO_M, dir=res['direction'])
        d = res['direction']
        flank = r.run_surface_fire_in_direction_of_interest((d + 90) % 360)['spread_rate'] * CHH_TO_MMIN
        back = r.run_surface_fire_in_direction_of_interest((d + 180) % 360)['spread_rate'] * CHH_TO_MMIN
        out.append(dict(model=num, **c, **head, flankRos=flank, backRos=back))
print(json.dumps(out, indent=1))
