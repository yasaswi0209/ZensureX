# ZensureX

**Automatic income protection for delivery workers.**

ZensureX pays gig workers (Swiggy, Zomato, Uber, Rapido, Zepto and others) automatically when rain, extreme heat or pollution stops them from earning. There are no claim forms and no waiting. A worker buys a weekly plan, and when conditions in their area cross a threshold, a payout is triggered and drawn from a shared zone pool.

- Live app: https://zensurex.vercel.app
- Backend API: https://zensurex-backend.onrender.com (interactive docs at `/docs`)

---

## Features

- **Weekly plans** priced by the backend from a location-based premium model, never from the price the browser sends.
- **Razorpay checkout** with server-side signature verification, amount and currency checks, and a 7-day plan lock.
- **Automated claims** based on live weather and air quality, with a fraud check and a 10-minute cooldown per worker.
- **Plan-based cover.** Each plan pays only for the events it covers and never more than its coverage amount.
- **Zone pools.** Premiums from workers in the same area (about a 10 km radius, or the same city) go into a shared pool, and payouts are drawn from it.
- **Safe retries.** A payment is credited to the pool only once, even if verification is retried.
- **Profile page** showing the current plan, price, cover, active-until date and the last 10 verified payments with Razorpay payment IDs.
- **Dashboard** with weather, risk, recent claims and pool summary.

---

## Tech stack

| Layer | Technology |
|-------|------------|
| Frontend | React (Create React App), Axios, hosted on Vercel |
| Backend | Python, FastAPI, SQLAlchemy, hosted on Render |
| Payments | Razorpay Orders and Checkout |
| Data | Weather and AQI API (`app/utils/weather_api.py`), premium model (`app/ml/premium_model.py`) |

---

## How it works

1. **Sign up and set a location.** The worker's city or GPS position decides their pool zone.
2. **Choose a plan.** `POST /insurance/create-order` creates a Razorpay order. The server calculates the price.
3. **Pay.** Razorpay Checkout opens in the browser.
4. **Verify.** `POST /insurance/verify-payment` checks the signature, fetches the payment from Razorpay, confirms the amount and that it is captured, activates the plan for 7 days, and credits the zone pool once.
5. **Claim automatically.** `POST /claims/auto` reads the weather and air quality for the worker's city, applies the plan's covered events, runs the fraud check, and pays out from the zone pool.

### Payout rules

| Event | Trigger | Payout |
|-------|---------|--------|
| Moderate rain | rain 20 to under 50 | 150 |
| Heavy rain | rain 50 to under 80 | 250 |
| Extreme rain | rain 80 or more | 350 |
| Heatwave | temperature 40 to under 45 | 150 |
| Extreme heat | temperature 45 or more | 250 |
| High pollution | AQI 150 to under 300 | 150 |
| Severe pollution | AQI 300 or more | 250 |
| Curfew | demo trigger only | 300 |
| Low demand | fewer than 5 orders, added only on top of a covered event | 50 |

Rules that always apply:

- Several events can add up, capped at 700 per claim and then at the plan's coverage.
- Minimum payout once something triggers is 150.
- One approved payout per worker per 10 minutes.
- A payout never exceeds what the zone pool holds.
- Only workers with an active, unexpired plan can be paid.

### Plan coverage

| Plan | Pays for |
|------|----------|
| Basic | Rain |
| Standard | Rain, heat |
| Premium | Rain, heat, pollution, curfew |

This table is defined by `PLAN_COVERS` in `backend/app/services/claim_service.py`. Edit the plan names there so they match the plans in `app/services/pricing.py`. A plan name that is not in the table gets rain cover only.

---

## Project structure

```
guidewire-final-main/
├── backend/
│   └── app/
│       ├── api/
│       │   ├── deps.py                 # get_current_user (auth)
│       │   └── routes/
│       │       ├── claim.py            # /claims endpoints
│       │       └── ...                 # insurance router and others
│       ├── db/session.py               # database session
│       ├── ml/premium_model.py         # location-based premium
│       ├── models/                     # Insurance, InsurancePayment, Claim, PoolLedger, User
│       ├── services/
│       │   ├── claim_service.py        # claim logic and plan coverage
│       │   ├── pricing.py              # COVERAGE and plan_prices
│       │   ├── insurance_service.py
│       │   └── zone_pool.py            # pool ledger, zones, balances
│       └── utils/weather_api.py        # weather and AQI
└── src/
    ├── components/
    │   ├── ProfilePlans.jsx            # plan and payment history card
    │   └── PasswordModal.jsx
    ├── pages/
    │   ├── Profile.jsx
    │   ├── Policy.jsx
    │   └── ...
    ├── utils/AppContext.js
    └── styles/zensurex-ui.css
```

The exact folders may differ slightly in your copy. Use this as a guide.

---

## API overview

### Insurance (`/insurance`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/insurance/create-order` | Create a Razorpay order for a plan |
| POST | `/insurance/verify-payment` | Verify payment, activate the plan, credit the pool |
| GET | `/insurance/history` | Current plan and last 10 verified payments |
| GET | `/insurance/my` | Plan name and premium for the dashboard |
| GET | `/insurance/me` | Plan and lock status |
| GET | `/insurance/plans` | All policies for the user |
| POST | `/insurance/upgrade` | Disabled (returns 410). Payment is required |

### Claims (`/claims`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/claims/auto` | Evaluate conditions and pay out if triggered |
| GET | `/claims/recent` | Last 5 claims |
| GET | `/claims/weather/{city}` | Current temperature, rain, condition and AQI |
| POST | `/claims/risk` | Simple risk level for a weather and AQI input |

All routes except `/claims/weather/{city}` and `/claims/risk` need a bearer token from `/auth/login`.

---

## Running locally

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS and Linux
pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API runs at http://localhost:8000 and the docs at http://localhost:8000/docs. If your entry file is not `app/main.py`, adjust the last command.

### Frontend

```bash
npm install
npm start
```

The app runs at http://localhost:3000. Set `REACT_APP_API_URL` to point it at your local backend, otherwise it uses the deployed one.

---

## Environment variables

Create a `.env` file for the backend. **Never commit it.** Add `.env` to `.gitignore`.

| Variable | Purpose |
|----------|---------|
| `RAZORPAY_KEY_ID` | Razorpay key ID |
| `RAZORPAY_KEY_SECRET` | Razorpay key secret |
| `DEMO_TRIGGERS` | `true` lets the dashboard trigger buttons force a payout (default). Set `false` so only real weather counts |
| `DATABASE_URL` | Database connection string (check `app/db/session.py` for the exact name) |
| Secret key and weather API key | Check `app/core` or `app/utils/weather_api.py` for the exact variable names |

Frontend:

| Variable | Purpose |
|----------|---------|
| `REACT_APP_API_URL` | Backend base URL |

---

## Deployment

- **Backend on Render:** set the environment variables in the service's Environment tab, then deploy.
- **Frontend on Vercel:** set `REACT_APP_API_URL` and deploy.
- Before sharing the project widely, set `DEMO_TRIGGERS=false` on Render.

---

## Security notes

- **Rotate the Razorpay keys** if `.env` was ever committed, and remove it from the repository history.
- The server calculates every price. The `quoted_price` from the browser is only accepted within a narrow range of the server's own figure.
- Payments are verified with the Razorpay signature, then re-fetched from Razorpay to confirm order, amount, currency and capture status.
- Error responses do not include raw exception text. Details stay in the server log.
- Use Razorpay test keys while developing.

---

## Known limitations

- The rain thresholds (20, 50, 80) assume a particular unit from the weather API. Confirm what `rain` means in `get_weather_data` (for example mm per hour or mm per day).
- `Policy.jsx` uses its own thresholds for the auto-claim button. They do not match the backend limits, which is harmless because the server decides.
- Seed funds in each pool are demo money (10,000 per zone).
- Payouts to workers are simulated through `process_payout`. No real money moves to a worker's account.

---

## Roadmap

- Move the plan coverage table into the database.
- Use real weather events instead of demo triggers for all payouts.
- Real payouts to UPI through a payout provider.
- Admin view for pool balances and claim review.
- Notifications when a payout is sent.

---

## License

Add a license of your choice, for example MIT.
