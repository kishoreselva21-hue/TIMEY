# Timey — Dual-Brain Autonomous Timetable & Survival Planner

> **An adaptive academic scheduling engine that combines deterministic multi-objective constraint optimization, 500-trial Monte Carlo risk forecasting, Gemini AI multimodal parsing, and real-time Class Rep ↔ Student synchronization.**

---

## Overview & Problem Statement

Traditional student timetables break the moment real life intervenes—a cancelled morning lecture, a surprise quiz announced on WhatsApp, an underestimated lab assignment, or a sudden exam crunch. Static calendar apps force students to manually drag and rebuild their entire week every time a disruption occurs.

**Timey** solves this by treating a student's week as a live, self-healing optimization problem:
* **Dual-Brain Intelligence:** Uses **Google Gemini (`gemini-2.5-flash`)** to translate unstructured syllabus PDFs, timetable photos, and natural-language chaos prompts into strict JSON constraints—and then hands off the actual scheduling math to a **pure deterministic solver** so deadlines and hard constraints are never hallucinated.
* **Resilience Under Pressure:** Runs **500 Monte Carlo chaos simulations** in milliseconds to forecast deadline survival odds and 14-day burnout risk before crunch weeks hit.
* **Classroom-Wide Live Sync:** Connects **Class Representative** and **Student** workspaces in real time so schedule changes pushed by a Class Rep automatically ripple and re-optimize across synced student timetables.

---


