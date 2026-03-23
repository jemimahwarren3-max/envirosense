import numpy as np
import pandas as pd
import time
import math
import random
from datetime import datetime

# ─── SENSOR DEFINITIONS (must match React frontend) ───────────────
ENV_SENSORS = {
    "mine": [
        {"key": "co",    "min": 0,   "max": 200,  "safe": 35,   "warn": 100,  "base": 20,   "noise": 8,   "inverted": False},
        {"key": "ch4",   "min": 0,   "max": 100,  "safe": 10,   "warn": 40,   "base": 5,    "noise": 4,   "inverted": False},
        {"key": "o2",    "min": 15,  "max": 23,   "safe": 20.9, "warn": 19.5, "base": 20.9, "noise": 0.3, "inverted": True},
        {"key": "dust",  "min": 0,   "max": 10,   "safe": 2,    "warn": 5,    "base": 1.2,  "noise": 0.5, "inverted": False},
        {"key": "temp",  "min": 15,  "max": 55,   "safe": 30,   "warn": 40,   "base": 28,   "noise": 1.5, "inverted": False},
        {"key": "humid", "min": 20,  "max": 100,  "safe": 80,   "warn": 90,   "base": 65,   "noise": 3,   "inverted": False},
    ],
    "hospital": [
        {"key": "co2",   "min": 300, "max": 3000, "safe": 800,  "warn": 1500, "base": 550,  "noise": 40,  "inverted": False},
        {"key": "temp",  "min": 18,  "max": 30,   "safe": 22,   "warn": 26,   "base": 22,   "noise": 0.5, "inverted": False},
        {"key": "humid", "min": 20,  "max": 80,   "safe": 60,   "warn": 70,   "base": 50,   "noise": 2,   "inverted": False},
        {"key": "voc",   "min": 0,   "max": 500,  "safe": 100,  "warn": 250,  "base": 60,   "noise": 15,  "inverted": False},
        {"key": "pm25",  "min": 0,   "max": 150,  "safe": 12,   "warn": 35,   "base": 8,    "noise": 3,   "inverted": False},
        {"key": "noise", "min": 20,  "max": 90,   "safe": 45,   "warn": 60,   "base": 38,   "noise": 4,   "inverted": False},
    ],
    "industry": [
        {"key": "temp",  "min": 10,  "max": 120,  "safe": 60,   "warn": 85,   "base": 45,   "noise": 3,   "inverted": False},
        {"key": "vib",   "min": 0,   "max": 20,   "safe": 4,    "warn": 10,   "base": 2.5,  "noise": 0.8, "inverted": False},
        {"key": "press", "min": 0,   "max": 15,   "safe": 8,    "warn": 11,   "base": 6,    "noise": 0.3, "inverted": False},
        {"key": "co",    "min": 0,   "max": 300,  "safe": 50,   "warn": 100,  "base": 25,   "noise": 8,   "inverted": False},
        {"key": "noise", "min": 40,  "max": 110,  "safe": 85,   "warn": 95,   "base": 72,   "noise": 4,   "inverted": False},
        {"key": "pm10",  "min": 0,   "max": 200,  "safe": 50,   "warn": 100,  "base": 35,   "noise": 8,   "inverted": False},
    ],
    "env": [
        {"key": "aqi",   "min": 0,   "max": 300,  "safe": 50,   "warn": 100,  "base": 35,   "noise": 8,   "inverted": False},
        {"key": "pm25",  "min": 0,   "max": 250,  "safe": 12,   "warn": 35,   "base": 10,   "noise": 3,   "inverted": False},
        {"key": "temp",  "min": 5,   "max": 45,   "safe": 35,   "warn": 40,   "base": 26,   "noise": 2,   "inverted": False},
        {"key": "humid", "min": 10,  "max": 100,  "safe": 80,   "warn": 90,   "base": 55,   "noise": 5,   "inverted": False},
        {"key": "co2",   "min": 380, "max": 1000, "safe": 450,  "warn": 600,  "base": 415,  "noise": 10,  "inverted": False},
        {"key": "uv",    "min": 0,   "max": 12,   "safe": 3,    "warn": 6,    "base": 4,    "noise": 1,   "inverted": False},
    ],
}

SCENARIO_BIAS = {
    "mine": [
        {"co": 0,  "ch4": 0,  "o2": 0,    "dust": 0, "temp": 0,  "humid": 0 },
        {"co": 80, "ch4": 35, "o2": -1.5, "dust": 1, "temp": 2,  "humid": 5 },
        {"co": 60, "ch4": 20, "o2": -2,   "dust": 3, "temp": 8,  "humid": 15},
        {"co": 5,  "ch4": 3,  "o2": 0,    "dust": 6, "temp": 1,  "humid": 2 },
        {"co": 10, "ch4": 5,  "o2": -0.5, "dust": 2, "temp": 18, "humid": 10},
    ],
    "hospital": [
        {"co2": 0,   "temp": 0, "humid": 0,  "voc": 0,   "pm25": 0,  "noise": 0 },
        {"co2": 600, "temp": 2, "humid": 8,  "voc": 30,  "pm25": 5,  "noise": 10},
        {"co2": 100, "temp": 1, "humid": 3,  "voc": 200, "pm25": 15, "noise": 5 },
        {"co2": 400, "temp": 4, "humid": 15, "voc": 50,  "pm25": 8,  "noise": 3 },
        {"co2": 200, "temp": 1, "humid": 5,  "voc": 80,  "pm25": 10, "noise": 15},
    ],
    "industry": [
        {"temp": 0,  "vib": 0,   "press": 0, "co": 0,  "noise": 0,  "pm10": 0 },
        {"temp": 25, "vib": 3,   "press": 2, "co": 20, "noise": 8,  "pm10": 20},
        {"temp": 15, "vib": 12,  "press": 1, "co": 10, "noise": 12, "pm10": 10},
        {"temp": 10, "vib": 2,   "press": 5, "co": 5,  "noise": 5,  "pm10": 5 },
        {"temp": 5,  "vib": 0.5, "press": 0, "co": 2,  "noise": 2,  "pm10": 30},
    ],
    "env": [
        {"aqi": 0,   "pm25": 0,   "temp": 0,  "humid": 0,   "co2": 0,  "uv": 0 },
        {"aqi": 80,  "pm25": 30,  "temp": 3,  "humid": -10, "co2": 60, "uv": 1 },
        {"aqi": 150, "pm25": 100, "temp": 5,  "humid": -15, "co2": 30, "uv": -1},
        {"aqi": -15, "pm25": -5,  "temp": -5, "humid": 30,  "co2": 10, "uv": -3},
        {"aqi": 30,  "pm25": 10,  "temp": 14, "humid": -20, "co2": 5,  "uv": 5 },
    ],
}

SCENARIO_NAMES = {
    "mine":     ["Normal Operations", "Gas Pocket", "Ventilation Failure", "Dust Storm", "Deep Level Heat"],
    "hospital": ["Normal Ward", "High Occupancy", "Chemical Spill", "HVAC Fault", "Post-Procedure"],
    "industry": ["Normal Run", "Overload", "Bearing Failure", "Pressure Spike", "Emergency Shutdown"],
    "env":      ["Clear Day", "Industrial Smog", "Bushfire Smoke", "Rainy Season", "Heatwave"],
}

# ─── LABELLING LOGIC ─────────────────────────────────────────────
def label_reading(env, readings, scenario_idx):
    """
    Compute a risk_score (0-100) and risk_label for a set of readings.
    This is the GROUND TRUTH used to train the ML model.
    """
    sensors = ENV_SENSORS[env]
    score = 0
    max_score = 0
    for i, s in enumerate(sensors):
        val = readings.get(s["key"], s["base"])
        rng = s["max"] - s["min"]
        normalized = (val - s["min"]) / rng
        danger = (1 - normalized) if s["inverted"] else normalized
        weight = 2.5 if i == 0 else 1.0
        score += danger * weight
        max_score += weight

    base_risk = (score / max_score) * 100
    scenario_boost = scenario_idx * 12
    risk_score = min(99, round(base_risk + scenario_boost))

    if risk_score < 25:
        risk_label = 0   # SAFE
    elif risk_score < 50:
        risk_label = 1   # MODERATE
    elif risk_score < 75:
        risk_label = 2   # HIGH RISK
    else:
        risk_label = 3   # CRITICAL

    return risk_score, risk_label

# ─── SINGLE READING GENERATOR ────────────────────────────────────
def generate_reading(sensor, bias, t):
    wave = math.sin(t * 0.05) * sensor["noise"] * 0.5
    rand = (random.random() - 0.5) * sensor["noise"]
    val  = sensor["base"] + bias.get(sensor["key"], 0) + wave + rand
    return round(max(sensor["min"], min(sensor["max"], val)), 2)

# ─── CSV GENERATOR ───────────────────────────────────────────────
def generate_csv(rows_per_scenario=200, output_dir="."):
    """
    Generates one CSV file per environment with labelled training data.
    Each CSV has columns: timestamp, scenario, sensor1, sensor2, ..., risk_score, risk_label
    """
    print("Generating training data CSVs...")
    for env in ENV_SENSORS:
        sensors  = ENV_SENSORS[env]
        biases   = SCENARIO_BIAS[env]
        names    = SCENARIO_NAMES[env]
        records  = []

        for sc_idx, (bias, sc_name) in enumerate(zip(biases, names)):
            for row in range(rows_per_scenario):
                t = row
                readings = {s["key"]: generate_reading(s, bias, t) for s in sensors}
                risk_score, risk_label = label_reading(env, readings, sc_idx)

                record = {
                    "timestamp":    datetime.now().isoformat(),
                    "scenario_idx": sc_idx,
                    "scenario":     sc_name,
                }
                record.update(readings)
                record["risk_score"] = risk_score
                record["risk_label"] = risk_label
                records.append(record)

        df = pd.DataFrame(records)
        path = f"{output_dir}/{env}_training_data.csv"
        df.to_csv(path, index=False)
        print(f"  ✓ {path}  ({len(df)} rows, {len(sensors)} sensors)")

    print("Done! CSVs ready for model training.\n")

# ─── LIVE STREAM GENERATOR ───────────────────────────────────────
def stream_live(env, scenario_idx, interval=1.8):
    """
    Yields live sensor readings indefinitely, matching the React simulation.
    Used by FastAPI to stream data to the frontend.
    """
    sensors = ENV_SENSORS[env]
    bias    = SCENARIO_BIAS[env][scenario_idx]
    t = 0
    while True:
        readings = {s["key"]: generate_reading(s, bias, t) for s in sensors}
        risk_score, risk_label = label_reading(env, readings, scenario_idx)
        yield {
            "t":           t,
            "env":         env,
            "scenario":    scenario_idx,
            "readings":    readings,
            "risk_score":  risk_score,
            "risk_label":  risk_label,
            "timestamp":   datetime.now().isoformat(),
        }
        t += 1
        time.sleep(interval)


# ─── RUN DIRECTLY TO GENERATE CSVs ──────────────────────────────
if __name__ == "__main__":
    generate_csv(rows_per_scenario=300, output_dir=".")
    print("Sample live stream (mine, scenario 1 - Gas Pocket):")
    for i, reading in enumerate(stream_live("mine", 1, interval=0.3)):
        print(reading)
        if i >= 5:
            break
