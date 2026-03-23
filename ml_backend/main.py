import os
import json
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import simulator
import model as ml

app = FastAPI(title="EnviroSense ML Backend")

# Allow React frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── STARTUP: generate CSVs → train models ───────────────────────
@app.on_event("startup")
async def startup():
    print("\n🚀 EnviroSense ML Backend starting...")
    csv_dir   = "./ml_backend"
    model_dir = "./ml_backend/models"
    os.makedirs(model_dir, exist_ok=True)

    # Generate training CSVs
    print("Generating training data...")
    simulator.generate_csv(rows_per_scenario=300, output_dir=csv_dir)

    # Train models
    print("Training ML models...")
    ml.train(csv_dir=csv_dir, save_dir=model_dir)
    print("✅ ML models ready!\n")


# ─── REQUEST / RESPONSE MODELS ───────────────────────────────────
class PredictRequest(BaseModel):
    env:      str          # "mine" | "hospital" | "industry" | "env"
    readings: dict         # { "co": 45.2, "ch4": 8.1, ... }
    scenario: int = 0      # 0-4


class PredictResponse(BaseModel):
    risk_score:          int
    risk_label:          str
    risk_class:          int
    maintenance_risk:    int
    anomaly_prob:        int
    feature_importance:  dict
    confidence:          float


# ─── ROUTES ──────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "EnviroSense ML API running", "environments": list(simulator.ENV_SENSORS.keys())}


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    """
    Main prediction endpoint.
    React calls this every time sensor readings update.
    """
    result = ml.predict(req.env, req.readings)
    return result


@app.get("/stream/{env}/{scenario}")
async def stream(env: str, scenario: int):
    """
    Server-Sent Events stream of live simulated sensor data + ML predictions.
    React can connect to this for fully server-driven live updates.

    Usage: GET /stream/mine/1
    """
    async def event_generator():
        sensors = simulator.ENV_SENSORS.get(env, [])
        biases  = simulator.SCENARIO_BIAS.get(env, [{}])
        bias    = biases[scenario] if scenario < len(biases) else {}
        t = 0
        import math, random
        while True:
            readings = {}
            for s in sensors:
                wave = math.sin(t * 0.05) * s["noise"] * 0.5
                rand = (random.random() - 0.5) * s["noise"]
                val  = s["base"] + bias.get(s["key"], 0) + wave + rand
                readings[s["key"]] = round(max(s["min"], min(s["max"], val)), 2)

            prediction = ml.predict(env, readings)
            payload = {**readings, **prediction, "t": t}
            yield f"data: {json.dumps(payload)}\n\n"
            t += 1
            await asyncio.sleep(1.8)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.get("/health")
def health():
    return {
        "status": "ok",
        "models_loaded": list(ml._models.keys()),
    }
