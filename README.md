# ShieldPay KAVACH — Parametric Income Insurance Platform

> ML-powered parametric insurance for India's gig workers. Auto-payouts on verified weather/AQI disruptions, blockchain-logged, Razorpay-billed.

---

## 📁 Project Architecture

```
ShieldPay/
├── 📦 frontend/               ← Next.js 15 App (this folder is the root)
│   ├── src/
│   │   ├── app/               ← All pages (App Router)
│   │   │   ├── page.tsx           —  Landing page
│   │   │   ├── get-started/       —  Step 1: Phone number
│   │   │   ├── verify-otp/        —  Step 2: OTP verification
│   │   │   ├── profile/           —  Step 3: User profile
│   │   │   ├── work-details/      —  Step 4: Work & schedule
│   │   │   ├── consent/           —  Step 5: Permissions
│   │   │   ├── plans/             —  Plan selection page
│   │   │   ├── payment/           —  Razorpay checkout
│   │   │   ├── dashboard/         —  Main dashboard (JWT-protected)
│   │   │   ├── claims/            —  Claim history
│   │   │   └── settings/          —  Profile & settings
│   │   ├── components/
│   │   │   ├── OnboardingLayout.tsx   —  5-step wizard wrapper with back nav
│   │   │   ├── ui/                    —  shadcn/ui components
│   │   │   └── animated/             —  Framer Motion wrappers
│   │   ├── lib/
│   │   │   ├── auth.ts          —  JWT helpers (getUser, authHeaders, setUser)
│   │   │   └── api.ts           —  Base URL helper (reads NEXT_PUBLIC_API_BASE_URL)
│   │   └── data/
│   │       └── mock.ts          —  Static chart/demo data
│   ├── public/
│   ├── .env.local               —  NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
│   └── package.json
│
├── 📦 backend/                ← Node.js + Express + Prisma
│   ├── prisma/
│   │   └── schema.prisma      —  14-model Prisma schema (PostgreSQL)
│   ├── src/
│   │   ├── app.js             —  Express entry point
│   │   ├── config/
│   │   │   ├── db.js          —  Prisma Client singleton
│   │   │   └── env.js         —  Validated env vars
│   │   ├── middleware/
│   │   │   └── auth.js        —  JWT requireAuth / optionalAuth
│   │   ├── controllers/
│   │   │   ├── authController.js      —  OTP send/verify + JWT
│   │   │   ├── userController.js      —  Profile + onboarding
│   │   │   ├── policyController.js    —  Create, pay, demo-activate
│   │   │   ├── claimController.js     —  CRUD + fraud + blockchain log
│   │   │   ├── pricingController.js   —  Quote generation
│   │   │   └── triggerController.js   —  Zone trigger status
│   │   ├── routes/
│   │   │   ├── auth.js        — /api/auth/*
│   │   │   ├── user.js        — /api/user/*
│   │   │   ├── policies.js    — /api/policies/*
│   │   │   ├── claims.js      — /api/claims/*
│   │   │   ├── pricing.js     — /api/pricing/*
│   │   │   └── triggers.js    — /api/triggers/*
│   │   ├── services/
│   │   │   ├── mlService.js          —  FastAPI caller + rule-based fallback
│   │   │   ├── fraudService.js       —  Weighted signal fraud scoring
│   │   │   ├── blockchainService.js  —  SHA-256 hash fallback (+ Sepolia ready)
│   │   │   ├── razorpayService.js    —  Razorpay order + HMAC verify
│   │   │   ├── policyService.js      —  Policy lifecycle
│   │   │   ├── claimService.js       —  Claim + ML + fraud + payout
│   │   │   ├── pricingService.js     —  Premium calculation
│   │   │   ├── triggerService.js     —  Trigger evaluation engine
│   │   │   ├── weatherService.js     —  Weather snapshot
│   │   │   ├── aqiService.js         —  AQI snapshot
│   │   │   └── zoneService.js        —  Zone resolution
│   │   ├── jobs/
│   │   │   └── scheduler.js   —  node-cron: weather/AQI polling + auto-claims
│   │   ├── db/
│   │   │   └── seed.js        —  Seeds zones + pincodes
│   │   └── utils/
│   │       └── errorHandler.js
│   └── .env                   —  DB_URL, JWT_SECRET, RAZORPAY_*, ML_SERVICE_URL
│
└── 📦 ml/                     ← Python FastAPI ML Service
    ├── main.py                —  GradientBoostingRegressor — trains on startup
    └── requirements.txt
```

---

## 🚀 Quick Start

### 1. Database (PostgreSQL + Prisma)
```bash
cd backend
npm install
npx prisma db push          # sync schema to PostgreSQL
node src/db/seed.js         # seed 12 zones + pincodes
```

### 2. Backend API
```bash
cd backend
npm run dev                 # → http://localhost:5000
```

### 3. ML Service
```bash
cd ml
pip install -r requirements.txt
uvicorn main:app --reload --port 8000   # → http://localhost:8000
```

### 4. Frontend
```bash
# root of project
npm run dev                 # → http://localhost:3000
```

---

## 🔐 Environment Variables

### `backend/.env`
```env
DATABASE_URL="postgresql://postgres:password@localhost:5432/shieldpay"
JWT_SECRET="your-super-secret"
JWT_EXPIRES_IN="7d"
RAZORPAY_KEY_ID="rzp_test_SdprcocDeEMhrK"
RAZORPAY_KEY_SECRET="yAgt8IrJagz8jiQ2ebcGNMlH"
ML_SERVICE_URL="http://localhost:8000"
BLOCKCHAIN_MODE="sha256_fallback"
PORT=5000
```

### `.env.local` (frontend root)
```env
NEXT_PUBLIC_API_BASE_URL=http://localhost:5000
```

---

## 🧪 Demo Credentials
| Field | Value |
|-------|-------|
| Any phone | 10 digits |
| Demo OTP | `123456` |
| Razorpay test card | `4111 1111 1111 1111` · Any future date · Any CVV |
| Demo bypass | Use **"Skip Payment — Demo Activate"** button on payment page |

---

## 🏗 Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), TailwindCSS, shadcn/ui |
| Backend | Node.js, Express, Prisma ORM |
| Database | PostgreSQL |
| Auth | JWT (HS256, 7-day expiry) |
| Payments | Razorpay (Test Mode) |
| ML | Python FastAPI + GradientBoostingRegressor |
| Blockchain | SHA-256 hash fallback; Sepolia (Ethers.js) ready |
| Fraud Detection | Weighted multi-signal scoring + FraudLog DB |
| Scheduler | node-cron |