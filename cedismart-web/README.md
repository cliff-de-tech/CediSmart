# 🌐 CediSmart Web Landing Page & Download Portal

**The official public-facing showcase, direct distribution portal, and regulatory compliance website for CediSmart.**

This directory contains the source code for the CediSmart product landing website. It is designed to introduce the CediSmart mobile experience, host mandatory legal compliance documents for app store reviews, and provide a direct download channel for standalone Android APK packages.

---

## Table of Contents

- [What It Is](#what-it-is)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Running Locally](#running-locally)
- [Deployment](#deployment)
- [Compliance Host Setup](#compliance-host-setup)
- [License](#license)

---

## What It Is

Instead of reproducing all of CediSmart's complex offline queue state, database synchronization, and local biometric security within a web browser, the **CediSmart Web** folder serves as the product landing and distribution site. 

It is designed to showcase the mobile app features, serve as the download platform, and host the legal policies required for Google Play Console and Apple App Store Connect compliance reviews.

---

## Key Features

* **📱 Mobile App Feature Showcase** — High-fidelity interactive landing design using modern dark forest green and gold themes, complete with feature grids, responsive cards, and app store badges.
* **🔒 Live Interactive Mockup Simulator** — A client-side dashboard mockup component that demonstrates CediSmart's secure balance-masking feature (`₵ ••••` toggles) interactively in the browser.
* **📄 Hosted Compliance Policies** — Full static legal page templates for the **Privacy Policy** (`privacy.html`) and **Terms of Service** (`terms.html`) tailored to Ghanaian fintech rules (NIA data handling, BoG guidelines).
* **🤖 Direct APK Download** — Host direct standalone Android package links for immediate sideloading without going through Google Play.

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| **Markup** | HTML5 | Clean, semantic, SEO-optimized markup |
| **Styling** | Vanilla CSS3 | Custom typography and animations tailored to CediSmart's dark-forest branding |
| **Scripting** | Vanilla ES6 JavaScript | Smooth balance-toggle simulator without heavy frontend framework overhead |
| **Icons & Assets** | Generated Brand Art | Custom generated app icons and screenshots optimized for fast loading |

---

## Project Structure

```text
cedismart-web/
├── index.html                  # Product landing page & showcase
├── app.js                       # Interactive balance masking preview logic
├── style.css                    # Responsive dark forest layout stylesheet
├── privacy.html                 # Hosted compliance Privacy Policy
├── terms.html                   # Hosted compliance Terms of Service
└── assets/                      # Generated app icons, graphics, and release APK binaries
```

---

## Running Locally

To run the landing page locally and preview animations and the interactive mockup simulator:

```bash
cd cedismart-web

# Option 1: Python 3 in-built server
python -m http.server 8080

# Option 2: Node.js http-server
npx http-server -p 8080
```

Open your browser at `http://localhost:8080`.

---

## Deployment

Since the website is completely static, it can be deployed to any static host with zero cost and high performance:

* **Netlify / Vercel** — Connect the monorepo and set the build base directory to `cedismart-web`.
* **GitHub Pages** — Configure GitHub Pages to serve files from the `cedismart-web` folder.
* **Firebase Hosting** — Initialize Firebase Classic Hosting and specify `cedismart-web` as the public folder.

---

## Compliance Host Setup

When submitting CediSmart for review on **Apple App Store Connect** and **Google Play Console**:
1. Copy the public URL of your deployed `privacy.html` and paste it into the **Privacy Policy URL** field.
2. Copy the public URL of your deployed `terms.html` and paste it into your developer account store listing details.

---

## License

Proprietary — © 2026 CediSmart. All rights reserved.
