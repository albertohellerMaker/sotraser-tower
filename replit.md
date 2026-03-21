# SOTRASER — Fleet Intelligence Dashboard

## Overview
SOTRASER is a Fleet Intelligence Dashboard designed for a Chilean trucking company to optimize fleet operations and enhance decision-making through data-driven insights. It manages 797 trucks across four key contracts, integrating GPS tracking and Volvo Connect ECU telemetry. The system provides comprehensive fleet monitoring, route analysis, contract performance evaluation, and AI-powered diagnostics to improve efficiency and reduce costs.

## User Preferences
I prefer iterative development with clear communication on progress. Before making any major architectural changes or significant code refactors, please ask for my approval. Ensure that all data filtering logic is easily reversible, especially the CENCOSUD contract filter. I also prefer detailed explanations for complex AI analyses or system decisions. Do not make changes to the database schema without explicit approval.

## System Architecture
The application is built on a modern web stack designed for robust fleet intelligence:

- **Frontend**: React, styled with Tailwind CSS and shadcn/ui components.
- **Backend**: Express.js for API services and business logic.
- **Database**: PostgreSQL with Drizzle ORM.
- **UI/UX**: Features a dark industrial "tower-of-control" theme with a custom color palette and typography (Space Mono, Rajdhani, Exo 2). The layout includes a fixed left sidebar, a top bar, and a content area, with animated UI elements.
- **App Structure**: Utilizes a launcher-based architecture (`AppSection = "launcher" | "tower" | "brain" | "sistema"`) with three main entry points:
    - **SOTRASER TOWER CONTROL**: The full operational platform, offering two sub-modes:
        - **TOWER**: Full analytical/intelligence platform with modules like CEREBRO, CONTRATOS, MAPA, APRENDIZAJE, ASISTENTE.
        - **CONTROL**: Operational control dashboard (`client/src/pages/control.tsx`) with panels for fleet, fuel, and operations.
    - **OPERATIVE BRAIN**: An intelligence overview section (`client/src/pages/operative-brain.tsx`) with dedicated tabs for:
        - **MAPA EN VIVO**: Live Leaflet map with geofencing, real-time truck positions, and detailed truck information.
        - **REPORTE DEL DIA**: Daily fleet performance report including KPIs, contract breakdowns, and alert summaries.
        - **DRIVERS**: A CEO-exclusive driver evaluation tab (`client/src/pages/drivers-tab.tsx`) featuring dynamic KPI cards, a ranking table with adaptive scoring based on historical data, and detailed driver performance analyses. The adaptive scoring system utilizes percentile-based thresholds learned from historical data, with a fallback to static thresholds.
        - **APRENDIZAJE**: Autonomous learning system overview, detailing the status of learned thresholds, fuel patterns, corridors, and change detection.
    - **SISTEMA INTELIGENTE**: A CEO-system calibration and dialogue interface (`client/src/pages/sistema-inteligente.tsx`) with tabs for:
        - **INCONSISTENCIAS**: Detection and resolution of system inconsistencies with severity levels.
        - **CALIBRACION**: Monitoring and manual adjustment of learned parameters and confidence levels.
        - **DIALOGO IA**: Direct conversational interface with the adaptive system for contextual queries.
        - **REPORTE SEMANAL**: AI-generated weekly system reports.
- **Key Features & Modules**:
    - **CEREBRO**: Main dashboard displaying overall fleet status, KPIs, contract summaries, Volvo alerts, and an AI diagnostic panel.
    - **ContratoPage**: Detailed analysis panel for individual contracts with KPIs, operational status, and filterable truck lists.
    - **CONTRATOS**: Sortable truck tables per contract; clicking a truck opens a full-screen **Mapa del Mes** for visualizing ECU trips, GPS trails, and fuel loads.
    - **MAPA**: Integrates Leaflet for live GPS tracking and historical trip visualization.
    - **DATA VIAJES**: Manages historical trip learning, corridor-based scoring, and anomaly detection using ECU data.
    - **ASISTENTE**: A full-page chat interface powered by SOTRA IA.
    - **Paradas Detectadas**: Service for detecting truck stops from GPS data.
    - **GPS Data Collection**: Automatic ingestion of GPS data from Volvo Connect.
    - **Viajes Aprendizaje**: System for building and scoring historical trips based on Volvo ECU data, enriched with Sigetra fuel loads, clustered into corridors.
    - **VIN-Patente Resolver**: Utility for mapping VINs to patentes.
    - **Snapshot-Carga Crossmatch**: Core logic bridging Sigetra fuel loads with Volvo ECU snapshots to evaluate fuel consumption periods for anomalies.
    - **Cuadratura System**: Reconciles ECU trips with Sigetra fuel loads to calculate fuel deviation.
    - **Feedback Alertas**: System for operators to provide feedback on alerts, used for future threshold recalibration.
    - **Corredores (Rutas)**: Clusters trips into named corridors for route analysis.
    - **Fuel Deviation**: Alerts for significant fuel consumption deviations.
    - **Aprendizaje de Combustible**: Adaptive system learning per-truck and per-truck-station fuel loading patterns, running as a background job.
    - **Estaciones Analisis**: Analyzes Volvo fuel loads across stations, using adaptive criteria for detecting anomalies (ECU vs SIGETRA, daily balance, anticipated loads, rapid double loads, micro loads).
    - **Cuadratura Diaria**: Compares Sigetra fuel loads with Volvo ECU fuel consumption daily.
    - **GEO Reconstruction Service**: Algorithm for GPS point processing, trip detection, and stop detection.
    - **GEO Visitas Service**: Detects truck visits to predefined locations.
    - **Sistema Adaptativo**: Adaptive learning engine that runs background jobs for processing new data, detecting pattern changes, and enriching data, tracking learning confidence.
    - **Auto-Sync Tiempo Real**: Automated, real-time synchronization of trip learning data.
    - **VIN Linkage**: Links Sigetra fleet numbers to Volvo CustomerVehicleNames.

## External Dependencies
- **Volvo rFMS REST API**: For vehicle telemetry data (positions, statuses, fuel, distance).
- **Sigetra Web Portal**: For fuel card transaction data.
- **Anthropic Claude**: An AI model (`claude-sonnet-4-20250514`) for fleet analysis, diagnostics, conversational queries, and anomaly reporting.
- **Leaflet.js & OpenStreetMap**: For all mapping functionalities.