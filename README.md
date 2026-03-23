# EnviroSense — Universal Environmental Monitoring Dashboard
### MSU Incubation Hub · Innovation Pitch 2025

---

## What This Is

A full-stack environmental monitoring dashboard that simulates sensor data across 4 environments — mines, hospitals, industrial facilities, and outdoor spaces. Includes an ML-powered risk scoring engine and scenario simulation.

---

## Project Structure

```
envirosense/
├── index.html
├── vite.config.js
├── package.json
├── src/
│   ├── main.jsx        ← App entry point
│   ├── App.jsx         ← Full dashboard (all pages)
│   └── index.css       ← Global styles
└── README.md
```

---

## Quick Start (3 steps)

### Step 1 — Install Node.js
Download from: https://nodejs.org (choose the LTS version)

### Step 2 — Install dependencies
Open a terminal in this folder and run:
```bash
npm install
```

### Step 3 — Start the app
```bash
npm run dev
```

Then open your browser at: **http://localhost:5173**

---

## Dashboard Pages

| Page | Environment | Sensors | Scenarios |
|------|-------------|---------|-----------|
| Overview | All environments | Live risk scores | — |
| Mine | Underground mining | CO, Methane, O₂, Dust, Temp, Humidity | 5 |
| Hospital | Hospital ward | CO₂, VOC, PM2.5, Temp, Humidity, Noise | 5 |
| Industry | Industrial facility | Temp, Vibration, Pressure, CO, Noise, PM10 | 5 |
| Outdoor | Environmental | AQI, PM2.5, Temp, Humidity, CO₂, UV Index | 5 |

---

## ML Features (Simulated)

The current ML engine runs in JavaScript (simulated). Each page shows:
- **Health Risk Score** (0–100 gauge)
- **Maintenance Risk %**
- **Anomaly Detection %**
- **Feature Importance** bar chart
- **Model Recommendation** text

---

## Connecting a Real Python ML Backend

When you're ready to add real ML, follow these steps:

### 1. Install Python dependencies
```bash
pip install fastapi uvicorn scikit-learn numpy pandas
```

### 2. Create the Python API (ml_backend/main.py)
```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import numpy as np

app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

class SensorData(BaseModel):
    env: str
    readings: dict
    scenario: int

@app.post("/predict")
def predict(data: SensorData):
    # Replace with your trained sklearn model
    values = list(data.readings.values())
    risk_score = min(99, int(np.mean(values) % 100 + data.scenario * 10))
    return {
        "risk_score": risk_score,
        "maintenance_risk": min(99, risk_score + 10),
        "anomaly_prob": min(99, risk_score - 5),
        "recommendation": "Safe" if risk_score < 25 else "Warning" if risk_score < 50 else "Critical"
    }
```

### 3. Run the Python backend
```bash
uvicorn main:app --reload --port 8000
```

### 4. Connect React to Python
In `src/App.jsx`, replace the `computeRiskScore()` call in `MLPanel` with:
```javascript
const [mlResult, setMlResult] = useState({ risk_score: 0, maintenance_risk: 0, anomaly_prob: 0 });

useEffect(() => {
  fetch("http://localhost:8000/predict", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ env: envKey, readings, scenario: scenarioIdx })
  })
  .then(r => r.json())
  .then(setMlResult);
}, [readings]);
```

---

## Build for Production
```bash
npm run build
```
Output goes to the `dist/` folder — ready to deploy anywhere.

---

## Tech Stack
- **React 18** — UI framework
- **Vite** — Build tool / dev server
- **Recharts** — Charts and graphs
- **Python FastAPI** *(future)* — ML backend
- **scikit-learn** *(future)* — ML model (Random Forest / Gradient Boosting)

---

