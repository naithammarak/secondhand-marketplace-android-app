# 2NDHAND Marketplace

An Android marketplace for second-hand items. Every order is inspected at an inspection center before it reaches the buyer, and the buyer's payment is held in escrow until the sale is complete.

Payment and shipping are simulated in this prototype.

**[Download APK](https://expo.dev/artifacts/eas/GKkEkl7Wsuh5cfQhHQPkLgj0o5mtdEoYD9qr5h_UefI.apk)** · API: https://secondhand-api-gksn.onrender.com

## Features

- Google Sign-In with Buyer, Seller, Inspector, Courier and Admin roles
- Seller identity verification
- Product listing, search and management
- Ordering, simulated payment, escrow and receipts
- Shipping to the inspection center and product inspection
- Digital certificate with QR code verification
- Delivery to the buyer, payment release to the seller, returns and refunds

## Tech Stack

React Native (Expo) · FastAPI · PostgreSQL / Supabase · Render

## Run Locally

```bash
# Backend
cd backend
pip install -r requirements.txt
cp .env.example .env
alembic upgrade head
uvicorn app.main:app --reload

# Mobile
cd mobile
npm ci
npx expo start
```

## Team (Section 3, Group 1)

| Name | Student ID | Role |
|---|---|---|
| Wasin Janto | 6804062617147 | Project Manager |
| Nathadol Thangsajjatham | 6804062617325 | System Analyst |
| Janjira Wangkaoom | 6804062617155 | System Analyst |
| Thammarak Kaewprachum | 6804062617112 | Developer |
| Phiraphat Theppan | 6804062617309 | Developer |
| Kamonphan Bunnawat | 6804062617252 | Developer |
| Kankamol Temtung | 6804062617163 | Developer |
| Ittipol Sarabut | 6804062617104 | Software Tester |
| Raiwin Deepaiboon | 6804062617279 | Software Tester |
