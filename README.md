# ZensureX🛡️

An AI-powered insurance platform designed for gig workers, built at the Guidewire Hackathon. GigShield connects gig economy workers with dynamic, risk-based insurance coverage using machine learning models trained on financial, environmental, and behavioral data.

## 🚀 Problem Statement

Gig workers (delivery partners, freelancers, ride-share drivers) often lack access to affordable, tailored insurance products because traditional insurers can't accurately assess their fluctuating risk profiles. GigShield AI bridges this gap by using real-time data and ML-driven risk scoring to recommend fair, personalized insurance plans.

## 🧠 Key Features

- **ML-Based Risk Scoring** — Trained and evaluated models (Random Forest, XGBoost) to assess insurance risk for gig workers based on work patterns and external factors.
- **Fraud & Anomaly Detection** — Explored Isolation Forest and time-series models (Prophet, LightGBM) to flag anomalous claims and fraud risk.
- **Weather-Integrated Risk Prediction** — Pulled real-time rainfall and environmental data from external Weather APIs as engineered features, since weather significantly impacts delivery/ride-share risk.
- **FastAPI Backend** — RESTful APIs for insurance recommendations, payout estimation, and fraud analysis, connecting the trained ML pipeline to the application layer.
- **MySQL Data Layer** — Structured storage for user profiles, risk scores, and insurance records.
- **API Documentation** — Fully documented and testable via Swagger/OpenAPI.

## 🏗️ Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI (Python) |
| ML/Modeling | Scikit-learn, XGBoost, LightGBM, Prophet, Isolation Forest |
| Database | MySQL |
| API Docs | Swagger / OpenAPI |
| External Data | Weather API |

## ⚙️ How It Works

1. Gig worker data (work history, location, environmental factors) is collected and preprocessed.
2. Trained ML models generate a risk score for each user.
3. The risk score feeds into an insurance recommendation engine that estimates premium and payout terms.
4. A fraud-detection layer flags anomalous claims for review.
5. Results are served via FastAPI endpoints, documented with Swagger for easy testing.

## 📌 Future Improvements

- Real-time model retraining pipeline
- Frontend dashboard for gig workers to view/manage coverage
- Expanded fraud detection with deep learning models
- Deployment on cloud infrastructure for scalability

## 👩‍💻 Team

Built by [Yasaswi](https://github.com/yasaswi0209) and team at the Guidewire Hackathon.
