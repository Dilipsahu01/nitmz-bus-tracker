# NITMZ Bus Tracker — IoT-Based Real-Time Bus Tracking System

An end-to-end Internet of Things (IoT) solution for real-time campus bus tracking at the **National Institute of Technology Mizoram**, integrating embedded hardware, dual-network wireless communication, and a cloud-hosted backend infrastructure.

---

## Table of Contents

1. [Project Overview](#project-overview)
2. [Team Members](#team-members)
3. [Important Links](#important-links)
4. [System Features](#system-features)
5. [System Architecture](#system-architecture)
6. [Hardware Components](#hardware-components)
7. [Software Stack](#software-stack)
8. [Telemetry Payload Structure](#telemetry-payload-structure)
9. [System Performance](#system-performance)
10. [Getting Started](#getting-started)
11. [Repository Structure](#repository-structure)
12. [Future Improvements](#future-improvements)
13. [Acknowledgements](#acknowledgements)
14. [License](#license)

---

## Project Overview

The NITMZ Bus Tracker was developed to address a critical operational gap in the campus transportation system at NIT Mizoram, where student hostels in **Durtlang** and academic blocks in **Chaltlang** are connected exclusively by institutional buses. The absence of any real-time tracking or status communication mechanism compelled students to wait at bus stops for indeterminate durations, with no visibility into bus location or estimated arrival time.

This system delivers continuous, accurate tracking of the institutional vehicle fleet through a hardware-software platform that transmits GPS telemetry over a dual-network communication layer to a cloud-hosted backend, which in turn exposes live bus position data to a web dashboard and mobile application.

---

## Team Members

| Name | Roll Number |
|---|---|
| Dilip Sahu | BT24CS028 |
| Anshul Singh | BT24CS034 |
| Adarsh Thapa | BT24CS012 |
| Challa Sivaram | BT24CS026 |
| Mahak Singh | BT24CS037 |

**Course:** Embedded Systems (CSP 1405) — Group 2  
**Department:** Computer Science and Engineering, National Institute of Technology Mizoram  
**Submission Date:** April 29, 2026  
**Guided by:** Dr. F Lalchhandama & Dr. C Lalengmawia

---

## Important Links

- **GitHub Repository:** [https://github.com/Dilipsahu01/nitmz-bus-tracker](https://github.com/Dilipsahu01/nitmz-bus-tracker)
- **Project Gallery (Photos and Videos):** [Google Drive](https://drive.google.com/drive/folders/1srJHIdyQLqNTGeBvYYD94TOEgXuqJepm)
- **Live Server:** [https://nitmz-bus-tracker.onrender.com](https://nitmz-bus-tracker.onrender.com)

---

## System Features

- Real-time GPS tracking at one-second update intervals
- Dual-network communication with GSM (GPRS) as the primary channel and Wi-Fi (802.11 b/g/n) as the secondary channel
- Adaptive priority-based network failover with a 60-second GSM connection timeout
- Circular buffer (10-packet capacity) at the microcontroller level for data continuity during network outages
- Cloud-hosted Flask backend deployed on Render.com with MySQL persistent storage
- Interactive web dashboard rendering live bus position via the Leaflet.js mapping library
- Mobile application interface with role-differentiated tracking views
- Role-based access control for students, caretakers, and administrators

---

## System Architecture

```
NEO-6M GPS Module
       |
       v
ESP32 Microcontroller
       |
       |--- GSM/GPRS (PRIMARY) ─────────────┐
       └--- Wi-Fi 802.11 b/g/n (SECONDARY) ─┤
                                             v
                                  Render.com Flask Server
                                             |
                                  ┌──────────┴──────────┐
                                  v                      v
                             MySQL Database         Web Dashboard
                                  |                 (Leaflet.js)
                                  v
                           Mobile Application
```

Telemetry data flows unidirectionally from the NEO-6M GPS module to the ESP32 microcontroller. The ESP32 transmits structured JSON packets through the communication layer to the Render.com cloud server, where data is persisted in the MySQL database and served to the web dashboard and mobile application.

---

## Hardware Components

| Component | Specification | Role |
|---|---|---|
| ESP32 Microcontroller | Dual-core Xtensa LX6, up to 240 MHz, 520 KB SRAM | Central processing unit; firmware execution, Wi-Fi and UART management |
| NEO-6M GPS Module | L1 frequency, 50-channel, ~2.5 m CEP accuracy | Continuous real-time location acquisition |
| SIM800L GSM Module | Quad-band 850/900/1800/1900 MHz, GPRS Class 12 | Primary cellular data transmission |
| LM2596 Buck Converter | Input 4–40 V, output adjustable, up to 90% efficiency | Regulated power supply (4.0–4.2 V) for SIM800L |
| 18650 Li-Ion Cells (x2, series) | 3.7 V nominal, ~2000 mAh each | Primary power source (~7.4 V combined output) |
| Breadboard and Jumper Wires | Full-sized breadboard, male-to-male and male-to-female | Prototype interconnection substrate |

### Pin Configuration

| Component | Signal | ESP32 Pin | Interface |
|---|---|---|---|
| NEO-6M GPS | TX (data out) | GPIO 16 (RX1) | UART1 |
| NEO-6M GPS | RX (data in) | GPIO 17 (TX1) | UART1 |
| NEO-6M GPS | VCC | 3.3 V regulated rail | Power |
| NEO-6M GPS | GND | Common ground | Power |
| SIM800L GSM | TX (data out) | GPIO 26 (RX2) | UART2 |
| SIM800L GSM | RX (data in) | GPIO 27 (TX2) | UART2 |
| SIM800L GSM | VCC | LM2596 output (~4.0–4.2 V) | Power |
| SIM800L GSM | GND | Common ground | Power |

---

## Software Stack

### ESP32 Firmware

The firmware is developed using the Arduino framework within the Arduino IDE. Key libraries employed:

| Library | Purpose |
|---|---|
| `TinyGPS++` | NMEA 0183 sentence parsing and GPS data extraction |
| `TinyGSM` (SIM800 variant) | GSM/GPRS modem control and AT command abstraction |
| `ArduinoHttpClient` | HTTPS request construction and transmission over the GSM channel |
| `WiFiMulti` / `HTTPClient` / `WiFiClientSecure` | Multi-network Wi-Fi management and HTTPS communication |

### Backend Server

| Component | Technology |
|---|---|
| Web Framework | Python Flask |
| Cross-Origin Support | Flask-CORS |
| Database | MySQL (relational; telemetry, buses, drivers, users, schedules) |
| Cloud Deployment | Render.com |

### Frontend and Dashboard

| Component | Technology |
|---|---|
| Web Dashboard | HTML, CSS, JavaScript |
| Interactive Mapping | Leaflet.js |
| Mobile Application | REST API-driven, role-differentiated interface |

---

## Telemetry Payload Structure

Each one-second transmission cycle produces a single JSON object conforming to the following schema:

| Field | Type | Description |
|---|---|---|
| `has_fix` | Boolean | Indicates whether a valid GPS satellite fix has been acquired |
| `latitude` | Float (6 d.p.) | WGS-84 latitude coordinate of the vehicle |
| `longitude` | Float (6 d.p.) | WGS-84 longitude coordinate of the vehicle |
| `speed_kmh` | Float (1 d.p.) | Instantaneous vehicle speed in kilometres per hour |
| `satellites` | Integer | Number of GPS satellites currently tracked |
| `hdop` | Float (1 d.p.) | Horizontal dilution of precision (lower values indicate higher accuracy) |
| `timestamp` | String (ISO-8601 UTC) | UTC timestamp in the format `YYYY-MM-DDTHH:MM:SSZ` derived from GPS time |
| `status` | String | Operational status: `active` when a fix is acquired, `no_fix` otherwise |
| `net_type` | String | Active transmission channel at time of dispatch: `GSM`, `WiFi`, or `None` |

**Example payload:**

```json
{
  "has_fix": true,
  "latitude": 23.726354,
  "longitude": 92.717865,
  "speed_kmh": 24.3,
  "satellites": 8,
  "hdop": 1.2,
  "timestamp": "2026-04-15T08:23:47Z",
  "status": "active",
  "net_type": "GSM"
}
```

---

## System Performance

| Parameter | Observed / Specified Value |
|---|---|
| Data Transmission Interval | 1 second |
| Wi-Fi Average End-to-End Latency | ~50 ms |
| GSM (GPRS) Average Latency | 300–800 ms |
| GPS Positional Accuracy (Theoretical) | ~2.5 m CEP |
| Circular Buffer Capacity | 10 packets |
| GSM Connection Timeout | 60 seconds |

---

## Getting Started

### Prerequisites

- Arduino IDE with the ESP32 board support package installed
- Python 3.x
- MySQL database instance
- Render.com account or equivalent cloud hosting provider
- A SIM card with an active GPRS data plan (Airtel or compatible carrier)

### Firmware Setup

1. Clone this repository.
2. Open `firmware/esp32_bus_tracker.ino` in the Arduino IDE.
3. Install the required libraries via the Arduino Library Manager: `TinyGPS++`, `TinyGSM`, `ArduinoHttpClient`.
4. Set your Wi-Fi credentials, API key, and server endpoint in the firmware configuration constants.
5. Compile and flash the firmware to the ESP32 board.

### Backend Server Setup

```bash
git clone https://github.com/Dilipsahu01/nitmz-bus-tracker.git
cd nitmz-bus-tracker/server
pip install -r requirements.txt
python app.py
```

### Environment Variables

Configure the following environment variables prior to server deployment:

```
API_SECRET_KEY=your_secret_key_here
MYSQL_HOST=your_db_host
MYSQL_USER=your_db_user
MYSQL_PASSWORD=your_db_password
MYSQL_DB=nitmz_bus_tracker
```

---

## Repository Structure

```
nitmz-bus-tracker/
├── firmware/
│   └── esp32_bus_tracker.ino      # ESP32 Arduino firmware
├── server/
│   ├── app.py                     # Flask telemetry and visualisation server
│   ├── templates/
│   │   └── index.html             # Web dashboard
│   └── requirements.txt
├── database/
│   └── schema.sql                 # MySQL database schema
├── docs/
│   └── NITMZ_Bus_Tracker_Report.pdf
└── README.md
```

---

## Future Improvements

- Estimated time of arrival (ETA) prediction using historical telemetry data and machine learning models
- Upgrade from GSM (GPRS) to 4G/LTE connectivity for reduced latency and improved data throughput
- Push notification support for the mobile application
- Full migration of the telemetry server's in-memory state to persistent cloud database storage
- Integration with the institutional timetable and scheduling system

---

## Acknowledgements

The authors express sincere gratitude to **Dr. F Lalchhandama** and **Dr. C Lalengmawia** of the Department of Computer Science and Engineering, National Institute of Technology Mizoram, for their invaluable guidance, constructive suggestions, and continuous encouragement throughout the development of this project.

The authors also acknowledge the support of the Department of Computer Science and Engineering and the institution's infrastructure, which provided the necessary resources for hardware prototyping, firmware development, and system testing. Special recognition is due to the student community of NIT Mizoram, whose daily transportation challenges served as the primary motivation for this work, and to all peers who participated in field testing and provided constructive feedback during the evaluation phase.

---

## License

This project is licensed under the MIT License. See [LICENSE](LICENSE) for full terms.

Copyright (c) 2026 Dilip Sahu, Anshul Singh, Adarsh Thapa, Challa Sivaram, Mahak Singh — Department of Computer Science and Engineering, National Institute of Technology Mizoram.
