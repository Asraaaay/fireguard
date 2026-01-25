# FireGuard Web

FireGuard is a comprehensive Vehicle Tracking System dashboard built with React and Vite. It allows for real-time monitoring of vehicle fleets, impact detection, and safety analysis.

## Features

- **Real-time Vehicle Tracking**: Monitor fleet location and status.
- **Impact Detection**: Analytics for impact events (G-force, rotation, etc.).
- **Dashboard Analytics**: Visualizations using Chart.js.
- **MQTT Integration**: Real-time communication with IoT devices.
- **Responsive Design**: Optimized for both desktop and mobile views.

## Dependencies

This project uses the following dependencies:

### Core Dependencies
| Package | Version | Description |
|---------|---------|-------------|
| `react` | ^18.3.1 | JavaScript library for building user interfaces. |
| `react-dom` | ^18.3.1 | React package for working with the DOM. |
| `mqtt` | ^5.0.0 | MQTT client for real-time messaging. |
| `axios` | ^1.12.2 | Promise based HTTP client for the browser and node.js. |
| `chart.js` | ^4.5.0 | Simple yet flexible JavaScript charting for designers & developers. |
| `react-chartjs-2` | ^5.3.0 | React wrapper for Chart.js. |
| `lucide-react` | ^0.544.0 | Beautiful & consistent icon library. |
| `rollup` | ^4.52.4 | Module bundler for JavaScript. |

### Development Dependencies
| Package | Version | Description |
|---------|---------|-------------|
| `vite` | ^5.1.0 | Frontend tooling and build tool. |
| `@vitejs/plugin-react`| ^4.2.0 | React plugin for Vite. |
| `tailwindcss` | ^3.4.3 | Utility-first CSS framework. |
| `postcss` | ^8.4.32 | Tool for transforming CSS with JavaScript. |
| `autoprefixer` | ^10.4.16 | Parse CSS and add vendor prefixes to rules. |

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 16 or higher recommended)
- [npm](https://www.npmjs.com/)

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

### Scripts

- **Start Development Server**:
  ```bash
  npm run dev
  ```
  Runs the app in development mode. Open [http://localhost:5173](http://localhost:5173) to view it in the browser.

- **Build for Production**:
  ```bash
  npm run build
  ```
  Builds the app for production to the `dist` folder.

- **Preview Production Build**:
  ```bash
  npm run preview
  ```
