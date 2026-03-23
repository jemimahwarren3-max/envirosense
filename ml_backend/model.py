import os
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import classification_report, mean_absolute_error
import pickle
import warnings
warnings.filterwarnings("ignore")

# Sensor feature columns per environment
ENV_FEATURES = {
    "mine":     ["co", "ch4", "o2", "dust", "temp", "humid"],
    "hospital": ["co2", "temp", "humid", "voc", "pm25", "noise"],
    "industry": ["temp", "vib", "press", "co", "noise", "pm10"],
    "env":      ["aqi", "pm25", "temp", "humid", "co2", "uv"],
}

RISK_LABELS = ["SAFE", "MODERATE", "HIGH RISK", "CRITICAL"]

# ─── MODEL STORE ─────────────────────────────────────────────────
# Holds trained models in memory after training
_models = {}   # { env: { "classifier": model, "regressor": model, "scaler": scaler } }

# ─── TRAIN ───────────────────────────────────────────────────────
def train(csv_dir=".", save_dir="./models"):
    """
    Loads CSVs, trains one classifier + one regressor per environment.
    Saves models to disk and keeps them in memory.
    """
    os.makedirs(save_dir, exist_ok=True)

    for env in ENV_FEATURES:
        csv_path = f"{csv_dir}/{env}_training_data.csv"

        if not os.path.exists(csv_path):
            print(f"  ⚠ No CSV found for {env} at {csv_path} — skipping")
            continue

        print(f"\nTraining models for: {env.upper()}")
        df = pd.read_csv(csv_path)

        features = ENV_FEATURES[env]
        X = df[features].values
        y_class = df["risk_label"].values    # 0-3 classification
        y_reg   = df["risk_score"].values    # 0-99 regression

        # Train / test split
        X_train, X_test, yc_train, yc_test, yr_train, yr_test = train_test_split(
            X, y_class, y_reg, test_size=0.2, random_state=42
        )

        # Scale features
        scaler = StandardScaler()
        X_train_s = scaler.fit_transform(X_train)
        X_test_s  = scaler.transform(X_test)

        # Classifier — predicts SAFE / MODERATE / HIGH RISK / CRITICAL
        clf = GradientBoostingClassifier(n_estimators=120, max_depth=4, learning_rate=0.1, random_state=42)
        clf.fit(X_train_s, yc_train)
        clf_acc = clf.score(X_test_s, yc_test)
        print(f"  Classifier accuracy : {clf_acc*100:.1f}%")

        # Regressor — predicts exact risk score 0-99
        reg = GradientBoostingRegressor(n_estimators=120, max_depth=4, learning_rate=0.1, random_state=42)
        reg.fit(X_train_s, yr_train)
        yr_pred = reg.predict(X_test_s)
        reg_mae = mean_absolute_error(yr_test, yr_pred)
        print(f"  Regressor MAE       : {reg_mae:.2f} points")

        # Feature importance
        importances = clf.feature_importances_
        print(f"  Feature importances :")
        for fname, imp in sorted(zip(features, importances), key=lambda x: -x[1]):
            bar = "█" * int(imp * 40)
            print(f"    {fname:<8} {bar} {imp*100:.1f}%")

        # Store in memory
        _models[env] = {
            "classifier": clf,
            "regressor":  reg,
            "scaler":     scaler,
            "features":   features,
            "importance": {f: round(float(imp)*100, 1) for f, imp in zip(features, importances)},
        }

        # Save to disk
        with open(f"{save_dir}/{env}_model.pkl", "wb") as f:
            pickle.dump(_models[env], f)
        print(f"  Saved → {save_dir}/{env}_model.pkl")

    print(f"\n✅ Training complete. {len(_models)} environments ready.\n")


# ─── LOAD FROM DISK ──────────────────────────────────────────────
def load(model_dir="./models"):
    """Load previously saved models from disk."""
    for env in ENV_FEATURES:
        path = f"{model_dir}/{env}_model.pkl"
        if os.path.exists(path):
            with open(path, "rb") as f:
                _models[env] = pickle.load(f)
            print(f"  Loaded model: {env}")


# ─── PREDICT ─────────────────────────────────────────────────────
def predict(env, readings: dict) -> dict:
    """
    Given an environment name and a dict of sensor readings,
    returns a full prediction result.

    Returns:
        {
          risk_score:       int   (0-99),
          risk_label:       str   ("SAFE" / "MODERATE" / "HIGH RISK" / "CRITICAL"),
          risk_class:       int   (0-3),
          maintenance_risk: int   (0-99),
          anomaly_prob:     int   (0-99),
          feature_importance: { sensor_key: float },
          confidence:       float (0-1),
        }
    """
    if env not in _models:
        # Fallback if model not trained yet
        return _fallback_predict(env, readings)

    m        = _models[env]
    features = m["features"]
    scaler   = m["scaler"]
    clf      = m["classifier"]
    reg      = m["regressor"]

    # Build feature vector in correct order
    X = np.array([[readings.get(f, 0) for f in features]])
    X_s = scaler.transform(X)

    # Predictions
    risk_class  = int(clf.predict(X_s)[0])
    risk_proba  = clf.predict_proba(X_s)[0]
    risk_score  = int(np.clip(reg.predict(X_s)[0], 0, 99))
    confidence  = float(risk_proba[risk_class])

    # Maintenance risk — driven by sensors that indicate wear (temp, vibration, pressure)
    wear_sensors = {"vib", "temp", "press", "co", "ch4"}
    wear_vals = [readings.get(f, 0) for f in features if f in wear_sensors]
    maintenance_risk = int(np.clip(risk_score * 0.8 + (np.mean(wear_vals) % 20 if wear_vals else 0), 0, 99))

    # Anomaly probability — based on classifier uncertainty (1 - max_proba)
    anomaly_prob = int(np.clip((1 - confidence) * 100 + risk_class * 10, 0, 99))

    return {
        "risk_score":         risk_score,
        "risk_label":         RISK_LABELS[risk_class],
        "risk_class":         risk_class,
        "maintenance_risk":   maintenance_risk,
        "anomaly_prob":       anomaly_prob,
        "feature_importance": m["importance"],
        "confidence":         round(confidence, 3),
    }


def _fallback_predict(env, readings):
    """Simple formula-based fallback if model hasn't been trained."""
    from simulator import label_reading, ENV_SENSORS
    sensors = ENV_SENSORS.get(env, [])
    score = 0
    max_score = 0
    for i, s in enumerate(sensors):
        val  = readings.get(s["key"], s["base"])
        rng  = s["max"] - s["min"]
        norm = (val - s["min"]) / rng
        danger = (1 - norm) if s["inverted"] else norm
        weight = 2.5 if i == 0 else 1.0
        score += danger * weight
        max_score += weight
    risk_score = int(min(99, (score / max_score) * 100)) if max_score else 0
    risk_class = 0 if risk_score < 25 else 1 if risk_score < 50 else 2 if risk_score < 75 else 3
    return {
        "risk_score":         risk_score,
        "risk_label":         RISK_LABELS[risk_class],
        "risk_class":         risk_class,
        "maintenance_risk":   max(0, risk_score - 10),
        "anomaly_prob":       max(0, risk_score - 15),
        "feature_importance": {},
        "confidence":         0.0,
    }


# ─── RUN DIRECTLY TO TRAIN ───────────────────────────────────────
if __name__ == "__main__":
    # Step 1: generate CSVs if not present
    import simulator
    if not os.path.exists("mine_training_data.csv"):
        simulator.generate_csv(rows_per_scenario=300, output_dir=".")

    # Step 2: train
    train(csv_dir=".", save_dir="./models")

    # Step 3: test a prediction
    print("Test prediction (mine, dangerous readings):")
    result = predict("mine", {"co": 120, "ch4": 45, "o2": 18.5, "dust": 6, "temp": 42, "humid": 85})
    for k, v in result.items():
        print(f"  {k}: {v}")
