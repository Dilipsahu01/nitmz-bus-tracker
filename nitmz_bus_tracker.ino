#define TINY_GSM_MODEM_SIM800
#include <WiFi.h>
#include <WiFiMulti.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <TinyGsmClient.h>
#include <ArduinoHttpClient.h>
#include <TinyGPS++.h>

WiFiMulti wifiMulti;

// ============================================================
// NETWORK CREDENTIALS
// NOTE: Passwords are left as-is (institutional networks).
//       For production, consider using NVS/Preferences storage.
// ============================================================

// --- Multi-Wi-Fi Credentials (SECONDARY network) ---
const char* ssid1 = "Device ID 01";
const char* pass1 = "Password";
const char* ssid2 = "NIT BH-1B R-50_5G";
const char* pass2 = "Password";

// --- GPRS Credentials (PRIMARY network) ---
const char apn[]      = "airtelgprs.com";
const char gprsUser[] = "";
const char gprsPass[] = "";

// ============================================================
// SERVER CONFIGURATION
// ============================================================
const char* apiEndpoint = "https://nitmz-bus-tracker.onrender.com/api/update-location";
const char  server[]    = "nitmz-bus-tracker.onrender.com";
const int   port        = 443;
const char  path[]      = "/api/update-location";
const char* secretKey   = "NITMZ_ESP32_SECURE_API_KEY_2026";

// ============================================================
// HARDWARE PINS
// Document: UART1 = GPS, UART2 = GSM
// ============================================================
#define GPS_RX_PIN 16
#define GPS_TX_PIN 17
#define GSM_RX_PIN 26
#define GSM_TX_PIN 27

TinyGPSPlus    gps;
HardwareSerial SerialGPS(2);   // UART2 → GPS
HardwareSerial SerialGSM(1);   // UART1 → GSM

TinyGsm             modem(SerialGSM);
TinyGsmClientSecure gsmClient(modem);
HttpClient          httpGSM(gsmClient, server, port);

// ============================================================
// TIMING
// Document specifies 1-second transmission interval
// ============================================================
unsigned long lastTransmissionTime = 0;
const unsigned long transmissionInterval = 1000; // 1 second (per spec)

// ============================================================
// NETWORK STATE FLAGS
// ============================================================
bool gprsConnected = false;
bool wifiConnected = false;

// Tracks which network actually sent the last packet
// "GSM" | "WiFi" | "None"
String activeNetworkType = "None";

// ============================================================
// CIRCULAR BUFFER
// Stores payloads during network outages (per spec)
// ============================================================
#define BUFFER_SIZE 10
String payloadQueue[BUFFER_SIZE];
int head       = 0;
int tail       = 0;
int queueCount = 0;

void enqueuePayload(const String& payload) {
  if (queueCount < BUFFER_SIZE) {
    payloadQueue[tail] = payload;
    tail = (tail + 1) % BUFFER_SIZE;
    queueCount++;
    Serial.printf("[BUFFER] Enqueued. Buffer: %d/%d\n", queueCount, BUFFER_SIZE);
  } else {
    // Buffer full: overwrite oldest entry (circular behaviour)
    payloadQueue[tail] = payload;
    head = (head + 1) % BUFFER_SIZE;
    tail = (tail + 1) % BUFFER_SIZE;
    Serial.println("[BUFFER] Buffer full. Oldest payload overwritten.");
  }
}

String dequeuePayload() {
  if (queueCount > 0) {
    String payload = payloadQueue[head];
    head = (head + 1) % BUFFER_SIZE;
    queueCount--;
    return payload;
  }
  return "";
}

// ============================================================
// GPRS INITIALISATION (callable from both setup and loop)
// ============================================================
bool initGPRS() {
  Serial.println("[GSM] Restarting modem...");
  modem.restart();
  delay(3000);

  Serial.println("[GSM] Waiting for network registration...");
  if (!modem.waitForNetwork(15000)) {
    Serial.println("[GSM] Network registration failed.");
    return false;
  }

  Serial.println("[GSM] Connecting to GPRS (Airtel)...");
  if (!modem.gprsConnect(apn, gprsUser, gprsPass)) {
    Serial.println("[GSM] GPRS connection failed.");
    return false;
  }

  Serial.println("[GSM] GPRS connected successfully.");
  return true;
}

// ============================================================
// WI-FI INITIALISATION (callable from both setup and loop)
// ============================================================
bool initWiFi(unsigned long timeoutMs = 30000) {
  Serial.println("[WIFI] Scanning for known networks...");
  unsigned long start = millis();
  while (wifiMulti.run() != WL_CONNECTED && (millis() - start < timeoutMs)) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WIFI] Connected to: %s | IP: %s | RSSI: %d dBm\n",
                  WiFi.SSID().c_str(),
                  WiFi.localIP().toString().c_str(),
                  WiFi.RSSI());
    return true;
  }
  Serial.println("[WIFI] Connection failed / timed out.");
  return false;
}

// ============================================================
// DEBUG: Print GPS telemetry to Serial Monitor
// ============================================================
void printGPSInfo() {
  Serial.println("------ GPS DATA ------");

  if (gps.location.isValid()) {
    Serial.printf("  Latitude   : %.6f\n", gps.location.lat());
    Serial.printf("  Longitude  : %.6f\n", gps.location.lng());
  } else {
    Serial.println("  Location   : INVALID (waiting for fix)");
  }

  if (gps.speed.isValid())
    Serial.printf("  Speed      : %.1f km/h\n", gps.speed.kmph());
  else
    Serial.println("  Speed      : INVALID");

  if (gps.satellites.isValid())
    Serial.printf("  Satellites : %u\n", gps.satellites.value());
  else
    Serial.println("  Satellites : INVALID");

  if (gps.hdop.isValid())
    Serial.printf("  HDOP       : %.1f\n", gps.hdop.hdop());
  else
    Serial.println("  HDOP       : INVALID");

  if (gps.date.isValid() && gps.time.isValid())
    Serial.printf("  UTC        : %04d-%02d-%02dT%02d:%02d:%02dZ\n",
                  gps.date.year(), gps.date.month(), gps.date.day(),
                  gps.time.hour(), gps.time.minute(), gps.time.second());
  else
    Serial.println("  Date/Time  : INVALID");

  Serial.printf("  Has Fix    : %s\n",   gps.location.isValid() ? "YES" : "NO");
  Serial.printf("  Chars Proc : %lu\n",  gps.charsProcessed());
  Serial.printf("  Sentences  : %lu\n",  gps.sentencesWithFix());
  Serial.printf("  Bad Chksum : %lu\n",  gps.failedChecksum());
  Serial.println("----------------------");
}

// ============================================================
// BUILD JSON PAYLOAD
// Includes all fields:
// latitude, longitude, speed, timestamp, status, satellites,
// hdop, has_fix, net_type
// ============================================================
String buildJSONPayload(const String& netType) {
  // Derive status string from GPS fix
  String status = gps.location.isValid() ? "active" : "no_fix";

  // Build ISO-8601 UTC timestamp from GPS (fallback: "unavailable")
  String timestamp = "unavailable";
  if (gps.date.isValid() && gps.time.isValid()) {
    char buf[25];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
             gps.date.year(), gps.date.month(), gps.date.day(),
             gps.time.hour(), gps.time.minute(), gps.time.second());
    timestamp = String(buf);
  }

  String json = "{";
  json += "\"has_fix\":"     + String(gps.location.isValid() ? "true" : "false") + ",";
  json += "\"latitude\":"    + String(gps.location.lat(), 6)  + ",";
  json += "\"longitude\":"   + String(gps.location.lng(), 6)  + ",";
  json += "\"speed_kmh\":"   + String(gps.speed.isValid()   ? gps.speed.kmph()       : 0.0, 1) + ",";
  json += "\"satellites\":"  + String(gps.satellites.isValid() ? gps.satellites.value() : 0)   + ",";
  json += "\"hdop\":"        + String(gps.hdop.isValid()    ? gps.hdop.hdop()        : 99.9, 1) + ",";
  json += "\"timestamp\":\"" + timestamp + "\",";
  json += "\"status\":\""    + status    + "\",";
  json += "\"net_type\":\""  + netType   + "\"";   // set at point of transmission
  json += "}";
  return json;
}

// ============================================================
// SEND VIA WI-FI (HTTPS)
// ============================================================
bool sendViaWiFi(const String& payload) {
  WiFiClientSecure* client = new WiFiClientSecure;
  // NOTE: Certificate verification is disabled because the Render.com
  // server certificate chain is not bundled. For production deployment
  // a proper CA bundle or certificate pinning should be used.
  client->setInsecure();

  HTTPClient https;
  bool success = false;

  if (https.begin(*client, apiEndpoint)) {
    https.addHeader("Content-Type", "application/json");
    https.addHeader("x-api-key", secretKey);

    int httpCode = https.POST(payload);
    Serial.printf("[WIFI] HTTP Response: %d\n", httpCode);
    if (httpCode == 200) success = true;
    https.end();
  } else {
    Serial.println("[WIFI] Failed to begin HTTPS connection.");
  }

  delete client;
  return success;
}

// ============================================================
// SEND VIA GPRS (HTTPS)
// ============================================================
bool sendViaGPRS(const String& payload) {
  // Re-check live GPRS state before attempting
  if (!modem.isGprsConnected()) {
    Serial.println("[GSM] GPRS dropped. Attempting reconnect...");
    gprsConnected = initGPRS();
    if (!gprsConnected) {
      Serial.println("[GSM] Reconnect failed. Cannot send.");
      return false;
    }
  }

  httpGSM.beginRequest();
  httpGSM.post(path);
  httpGSM.sendHeader("Content-Type",   "application/json");
  httpGSM.sendHeader("Content-Length", payload.length());
  httpGSM.sendHeader("x-api-key",      secretKey);
  httpGSM.beginBody();
  httpGSM.print(payload);
  httpGSM.endRequest();

  int statusCode = httpGSM.responseStatusCode();
  Serial.printf("[GSM] HTTP Response: %d\n", statusCode);
  return (statusCode == 200);
}

// ============================================================
// FLUSH BUFFERED PAYLOADS
// Only called when a live transmission just succeeded,
// guaranteeing at least one working network path exists.
// ============================================================
void flushBuffer() {
  if (queueCount == 0) return;

  Serial.printf("[BUFFER] Flushing %d stored payload(s)...\n", queueCount);

  while (queueCount > 0) {
    String oldPayload = dequeuePayload();
    bool flushed = false;

    // Use whichever path is currently live
    if (gprsConnected && modem.isGprsConnected()) {
      flushed = sendViaGPRS(oldPayload);
    } else if (WiFi.status() == WL_CONNECTED) {
      flushed = sendViaWiFi(oldPayload);
    } else {
      // No path available — re-enqueue and stop flush
      Serial.println("[BUFFER] Network lost during flush. Re-queuing remaining.");
      enqueuePayload(oldPayload);
      break;
    }

    if (flushed)
      Serial.println("[BUFFER] Buffered payload sent.");
    else {
      Serial.println("[BUFFER] Buffered send failed. Re-queuing.");
      enqueuePayload(oldPayload);
      break;
    }

    delay(200); // Prevent server flooding
  }
}

// ============================================================
// SETUP
// Priority order: GSM PRIMARY → Wi-Fi SECONDARY
// ============================================================
void setup() {
  Serial.begin(115200);
  SerialGPS.begin(9600, SERIAL_8N1, GPS_RX_PIN, GPS_TX_PIN);
  SerialGSM.begin(9600, SERIAL_8N1, GSM_RX_PIN, GSM_TX_PIN);

  Serial.println("[SETUP] Starting NIT-MZ Bus Tracker...");

  // Register Wi-Fi networks (not yet connecting — GSM goes first)
  wifiMulti.addAP(ssid1, pass1);
  wifiMulti.addAP(ssid2, pass2);

  // ---- STEP 1: Attempt GSM (PRIMARY) with 60-second window ----
  Serial.println("[GSM] Attempting primary GSM connection (60s timeout)...");
  unsigned long gsmStart = millis();
  modem.restart();
  delay(3000);

  bool gsmNetworkFound = modem.waitForNetwork(60000);

  if (gsmNetworkFound) {
    if (modem.gprsConnect(apn, gprsUser, gprsPass)) {
      Serial.println("[GSM] GPRS connected. GSM is active as PRIMARY channel.");
      gprsConnected = true;
    } else {
      Serial.println("[GSM] GPRS auth failed.");
    }
  } else {
    Serial.println("[GSM] Network registration timed out after 60s.");
  }

  // ---- STEP 2: If GSM failed, attempt Wi-Fi (SECONDARY) ----
  if (!gprsConnected) {
    Serial.println("[WIFI] GSM unavailable. Falling back to Wi-Fi (SECONDARY)...");
    wifiConnected = initWiFi(30000);

    if (!wifiConnected) {
      // ---- STEP 3: Both failed — enter cyclic retry (will retry in loop) ----
      Serial.println("[SETUP] Both GSM and Wi-Fi unavailable. Will retry in loop.");
    }
  }

  Serial.println("[SETUP] Setup complete. Waiting for GPS data...");
}

// ============================================================
// LOOP
// ============================================================
void loop() {
  // Feed GPS UART data into TinyGPS++ parser continuously
  while (SerialGPS.available() > 0) {
    gps.encode(SerialGPS.read());
  }

  if (millis() - lastTransmissionTime >= transmissionInterval) {
    lastTransmissionTime = millis();

    printGPSInfo();

    bool sentSuccessfully = false;
    String usedNetwork    = "None";

    // ---- Priority 1: GSM (PRIMARY) ----
    if (gprsConnected) {
      // sendViaGPRS() internally handles reconnection attempts
      Serial.println("[NET] Attempting via GSM (PRIMARY)...");
      String payload = buildJSONPayload("GSM");
      sentSuccessfully = sendViaGPRS(payload);
      if (sentSuccessfully) usedNetwork = "GSM";
    }

    // ---- Priority 2: Wi-Fi (SECONDARY) ----
    if (!sentSuccessfully) {
      // Refresh Wi-Fi state
      if (WiFi.status() != WL_CONNECTED) {
        wifiConnected = (wifiMulti.run() == WL_CONNECTED);
      }

      if (wifiConnected || WiFi.status() == WL_CONNECTED) {
        Serial.println("[NET] GSM unavailable. Attempting via Wi-Fi (SECONDARY)...");
        String payload = buildJSONPayload("WiFi");
        sentSuccessfully = sendViaWiFi(payload);
        if (sentSuccessfully) usedNetwork = "WiFi";
      }
    }

    // ---- Priority 3: Both unavailable — cyclic retry ----
    if (!sentSuccessfully) {
      Serial.println("[NET] Both networks unavailable. Cycling retry...");

      // Re-attempt GSM as part of cyclic retry
      if (!gprsConnected || !modem.isGprsConnected()) {
        Serial.println("[NET] Retrying GSM...");
        gprsConnected = initGPRS();
      }

      // Build payload and buffer it regardless
      String payload = buildJSONPayload("None");
      Serial.println("[NET] No network. Saving to circular buffer.");
      enqueuePayload(payload);
    } else {
      Serial.printf("[NET] Transmission successful via %s.\n", usedNetwork.c_str());
      activeNetworkType = usedNetwork;

      // Flush any payloads stored during prior outage
      flushBuffer();
    }
  }
}
