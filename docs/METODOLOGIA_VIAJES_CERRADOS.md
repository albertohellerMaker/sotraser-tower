# METODOLOGIA VIAJES CERRADOS
## Sistema de Deteccion, Acumulacion y Patrones de Viajes - SOTRASER

---

## 1. CONCEPTO FUNDAMENTAL

Un **Viaje Cerrado** es el recorrido completo de un camion durante un dia calendario ya finalizado (dia anterior). Se trabaja con un dia de atraso porque:

- El dia en curso tiene datos incompletos (camiones aun en ruta)
- Solo un dia terminado garantiza el recorrido completo
- Permite comparar viajes completos entre dias distintos

**Fecha de operacion**: Siempre D-1 (ayer). Si hoy es 19 de marzo, se muestran los viajes del 18 de marzo.

---

## 2. FUENTE DE DATOS

### 2.1 Datos GPS (tabla `geo_puntos`)

Cada punto GPS contiene:
- `patente`: identificador del camion
- `camion_id`: referencia a tabla camiones
- `lat`, `lng`: coordenadas GPS
- `timestamp_punto`: momento exacto del registro
- `velocidad_kmh`: velocidad al momento del registro
- `km_odometro`: lectura del odometro telemetria

Los puntos se recopilan automaticamente cada 5 minutos desde la API de WiseTrack para todos los contratos (CENCOSUD, ANGLO-COCU, ANGLO-CARGAS VARIAS, ANGLO-CAL).

### 2.2 Informacion del Camion (tabla `camiones` + `faenas`)

- Patente, modelo, contrato (faena)
- Conductor mas reciente (de tabla `cargas`, ultima carga registrada)

---

## 3. PROCESO DE GENERACION DE UN VIAJE

### Paso 1: Extraccion de puntos GPS del dia

Se extraen todos los puntos GPS del dia cerrado (D-1):

```
WHERE timestamp_punto >= fecha::date
  AND timestamp_punto < fecha::date + interval '1 day'
```

Se usa rango de timestamp (no DATE()) para aprovechar indices de la base de datos.

### Paso 2: Agrupacion por patente

Todos los puntos del dia se agrupan por patente (1 viaje = 1 camion x 1 dia). Se requieren minimo 2 puntos GPS para formar un viaje. Camiones con solo 1 punto se descartan.

### Paso 3: Calculo de kilometros

Se toman las lecturas de odometro validas (no nulas, mayores a cero):

```
km_total = MAX(odometro) - MIN(odometro)
```

Si no hay lecturas de odometro validas, km_total = 0.

### Paso 4: Identificacion de lugares (geocodificacion)

Cada punto GPS se compara contra 57 **Lugares Conocidos** usando la funcion `buscarLugarCercano()`:

**Algoritmo:**
1. Para cada lugar conocido, se calcula la distancia haversine entre el punto GPS y el lugar
2. Si la distancia es menor al radio de tolerancia del lugar (radio_km), es candidato
3. Si el lugar tiene contratos definidos, solo aplica si el camion pertenece a ese contrato
4. Se selecciona el lugar mas cercano entre todos los candidatos

**Resultado por viaje:**
- `lugar_origen`: lugar mas cercano al PRIMER punto GPS del dia
- `lugar_destino`: lugar mas cercano al ULTIMO punto GPS del dia
- `lugar_principal`: lugar donde el camion paso MAS TIEMPO (mayor cantidad de puntos GPS)

### Paso 5: Nombre del viaje

Se construye automaticamente:

- Si origen y destino son distintos: `Origen -> Destino`
- Si hay un lugar principal distinto a ambos: `Origen -> Principal -> Destino`
- Si todos son iguales: `Lugar -> Lugar` (camion no salio del area)

### Paso 6: Puntos GPS con nombres

Cada punto GPS individual recibe el nombre de su lugar conocido mas cercano (si existe dentro del radio). Esto permite ver en el mapa exactamente por donde paso el camion y que lugar reconocido queda cerca.

---

## 4. LUGARES CONOCIDOS (57 ubicaciones)

### 4.1 Bases operativas
| Lugar | Lat | Lng | Radio | Contratos |
|-------|-----|-----|-------|-----------|
| Base Sotraser Quilicura | -33.384 | -70.752 | 3 km | TODOS |

### 4.2 Minas y plantas (ANGLO)
| Lugar | Lat | Lng | Radio | Contratos |
|-------|-----|-----|-------|-----------|
| Planta Anglo Los Bronces | -33.142 | -70.701 | 5 km | ANGLO-COCU, ANGLO-CARGAS VARIAS, ANGLO-CAL |
| Mina El Soldado | -32.844 | -70.981 | 4 km | ANGLO-COCU |
| Planta Chagres | -32.920 | -70.810 | 4 km | ANGLO-COCU |
| Sector Los Andes | -33.196 | -70.340 | 4 km | ANGLO-CARGAS VARIAS, ANGLO-CAL |

### 4.3 Centros de distribucion CENCOSUD
| Lugar | Lat | Lng | Radio | Contratos |
|-------|-----|-----|-------|-----------|
| CD Cencosud Lo Espejo | -33.460 | -70.880 | 3 km | CENCOSUD |
| CD Cencosud Maipu | -33.440 | -70.790 | 3 km | CENCOSUD |

### 4.4 Estaciones de combustible
| Lugar | Lat | Lng | Radio |
|-------|-----|-----|-------|
| Estacion Quilicura | -33.358 | -70.725 | 2 km |
| Estacion Lampa | -33.248 | -70.717 | 2 km |
| Estacion Renca | -33.389 | -70.665 | 2 km |
| Estacion Los Angeles | -37.470 | -72.354 | 3 km |
| Villa Alegre / Linares Sur | -35.840 | -71.690 | 3 km |

### 4.5 Ciudades y destinos regionales (35+ ubicaciones)

Cobertura desde Antofagasta (-23.61) hasta Puerto Montt (-41.47), incluyendo:
- Zona Norte: Copiapo, Vallenar, La Serena, Ovalle/Illapel, Coquimbo/Tongoy, Los Vilos
- Zona Central: Quillota, La Calera, San Felipe, Los Andes, Rancagua, Curacavi, San Bernardo
- Zona Sur: Chillan, Los Angeles, Angol, Temuco, Lautaro, Villarrica, Valdivia, Osorno, Rio Bueno, Puerto Montt
- Anglo: Quintero/Ventanas, Sector Nogales, Catemu/Llay-Llay, Tiltil, Batuco, Rinconada, Colina, Pudahuel

Cada lugar tiene un `radio_km` de tolerancia (2 a 10 km segun el tipo de ubicacion).

---

## 5. PERSISTENCIA Y ACUMULACION

### 5.1 Tabla `viajes_diarios`

Cada viaje cerrado se guarda permanentemente:

| Campo | Descripcion |
|-------|-------------|
| fecha | Dia del viaje (DATE) |
| patente | Patente del camion |
| camion_id | Referencia al camion |
| conductor | Ultimo conductor conocido |
| contrato | CENCOSUD, ANGLO-COCU, etc. |
| lugar_origen | Nombre del origen |
| lugar_destino | Nombre del destino |
| lugar_principal | Lugar donde mas tiempo estuvo |
| hora_inicio | Timestamp del primer punto GPS |
| hora_fin | Timestamp del ultimo punto GPS |
| km_total | Kilometros recorridos (odometro) |
| nombre_viaje | "Origen -> Destino" |
| total_puntos | Cantidad de puntos GPS |
| puntos_gps | JSONB con todos los puntos y nombres |

**Restriccion unica**: (fecha, patente) - un solo viaje por camion por dia.

### 5.2 Transaccionalidad

La escritura es atomica: DELETE + INSERT dentro de una transaccion SQL. Si falla a mitad de proceso, no quedan datos parciales. Si se reprocesa un dia, se reemplaza completamente.

### 5.3 Automatizacion

| Evento | Momento | Accion |
|--------|---------|--------|
| Inicio del servidor | 30 segundos despues | Procesa TODAS las fechas pasadas con datos GPS |
| Cada 6 horas | Periodico | Reprocesa el dia de ayer (captura datos tardios) |
| Consulta del usuario | Tiempo real | Si no hay datos para la fecha pedida, los genera al vuelo |

---

## 6. DETECCION DE PATRONES

### 6.1 Requisito: 7 dias de datos

El sistema requiere un minimo de 7 dias de datos acumulados antes de proponer patrones. Esto asegura que los patrones son reales y no coincidencias de 1-2 dias.

### 6.2 Que se analiza

**Patrones de ruta** (rutas repetidas >= 2 veces):
- Nombre del viaje (origen -> destino)
- Frecuencia total (cuantas veces se hizo)
- Dias distintos en que se hizo
- Camiones distintos que la hicieron
- Km promedio de la ruta
- Lista de patentes y conductores involucrados

**Resumen por contrato**:
- Rutas unicas por contrato
- Total de viajes
- Camiones activos
- Km promedio

**Top camiones**:
- Viajes totales por camion
- Rutas distintas que hace
- Km promedio y acumulado

### 6.3 Estado del sistema

| Estado | Condicion | Indicador |
|--------|-----------|-----------|
| Acumulando | < 7 dias de datos | Amarillo, "X/7 dias" |
| Listo | >= 7 dias de datos | Verde, muestra patrones |

---

## 7. ENDPOINTS API

| Endpoint | Metodo | Descripcion |
|----------|--------|-------------|
| `/api/rutas/viajes-dia?fecha=&contrato=` | GET | Viajes del dia (default: ayer). Lee desde tabla persistente |
| `/api/rutas/patrones?contrato=` | GET | Patrones acumulados, resumen por contrato, top camiones |
| `/api/rutas/viajes-acumulados` | GET | Historial de dias procesados con totales |

---

## 8. VISUALIZACION EN DASHBOARD

### 8.1 Panel superior: Mapa + Lista de viajes
- **Mapa Leaflet** (izquierda): muestra ruta del viaje seleccionado con polyline
  - Marcador verde: origen
  - Marcador rojo: destino
  - Marcador cyan: lugar principal
  - Marcadores amarillos: pasos intermedios
  - Tooltips permanentes con nombres de lugares
- **Lista de viajes** (derecha): cards con patente, conductor, contrato, nombre del viaje, km

### 8.2 Rutas frecuentes del dia
- Top 15 rutas mas repetidas del dia cerrado con conteo

### 8.3 Panel de acumulacion
- Indicador visual X/7 dias (amarillo/verde)
- 4 stats: dias acumulados, viajes total, patrones detectados, contratos
- Historial diario: fecha, camiones, km, viajes por dia

### 8.4 Resumen por contrato
- Por cada contrato: rutas unicas, camiones, km promedio, viajes total
- Colores: CENCOSUD (#00d4ff), ANGLO-COCU (#1A8FFF), ANGLO-CARGAS VARIAS (#FF6B35), ANGLO-CAL (#00C49A)

### 8.5 Patrones identificados (solo con >= 7 dias)
- Cada patron muestra: nombre de ruta, frecuencia, contrato, dias, camiones, km promedio
- Lista de patentes involucradas (max 8 visibles)

---

## 9. CONEXION CON OTRAS FUNCIONES

| Funcion | Conexion con Viajes Cerrados |
|---------|------------------------------|
| **Paradas Detectadas** | Usa los mismos puntos GPS y `buscarLugarCercano()`. Las paradas se detectan dentro de un viaje |
| **Cruce Surtidor-Telemetria** | Los km del viaje (odometro) se pueden comparar contra las cargas surtidor del mismo dia |
| **Micro-cargas sospechosas** | Una carga en estacion X se cruza con si el camion realmente paso por ahi segun el viaje |
| **Viajes Aprendizaje** | Los viajes cerrados alimentan los corredores: rutas que se repiten sistematicamente |
| **Conductores** | Los patrones revelan que conductor hace que ruta, detectando anomalias de asignacion |
| **Alertas CEO** | Patrones anomalos (rutas que solo aparecen 1 vez, camiones que cambian ruta abruptamente) pueden generar alertas |

---

## 10. FLUJO TEMPORAL

```
DIA 1 (hoy = 19 marzo):
  - Se muestra viaje del 18 marzo (cerrado)
  - Se acumulan en viajes_diarios
  - Indicador: 1/7 dias

DIA 7 (25 marzo):
  - Se tienen 7 dias completos (18-24 marzo)
  - Sistema marca "listo = true"
  - Se muestran patrones: rutas repetidas, camiones frecuentes
  - Dashboard cambia de amarillo a verde

DIA 30+:
  - Patrones consolidados con alta confianza
  - Desviaciones de patron generan alertas automaticas
  - Base para optimizacion de rutas y deteccion de fraude
```

---

## 11. LIMITACIONES ACTUALES

1. **1 viaje por camion por dia**: No se separan multiples viajes dentro del mismo dia (ida y vuelta se tratan como un solo recorrido)
2. **Dependencia de GPS**: Solo camiones con telemetria activa generan viajes
3. **Radio fijo por lugar**: No se adapta dinamicamente; un camion a 3.1 km de un lugar con radio 3 km no sera reconocido
4. **Sin deteccion de desvios**: Actualmente no alerta si un camion toma una ruta inusual vs su patron historico (funcionalidad planificada post-7 dias)

---

*Documento generado: 19 de marzo 2026*
*Sistema: SOTRASER Control Combustible*
*Version: Viajes Cerrados v2 con acumulacion y patrones*
