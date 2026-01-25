# FireGuard Web Dashboard

FireGuard is a comprehensive Fire Detection and Monitoring Dashboard built with React and Vite. It provides real-time monitoring of environmental conditions (temperature, humidity), detects fire events, and manages IoT device connections (ESP32) via MQTT.

## Features

- **Real-time Monitoring**: Live visualization of Temperature and Humidity data.
- **Fire Detection**: Instant visual and audio alerts when fire is detected.
- **IoT Integration**: Seamless communication with ESP32 sensors using MQTT (HiveMQ).
- **Threshold Management**: Remotely set and update temperature thresholds for alerts.
- **Alert System**:
  - Visual status indicators (Safe/Warning/Critical).
  - Audio alarms for Fire and High Temperature events.
- **Event Logging**: Detailed system logs with CSV export functionality.
- **Device Health**: Real-time heartbeat monitoring for ESP32 connectivity.
- **Authentication**: Secure login system powered by Firebase.
- **Dark Mode**: Fully supported light and dark themes.

## Tech Stack

- **Frontend**: React, Vite
- **Styling**: Tailwind CSS
- **State/Protocol**: MQTT (over WebSockets)
- **Charts**: Chart.js, React-Chartjs-2
- **Icons**: Lucide React
- **Auth**: Firebase Authentication

## Dependencies

This project relies on the following key packages:

| Package | Purpose |
|---------|---------|
| `mqtt` | Client for MQTT protocol communication. |
| `firebase` | Authentication and backend services. |
| `react-chartjs-2` | Rendering data visualization charts. |
| `lucide-react` | Iconography. |
| `axios` | HTTP client (if used for auxiliary requests). |

## Getting Started

### Prerequisites

- Node.js (v16+)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd fireguard-web
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment:
   *Note: Firebase configuration is currently embedded in `App.jsx`. For production, consider moving secrets to `.env` files.*

### Running the App

- **Development**:
  Start the development server with hot reload:
  ```bash
  npm run dev
  ```
  Access the dashboard at `http://localhost:5173`.

- **Build**:
  Build the application for production:
  ```bash
  npm run build
  ```

- **Preview**:
  Preview the production build locally:
  ```bash
  npm run preview
  ```

## Usage

1. **Login**: Use valid Firebase credentials to access the dashboard.
2. **Dashboard**: 
   - View live sensor data.
   - Check system status (Safe vs Fire Detected).
   - Toggle "Override" to manually control specific device states.
3. **Settings**: Adjust temperature thresholds directly from the UI.
4. **Logs**: Monitor system events and download logs for analysis.

## License

[ISC](LICENSE)
