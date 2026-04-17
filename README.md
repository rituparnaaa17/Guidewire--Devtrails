# 🛡️ ShieldPay — Autonomous Parametric Income Protection

**ShieldPay** is a production-ready insure-tech platform designed to protect gig workers from **real-world income disruptions** caused by environmental and systemic events such as heavy rainfall, extreme AQI, and heatwaves.

Traditional insurance requires manual claims, adjusters, and weeks to pay out. ShieldPay monitors hyper-local weather sensors in real-time, automatically triggering income protection payouts to affected workers' wallets the moment conditions become hazardous—**zero paperwork required**.

To ensure platform viability, ShieldPay is guarded by a **Strict Fraud Enforcement Engine** that utilizes live GPS geofencing, PPCS (Predictive Pattern Confidence Scoring), and XGBoost machine learning to permanently halt fraudulent claims before they are even processed.

---

## 🎯 Problem Statement

India relies on an ecosystem of over **12M+ gig workers** (delivery partners, mobility drivers, logistics). Their earnings are:
* **Daily-dependent:** They earn only when they drive.
* **Highly volatile:** No fixed monthly salary.
* **Environmentally exposed:** Extreme weather halts their ability to work safely.

**The Real Impact:**
| Event | Effect on Gig Workers |
|-------|-----------------------|
| 🌧️ **Heavy Rain** | Orders surge, but roads flood—unsafe to work. |
| 🌫️ **AQI > 400** | Hazardous to breathe during a 12-hour shift. |
| 🌡️ **Heatwaves** | Risk of heatstroke reduces active working hours. |

👉 **Result:** Immediate income loss with zero ongoing protection.

---

## 💡 The ShieldPay Solution

ShieldPay flips the traditional insurance model using a **real-time parametric system**. Instead of waiting for a user to report a loss, ShieldPay mathematically knows when a loss occurs and triggers the payout autonomously.

```text
Real-world condition → API Trigger → Automated Draft Claim → ML Fraud Validation → Instant Payout
```

---

## 🎥 Pitch Deck & Demo Video

Watch the complete demonstration of the ShieldPay platform, our value proposition, and the live parametric claim pipeline in action:

📺 **[View ShieldPay Pitch & Demo Video on Google Drive](https://drive.google.com/file/d/13yMjN79GA47zf18NHV7RfZ5j1J6HGuX-/view?usp=sharing)**

---

## 🏗️ Architecture & Tech Stack

ShieldPay is built using a decoupled, highly-scalable three-tier architecture:

| Layer | Technology Stack | Description |
|-------|------------------|-------------|
| **Frontend** | React, Next.js (App Router), Tailwind CSS | Glassmorphism dashboard, dynamic pricing UI, Recharts for analytics, live fraud notification system. |
| **Backend** | Node.js, Express.js | Core scheduled cron jobs, trigger evaluation pipeline, policy issuance, PPCS heuristics, and Razorpay API webhooks. |
| **Database** | PostgreSQL, Prisma ORM | Relational data integrity for user wallets, claim logs, zone matrices, and policy ledgers. |
| **Machine Learning** | Python, FastAPI, XGBoost, Scikit-Learn | A unified ML app running GradientBoosting for income loss prediction and XGBoost for anti-fraud probability scoring. |
| **External APIs**| OpenWeatherMap, CPCB AQI, Razorpay | Live hyper-local data fetching and automated instant bank payouts. |

---

## 🚦 End-to-End System Workflow

1. **User Onboarding:** Gig worker connects their details.
2. **Dynamic Pricing:** Premium is calculated live based on historical zone risk.
3. **Policy Activation:** Worker pays the dynamic premium.
4. **Live Polling:** Node-Cron fetches Weather/AQI for the active zone every 30 mins.
5. **Trigger Engine:** System flags hazardous conditions (e.g. Rain > 35mm).
6. **Automated Claiming:** A claim is automatically drafted for the affected worker.
7. **Unified ML & Fraud Engine:** Validates GPS, scores behavior, and detects anomalies.
8. **Razorpay Payout:** Funds are instantly deposited to the worker's digital wallet/UPI.

---

## 🌦️ The Parametric Claim Processing Engine

ShieldPay uses **real-time APIs** to validate disruptions without human intervention.

### 🌧️ OpenWeatherMap API Integration
* **Data Extracted:** Rainfall/hr, local temperature, wind speeds.
* **Trigger Logic:** 
  * Level 1: > 35 mm/h
  * Level 2: > 50 mm/h
  * Level 3: > 75 mm/h

### 🌫️ AQI System (CPCB)
* **Trigger Logic:**
  * Level 1: > 200 AQI
  * Level 2: > 300 AQI
  * Level 3: > 400 AQI 

**Processing Rule:** `IF condition > threshold THEN auto_generate_claim()`

---

## 🤖 Unified ML & Fraud Enforcement Engine

Because claims are completely automated, they are ripe for abuse (e.g., GPS spoofing, bot nets). ShieldPay deploys a ruthless enforcement layer to protect the liquidity pool.

### Phase 1: Hard Block Constraints (No Claim Created)
* **Live Geofencing:** Device GPS must match the registered policy zone. Distance > 5km mismatch yields an immediate `ZONE_NOT_VERIFIED` block.
* **Inception Age:** Policies under 24h old cannot claim (prevents buying insurance *while* it's already pouring).
* **Duplicate Window:** Triggering the same event within a 6-hour window is barred.

### Phase 2: Soft Scoring & PPCS Calculation
* **PPCS (Predictive Pattern Confidence Score):** Evaluates device hygiene (0-100).
  * *Jitter Detection:* GPS coordinates with zero natural jitter suggest a Mock Location Root App. (-30 penalty).
* **Claim Velocity Pattern:** Checks for anomalous claim spikes across sliding 7-day and 28-day windows.

### Phase 3: ML XGBoost Assessment
The remaining claims hit our Python Microservice. The service runs an **XGBoost Classifier** that inspects income velocity, UPI cluster footprints, and non-linear patterns, outputting a precise Fraud Probability.
* **Decision Matrix:**
  * `ML Probability < 30%` & `PPCS > 80` ➔ **APPROVE**
  * `ML Probability 30%-60%` ➔ **HOLD FOR MANUAL REVIEW**
  * `ML Probability > 80%` ➔ **AUTO-BLOCK & SUSPEND POLICY**

---

## 💸 Dynamic Pricing & Payouts Engine

### Risk-Based Pricing Model
Instead of a flat monthly fee, the API dynamically assesses risk:
`Premium = weekly_income × base_rate × zone_risk_score × season_multiplier`
* *A gig worker in a historically flood-prone zone during monsoon will have a dynamically calculated higher premium.* 
* **Constraint:** Floor ₹20, Capped at ₹120.

### Razorpay Integration
Payouts leverage the Razorpay API for immediate fund transfer:
1. Contact & Fund Account creation via IMPS/UPI.
2. Webhook listener updates PostgreSQL immediately so the frontend dashboard turns "Green".

---

## 🎭 Real-World Scenarios

### 🟢 Scenario 1 — The Honest Delivery Partner
* **Event:** Rajesh is a Zomato rider in Koramangala. A severe monsoon hits (Rainfall 60mm/h).
* **System Action:** OpenWeatherMap API detects conditions and triggers an L2 Rain event.
* **Pipeline:** Rajesh's policy is active. His GPS confirms he is physically in Koramangala.
* **Result:** The Fraud Engine logs a PPCS of 95 (healthy movement). The ML model returns 2% risk. Status = `APPROVE`. Rajesh gets a push notification that `₹850` was instantly routed to his wallet.

### 🔴 Scenario 2 — The Opportunistic Spoofer
* **Event:** Same monsoon in Koramangala. Akash is sitting at home in Mumbai but uses a Mock GPS root app to fake his location to Koramangala to harvest free payouts.
* **System Action:** Auto-pipeline drafts a claim for Akash.
* **Pipeline:** Fraud Engine evaluates Akash's device.
* **Result:** The PPCS mechanism notices the GPS coordinates have virtually zero natural jitter. Furthermore, the ML detects a high velocity ratio for Akash. The Fraud Engine completely blocks the claim. Akash is flagged, and his dashboard is locked.

---

## 💻 How to Run the Project Locally

The ShieldPay ecosystem relies on three synchronized services. Please ensure your ports (`3000`, `5000`, `8000`) are clear before starting.

### 1. Clone the repository
```bash
git clone https://github.com/rituparnaaa17/ShieldPay.git
cd ShieldPay
```

### 2. Boot the ML Fraud & Loss Prediction Unified Service
This Python microservice houses the GradientBoosting and XGBoost ML instances.
```bash
cd ml
pip install -r requirements.txt
uvicorn unified_app:app --reload --port 8000
```
*(Runs securely on `http://localhost:8000`)*

### 3. Setup PostgreSQL & Boot the Backend
The backend scheduler orchestrates the parametric polling and hitting the ML endpoints.
```bash
cd ../backend
npm install

# Ensure PostgreSQL is running and update backend/.env
# Sync the Prisma Schema:
npx prisma db push
npx prisma generate

# Start the Express server
npm run dev
```
*(Runs securely on `http://localhost:5000`)*

### 4. Boot the Next.js Frontend
```bash
cd ../frontend
npm install
npm run dev
```
*(Runs securely on `http://localhost:3000`)*

**🔥 You're all set!** Navigate to `http://localhost:3000` in your browser to view the ShieldPay Dashboard.

---

*“We don’t just insure income — we verify, validate, and deliver it instantly.”*
