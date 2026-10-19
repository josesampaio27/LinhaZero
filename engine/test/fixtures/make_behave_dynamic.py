# Generates behave-dynamic.json: Behave results for dynamic (curing) Scott and Burgan models, via pyrothermel 0.1.4.
# Run: pip install pyrothermel==0.1.4 && python make_behave_dynamic.py > behave-dynamic.json
import json
import pyrothermel as p
CHH_TO_MMIN = 20.1168 / 60.0
BTU_FTS_TO_KWM = 3.46141
MS_TO_MPH = 2.2369363
out = []
for num in (102, 122, 161):  # GR2, GS2, TU1
    fm = p.FuelModel.from_existing(num, units_preset='us_standard')
    params = dict(depthFt=fm.fuel_bed_depth, mxDead=fm.moisture_of_extinction_dead,
                  heatBtuLb=fm.heat_of_combustion_dead,
                  loadTonsAcre=[fm.fuel_load_one_hour, fm.fuel_load_ten_hour, fm.fuel_load_hundred_hour,
                                fm.fuel_load_live_herbaceous, fm.fuel_load_live_woody],
                  savPerFt=[fm.savr_one_hour, 109, 30, fm.savr_live_herbaceous, fm.savr_live_woody],
                  dynamic=fm.is_dynamic)
    for herb in (0.3, 0.6, 1.2):
        for wind in (0.0, 2.0):
            ms = p.MoistureScenario(0.06, 0.07, 0.08, herb, 0.9)
            r = p.PyrothermelRun(fm, ms, wind * MS_TO_MPH, units_preset='us_standard',
                                 wind_input_mode='direct_midflame', wind_direction=180, slope=0, aspect=180)
            res = r.run_surface_fire_in_direction_of_max_spread()
            out.append(dict(model=num, params=params, liveHerb=herb, windMs=wind,
                            ros=res['spread_rate'] * CHH_TO_MMIN,
                            intensity=res['fireline_intensity'] * BTU_FTS_TO_KWM))
print(json.dumps(out, indent=1))
