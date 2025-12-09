document.addEventListener("DOMContentLoaded", function () {
  // ---------------------------------------------------------------------------
  // Elementos DOM
  // ---------------------------------------------------------------------------
  const setSpeedLabel = document.getElementById("setSpeedLabel");
  const increaseSpeedBtn = document.getElementById("increaseSpeed");
  const decreaseSpeedBtn = document.getElementById("decreaseSpeed");
  const pertTypeSelect = document.getElementById("pertType");
  const pertMagnitudeInput = document.getElementById("pertMagnitude");
  const pertDurationSelect = document.getElementById("pertDuration");
  const applyPerturbationBtn = document.getElementById("applyPerturbation");
  const resetSimulationBtn = document.getElementById("resetSimulation");
  const toggleSimulationBtn = document.getElementById("toggleSimulation");
  const toggleSimulationIcon = document.getElementById("toggleSimulationIcon");
  const toggleSimulationLabel = document.getElementById("toggleSimulationLabel");
  const simulationSpeedSelect = document.getElementById("simulationSpeed");
  const pertMagnitudeLabelEl = document.getElementById("pertMagnitudeLabel");
  const pertMagnitudeHintEl = document.getElementById("pertMagnitudeHint");
  const pertUnitSuffixEl = document.getElementById("pertUnitSuffix");
  const perturbationNotesEl = document.getElementById("perturbationNotes");
  const pertTorquePreviewEl = document.getElementById("pertTorquePreview");
  const activePerturbationPanelEl = document.getElementById("activePerturbationPanel");
  const activePerturbationSummaryEl = document.getElementById("activePerturbationSummary");
  const statusActualSpeedEl = document.getElementById("statusActualSpeed");
  const statusErrorEl = document.getElementById("statusError");
  const statusControlEl = document.getElementById("statusControl");
  const statusPerturbationTorqueEl = document.getElementById("statusPerturbationTorque");
  const testSuiteToggle = document.getElementById("testSuiteToggle");
  const testSuitePanel = document.getElementById("testSuitePanel");
  const testSuiteClose = document.getElementById("testSuiteClose");
  const testCaseButtons = document.querySelectorAll(".test-case-btn");
  const customTestForm = document.getElementById("customTestForm");
  const customTestModalEl = document.getElementById("customTestModal");

  const currentSpeedLabel = document.getElementById("currentSpeedLabel");
  const timeLabel = document.getElementById("timeLabel");
  const speedometerNeedle = document.getElementById("speedometerNeedle");
  const logPanel = document.getElementById("logPanel");
  const kpIndicator = document.getElementById("kpIndicator");
  const kiIndicator = document.getElementById("kiIndicator");
  const kpToggle = document.getElementById("kpToggle");
  const kiToggle = document.getElementById("kiToggle");

  // ---------------------------------------------------------------------------
  // Estado de la simulación
  // ---------------------------------------------------------------------------
  const MIN_TARGET_SPEED = 0;
  const MAX_TARGET_SPEED = 200;
  const SPEED_STEP = 5;
  let setSpeed = 80; // referencia (km/h)
  let actualSpeed = 0; // salida (km/h)
  const maxSpeed = 240; // para escalar animación
  let simTime = 0; // segundos
  let lastTimestamp = null;
  let simSpeedMultiplier = simulationSpeedSelect ? Number(simulationSpeedSelect.value) : 0.6;

  // ---------------------------------------------------------------------------
  // Control PI
  // e(t) = r(t) - y(t)
  // u(t) = Kp*e(t) + Ki*integral(e(t)) (modelo PI del documento)
  // ---------------------------------------------------------------------------
  const KP_GAIN = 0.85; // Ganancia proporcional del PI (respuesta al error instantáneo)
  const KI_GAIN = 0.35; // Ganancia integral del PI (respuesta al error acumulado)
  const CONTROL_MIN = 0; // Saturación inferior de la señal de control normalizada
  const CONTROL_MAX = 1; // Saturación superior de la señal de control normalizada
  const CONTROL_TO_SPEED_GAIN = MAX_TARGET_SPEED; // Factor que traduce control-velocidad equivalente
  const PLANT_TIME_CONSTANT = 1.6; // Constante de tiempo (s) de la dinámica de la planta (primer orden)
  const INTEGRAL_STATE_LIMIT = 3; // Límite del integrador para evitar windup
  const MAX_ENGINE_TORQUE = 580; // Nm; torque máximo disponible del motor
  const NORMALIZED_MIN_TORQUE = -0.4; // Límite inferior de torque normalizado (algo de frenado)
  const NORMALIZED_MAX_TORQUE = 1.3; // Límite superior de torque normalizado (sobrepar permisible)
  const WIND_TORQUE_COEFF = 0.04; // Nm por (km/h)^2; resistencia/ayuda aerodinámica
  const GRADE_TORQUE_GAIN = MAX_ENGINE_TORQUE; // Factor para convertir pendiente en torque equivalente
  const LOAD_TORQUE_PER_KG = 0.22; // Nm que resta cada kg de carga extra
  const KP_ACTIVITY_THRESHOLD = 0.02; // Umbral para mostrar actividad del término proporcional
  const KI_ACTIVITY_THRESHOLD = 0.02; // Umbral para mostrar actividad del término integral

  const PERTURBATION_MODELS = {
    headwind: {
      name: "Viento en contra",
      unit: "km/h",
      magnitudeLabel: "Magnitud",
      min: 0,
      max: 80,
      step: 5,
      magnitudeFormatter: value => `${value.toFixed(0)} km/h`,
      computeTorque: value => -WIND_TORQUE_COEFF * value * value
    },
    tailwind: {
      name: "Viento a favor",
      unit: "km/h",
      magnitudeLabel: "Magnitud",
      min: 0,
      max: 80,
      step: 5,
      magnitudeFormatter: value => `${value.toFixed(0)} km/h`,
      computeTorque: value => WIND_TORQUE_COEFF * value * value
    },
    uphill: {
      name: "Pendiente en subida",
      unit: "°",
      magnitudeLabel: "Ángulo",
      min: 0,
      max: 20,
      step: 0.5,
      magnitudeFormatter: value => `${value.toFixed(1)}°`,
      computeTorque: value => -GRADE_TORQUE_GAIN * Math.sin((value * Math.PI) / 180)
    },
    downhill: {
      name: "Pendiente en bajada",
      unit: "°",
      magnitudeLabel: "Ángulo",
      min: 0,
      max: 20,
      step: 0.5,
      magnitudeFormatter: value => `${value.toFixed(1)}°`,
      computeTorque: value => GRADE_TORQUE_GAIN * Math.sin((value * Math.PI) / 180)
    },
    load: {
      name: "Aumento de carga",
      unit: "kg",
      magnitudeLabel: "Carga",
      min: 0,
      max: 500,
      step: 25,
      magnitudeFormatter: value => `${value.toFixed(0)} kg`,
      computeTorque: value => -LOAD_TORQUE_PER_KG * value
    }
  };

  let integralError = 0;
  let lastProportionalTerm = 0;
  let lastIntegralTerm = 0;
  let isProportionalEnabled = kpToggle ? kpToggle.checked : true;
  let isIntegralEnabled = kiToggle ? kiToggle.checked : true;

  // ---------------------------------------------------------------------------
  // Estado perturbación
  // ---------------------------------------------------------------------------
  let currentPerturbationLabel = "Sin pert.";
  let currentDisturbanceTorqueNm = 0;
  let disturbanceStartTime = 0;
  let disturbanceEndTime = 0; // tiempo simTime hasta el cual actúa
  let testRunEndTime = null;
  let testRunTotalDuration = null;
  let testRunSpeedStepTime = null;
  let testRunSpeedStepValue = null;

  // Estado de ejecución (play/pause)
  let isRunning = false;

  // Parámetros de gráfico / ventana de tiempo
  const WINDOW_DURATION = 20; // segundos visibles
  const chartUpdateInterval = 0.2; // segundos entre puntos
  let lastChartUpdateTime = 0;

  // Historial de muestras para últimos 20 s
  // Cada entrada: { t, setSpeed, actualSpeed, error, disturbance }
  let sampleHistory = [];

  // ---------------------------------------------------------------------------
  // Gráfico (Chart.js) con eje X lineal (tiempo)
  // ---------------------------------------------------------------------------
  const MIN_Y_SPAN = 10;
  const Y_EXTRA_RATIO = 0.1;
  const ctx = document.getElementById("simulationChart").getContext("2d");
  const perturbationMarkerPlugin = {
    id: "perturbationMarker",
    afterDraw(chart) {
      if (!chart.scales.x || disturbanceStartTime == null || disturbanceEndTime <= disturbanceStartTime) return;
      const xScale = chart.scales.x;
      const area = chart.chartArea;
      const startPixel = xScale.getPixelForValue(Math.max(disturbanceStartTime, xScale.min));
      const endPixel = xScale.getPixelForValue(Math.min(disturbanceEndTime, xScale.max));
      if (startPixel >= endPixel) return;
      const ctx = chart.ctx;
      ctx.save();
      ctx.fillStyle = "rgba(255, 193, 7, 0.15)";
      ctx.fillRect(startPixel, area.top, endPixel - startPixel, area.bottom - area.top);
      ctx.restore();
    }
  };
  const simulationChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Velocidad selec. (km/h)",
          data: [],
          borderColor: "#434982ff",
          backgroundColor: "rgba(73, 101, 126, 0.2)",
          borderWidth: 2,
          tension: 0.2,
          pointRadius: 0,
          pointHoverRadius: 0
        },
        {
          label: "Velocidad real (km/h)",
          data: [],
          borderColor: "#d63356ff",
          backgroundColor: "rgba(214, 51, 78, 0.15)",
          borderWidth: 2.5,
          tension: 0.25,
          pointRadius: 0,
          pointHoverRadius: 0
        },
        {
          label: "Actuador (%)",
          data: [],
          borderColor: "#198754",
          backgroundColor: "rgba(25, 135, 84, 0.15)",
          borderWidth: 1.5,
          tension: 0.15,
          pointRadius: 0,
          pointHoverRadius: 0,
          yAxisID: "yAct"
        }
      ]
    },
    options: {
      responsive: true,
      animation: false,
      scales: {
        x: {
          type: "linear",
          title: {
            display: true,
            text: "Tiempo (s)"
          },
          min: 0,
          max: WINDOW_DURATION
        },
        y: {
          title: {
            display: true,
            text: "Valor"
          },
          ticks: {
            callback: value => Number(value).toFixed(1)
          }
        },
        yAct: {
          position: "right",
          title: {
            display: true,
            text: "Actuador (%)"
          },
          min: 0,
          max: 100,
          grid: {
            drawOnChartArea: false
          }
        }
      },
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    },
    plugins: [perturbationMarkerPlugin]
  });

  // Inicialización de labels
  updateSetSpeedDisplay();
  if (simulationSpeedSelect) {
    simulationSpeedSelect.value = simSpeedMultiplier.toString();
  }
  refreshIndicatorsFromState();

  // ---------------------------------------------------------------------------
  // Funciones auxiliares de UI y estado
  // ---------------------------------------------------------------------------
  function updateSpeedometer() {
    const minAngle = -120;
    const maxAngle = 120;
    const fraction = Math.max(0, Math.min(actualSpeed / maxSpeed, 1));
    const angle = minAngle + fraction * (maxAngle - minAngle);
    if (speedometerNeedle) {
      speedometerNeedle.style.transform = `rotate(${angle}deg)`;
    }
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function updateSetSpeedDisplay() {
    if (setSpeedLabel) {
      setSpeedLabel.textContent = setSpeed.toFixed(0);
    }
  }

  function adjustSetSpeed(delta) {
    setSpeed = clamp(setSpeed + delta, MIN_TARGET_SPEED, MAX_TARGET_SPEED);
    updateSetSpeedDisplay();
  }

  function presetControlForSpeed(speed) {
    const normalizedTorqueNeeded = clamp(
      speed / CONTROL_TO_SPEED_GAIN,
      CONTROL_MIN,
      CONTROL_MAX
    );
    integralError = clamp(
      normalizedTorqueNeeded / KI_GAIN,
      -INTEGRAL_STATE_LIMIT,
      INTEGRAL_STATE_LIMIT
    );
    lastIntegralTerm = KI_GAIN * integralError;
    lastProportionalTerm = 0;
    return normalizedTorqueNeeded;
  }

  function startSimulation() {
    if (isRunning) return;
    isRunning = true;
    lastTimestamp = null;
    updateSimulationToggleButton();
    requestAnimationFrame(simulationStep);
  }

  function pauseSimulation() {
    if (!isRunning) return;
    isRunning = false;
    updateSimulationToggleButton();
  }

  function updateSimulationToggleButton() {
    if (!toggleSimulationBtn || !toggleSimulationIcon || !toggleSimulationLabel) return;
    if (isRunning) {
      toggleSimulationBtn.classList.remove("btn-success");
      toggleSimulationBtn.classList.add("btn-warning");
      toggleSimulationIcon.className = "bi bi-pause-fill";
      toggleSimulationLabel.textContent = toggleSimulationBtn.dataset.pauseLabel || "Pausar";
    } else {
      toggleSimulationBtn.classList.remove("btn-warning");
      toggleSimulationBtn.classList.add("btn-success");
      toggleSimulationIcon.className = "bi bi-play-fill";
      toggleSimulationLabel.textContent = toggleSimulationBtn.dataset.playLabel || "Iniciar";
    }
  }

  function resetSimulationState() {
    isRunning = false;
    testRunEndTime = null;
    testRunTotalDuration = null;
    testRunSpeedStepTime = null;
    testRunSpeedStepValue = null;
    simTime = 0;
    actualSpeed = 0;
    currentDisturbanceTorqueNm = 0;
    currentPerturbationLabel = "Sin pert.";
    disturbanceStartTime = 0;
    disturbanceEndTime = 0;
    lastTimestamp = null;
    lastChartUpdateTime = 0;

    integralError = 0;
    lastProportionalTerm = 0;
    lastIntegralTerm = 0;
    sampleHistory = [];
    isProportionalEnabled = kpToggle ? kpToggle.checked : true;
    isIntegralEnabled = kiToggle ? kiToggle.checked : true;

    simulationChart.data.datasets.forEach(ds => {
      ds.data = [];
    });
    simulationChart.options.scales.x.min = 0;
    simulationChart.options.scales.x.max = WINDOW_DURATION;
    simulationChart.options.scales.y.min = 0;
    simulationChart.options.scales.y.max = MAX_TARGET_SPEED;
    simulationChart.options.scales.yAct.min = 0;
    simulationChart.options.scales.yAct.max = 100;
    simulationChart.update();

    currentSpeedLabel.textContent = "0";
    timeLabel.textContent = "0.0";
    logPanel.textContent = "";
    updateSpeedometer();
    refreshPerturbationInputs();
    refreshIndicatorsFromState();
    updateActivePerturbationPanel();
    if (statusActualSpeedEl) statusActualSpeedEl.textContent = "0.0 km/h";
    if (statusErrorEl) statusErrorEl.textContent = "0.0 km/h";
    if (statusControlEl) statusControlEl.textContent = "0 %";
    if (statusPerturbationTorqueEl) statusPerturbationTorqueEl.textContent = "0 Nm";
    updateSimulationToggleButton();
  }

  function applyPerturbationFromCurrentInputs(customDurationSeconds, customStartSeconds) {
    const preview = updatePerturbationPreview();
    if (!preview) return null;
    const { config, magnitude, torqueNm } = preview;
    const durationValue = Number.isFinite(customDurationSeconds)
      ? customDurationSeconds
      : Number(pertDurationSelect.value);
    disturbanceStartTime = Number.isFinite(customStartSeconds) ? customStartSeconds : simTime;
    disturbanceEndTime = disturbanceStartTime + (Number.isNaN(durationValue) ? 0 : durationValue);
    if (disturbanceStartTime <= simTime) {
      currentDisturbanceTorqueNm = torqueNm;
      currentPerturbationLabel = `${config.name} (${config.magnitudeFormatter(magnitude)})`;
    } else {
      currentDisturbanceTorqueNm = 0;
      currentPerturbationLabel = "Perturbación programada";
    }
    updateActivePerturbationPanel();
    preview.torqueNm = torqueNm;
    return preview;
  }

  function runAutomatedTest(config) {
    resetSimulationState();
    if (typeof config.speed === "number") {
      setSpeed = clamp(config.speed, MIN_TARGET_SPEED, MAX_TARGET_SPEED);
      updateSetSpeedDisplay();
    }
    if (pertTypeSelect && config.pertType) {
      pertTypeSelect.value = config.pertType;
    }
    refreshPerturbationInputs();
    if (pertMagnitudeInput && typeof config.magnitude === "number") {
      pertMagnitudeInput.value = config.magnitude.toString();
    }
    if (pertDurationSelect && typeof config.pertDuration === "number") {
      pertDurationSelect.value = config.pertDuration.toString();
    }

    if (typeof config.initialActualSpeed === "number") {
      actualSpeed = clamp(config.initialActualSpeed, MIN_TARGET_SPEED, MAX_TARGET_SPEED);
    } else {
      actualSpeed = setSpeed;
    }
    currentSpeedLabel.textContent = actualSpeed.toFixed(1);
    updateSpeedometer();
    const normalizedTorque = presetControlForSpeed(actualSpeed);
    if (statusActualSpeedEl) statusActualSpeedEl.textContent = `${actualSpeed.toFixed(1)} km/h`;
    if (statusErrorEl) statusErrorEl.textContent = `${(setSpeed - actualSpeed).toFixed(1)} km/h`;
    if (statusControlEl) statusControlEl.textContent = `${(normalizedTorque * 100).toFixed(0)} %`;
    if (statusPerturbationTorqueEl) statusPerturbationTorqueEl.textContent = formatTorqueNm(currentDisturbanceTorqueNm);

    const scheduledPert = applyPerturbationFromCurrentInputs(
      config.pertDuration,
      config.pertStart
    );
    testRunEndTime = typeof config.simDuration === "number" ? config.simDuration : null;
    testRunTotalDuration = testRunEndTime;
    testRunSpeedStepTime =
      typeof config.speedStepTime === "number" ? config.speedStepTime : null;
    testRunSpeedStepValue =
      typeof config.speedStepValue === "number" ? config.speedStepValue : null;
    startSimulation();
  }

  function setIndicatorState(element, isActive) {
    if (!element) return;
    element.classList.toggle("active", Boolean(isActive));
  }

  function updateControllerIndicators(kpActive, kiActive) {
    setIndicatorState(kpIndicator, kpActive);
    setIndicatorState(kiIndicator, kiActive);
  }

  function refreshIndicatorsFromState() {
    updateControllerIndicators(
      isProportionalEnabled && Math.abs(lastProportionalTerm) > KP_ACTIVITY_THRESHOLD,
      isIntegralEnabled && Math.abs(lastIntegralTerm) > KI_ACTIVITY_THRESHOLD
    );
  }

  // ---------------------------------------------------------------------------
  // PI + PERTURBATION SUPPORT
  // ---------------------------------------------------------------------------
  function normalizeError(error) {
    return clamp(error / MAX_TARGET_SPEED, -2, 2);
  }

  function computeProportionalTerm(normalizedError) {
    if (!isProportionalEnabled) {
      lastProportionalTerm = 0;
      return 0;
    }

    const term = KP_GAIN * normalizedError;
    lastProportionalTerm = term;
    return term;
  }

  function getPerturbationConfig(typeValue) {
    const type = typeValue || (pertTypeSelect ? pertTypeSelect.value : null);
    return (type && PERTURBATION_MODELS[type]) || PERTURBATION_MODELS.headwind;
  }

  function formatTorqueNm(value) {
    const sign = value > 0 ? "+" : "";
    return `${sign}${value.toFixed(0)} Nm`;
  }

  function parseOptionalNumber(value) {
    if (value === null || value === "") {
      return undefined;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function refreshPerturbationInputs() {
    if (!pertMagnitudeInput) return;
    const config = getPerturbationConfig();
    if (pertMagnitudeLabelEl) {
      pertMagnitudeLabelEl.textContent = config.magnitudeLabel;
    }
    if (pertMagnitudeHintEl) {
      pertMagnitudeHintEl.textContent = `Rango: ${config.min}–${config.max} ${config.unit}`;
    }
    if (pertUnitSuffixEl) {
      pertUnitSuffixEl.textContent = config.unit;
    }
    pertMagnitudeInput.min = config.min;
    pertMagnitudeInput.max = config.max;
    pertMagnitudeInput.step = config.step;
    if (pertMagnitudeInput.value === "" || Number.isNaN(Number(pertMagnitudeInput.value))) {
      pertMagnitudeInput.value = config.min.toString();
    }
    updatePerturbationPreview();
  }

  function updatePerturbationPreview() {
    if (!pertMagnitudeInput) return null;
    const config = getPerturbationConfig();
    let magnitude = Number(pertMagnitudeInput.value);
    if (Number.isNaN(magnitude)) magnitude = config.min;
    magnitude = clamp(magnitude, config.min, config.max);
    pertMagnitudeInput.value = magnitude.toString();

    const torqueNm = config.computeTorque(magnitude);
    if (pertTorquePreviewEl) {
      const qualifier = torqueNm >= 0 ? "ayuda" : "resiste";
      pertTorquePreviewEl.textContent = `${formatTorqueNm(torqueNm)} (${qualifier})`;
    }
    if (perturbationNotesEl) {
      perturbationNotesEl.textContent = `${config.name}: ${config.magnitudeFormatter(
        magnitude
      )} → ${formatTorqueNm(torqueNm)} equivalentes en el eje.`;
    }
    return { config, magnitude, torqueNm };
  }

  function updateActivePerturbationPanel() {
    const isActive =
      Math.abs(currentDisturbanceTorqueNm) >= 0.5 && currentPerturbationLabel !== "Sin pert.";

    if (activePerturbationPanelEl) {
      activePerturbationPanelEl.classList.toggle("d-none", !isActive);
    }
    if (!isActive) {
      if (activePerturbationSummaryEl) activePerturbationSummaryEl.textContent = "Sin pert.";
      return;
    }

    if (activePerturbationSummaryEl) {
      activePerturbationSummaryEl.textContent = `${currentPerturbationLabel} • ${formatTorqueNm(
        currentDisturbanceTorqueNm
      )}`;
    }
  }

  // Actualiza datasets del gráfico a partir de sampleHistory
  function updateChartFromHistory() {
    const dsRef = simulationChart.data.datasets[0];
    const dsReal = simulationChart.data.datasets[1];
    const dsAct = simulationChart.data.datasets[2];

    dsRef.data = sampleHistory.map(s => ({ x: s.t, y: s.setSpeed }));
    dsReal.data = sampleHistory.map(s => ({ x: s.t, y: s.actualSpeed }));
    dsAct.data = sampleHistory.map(s => ({ x: s.t, y: s.throttlePercent ?? 0 }));

    // Ventana fija de tiempo: últimos 10 s
    const minTime = Math.max(0, simTime - WINDOW_DURATION);
    const maxTime = Math.max(WINDOW_DURATION, simTime);
    if (testRunTotalDuration != null) {
      simulationChart.options.scales.x.min = 0;
      simulationChart.options.scales.x.max = testRunTotalDuration;
    } else {
      simulationChart.options.scales.x.min = minTime;
      simulationChart.options.scales.x.max = maxTime;
    }

    const yValues = [];
    sampleHistory.forEach(s => {
      yValues.push(s.setSpeed, s.actualSpeed);
    });
    if (yValues.length > 0) {
      let minY = Math.min(...yValues);
      let maxY = Math.max(...yValues);
      let span = maxY - minY;
      if (span < MIN_Y_SPAN) {
        const padding = (MIN_Y_SPAN - span) / 2;
        minY -= padding;
        maxY += padding;
      } else {
        const padding = span * Y_EXTRA_RATIO;
        minY -= padding;
        maxY += padding;
      }
      minY = Math.max(0, minY);
      maxY = Math.min(maxSpeed, maxY);
      simulationChart.options.scales.y.min = minY;
      simulationChart.options.scales.y.max = maxY;
    } else {
      simulationChart.options.scales.y.min = 0;
      simulationChart.options.scales.y.max = MAX_TARGET_SPEED;
    }

    simulationChart.update("none");
  }

  // Actualiza el log con los últimos 10 s (del más reciente al más antiguo)
  function updateLogFromHistory() {
    const lines = sampleHistory
      .slice()
      .reverse()
      .map(s => {
        const throttleText = s.throttlePercent != null ? `${s.throttlePercent.toFixed(0)}%` : "-";
        const torqueText = s.torqueCommandNm != null ? formatTorqueNm(s.torqueCommandNm) : "-";
        const perturbationTorque = s.disturbanceTorqueNm != null ? formatTorqueNm(s.disturbanceTorqueNm) : "0 Nm";
        const perturbationText = s.perturbationLabel || "Sin pert.";
        return `${s.t.toFixed(1)}s | ref=${s.setSpeed.toFixed(1)} km/h | ` +
               `vel=${s.actualSpeed.toFixed(1)} km/h | ` +
               `err=${s.error.toFixed(1)} km/h | ` +
               `torque=${torqueText} | ctrl=${throttleText} | ` +
               `pert=${perturbationText} (${perturbationTorque})`;
      });

    logPanel.textContent = lines.join("\n");
  }


  // ---------------------------------------------------------------------------
  // Loop de simulación principal
  // ---------------------------------------------------------------------------
  function simulationStep(timestamp) {
    if (!isRunning) return;

    if (lastTimestamp == null) {
      lastTimestamp = timestamp;
    }
    const dtMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const dt = (dtMs / 1000) * simSpeedMultiplier; // s escalados

    simTime += dt;

  if (
      testRunSpeedStepTime != null &&
      simTime >= testRunSpeedStepTime &&
      typeof testRunSpeedStepValue === "number"
    ) {
      testRunSpeedStepTime = null;
      setSpeed = clamp(testRunSpeedStepValue, MIN_TARGET_SPEED, MAX_TARGET_SPEED);
      updateSetSpeedDisplay();
    }
    if (
      disturbanceStartTime != null &&
      simTime >= disturbanceStartTime &&
      simTime <= disturbanceEndTime &&
      Math.abs(currentDisturbanceTorqueNm) < 0.5
    ) {
      const preview = updatePerturbationPreview();
      if (preview) {
        currentDisturbanceTorqueNm = preview.torqueNm ?? currentDisturbanceTorqueNm;
        currentPerturbationLabel = `${preview.config.name} (${preview.config.magnitudeFormatter(
          preview.magnitude
        )})`;
        updateActivePerturbationPanel();
      }
    }
    if (testRunEndTime != null && simTime >= testRunEndTime) {
      testRunEndTime = null;
      testRunTotalDuration = null;
      testRunSpeedStepTime = null;
      testRunSpeedStepValue = null;
      pauseSimulation();
    }

    // Apagar perturbación cuando pasa su duración
    if (simTime > disturbanceEndTime) {
      currentDisturbanceTorqueNm = 0;
      currentPerturbationLabel = "Sin pert.";
      updateActivePerturbationPanel();
    }

    // ------ Control PI ------
    const error = setSpeed - actualSpeed;
    const normalizedError = normalizeError(error);
    const proportionalTerm = computeProportionalTerm(normalizedError);

    let tentativeIntegral = integralError;
    if (isIntegralEnabled) {
      tentativeIntegral += normalizedError * dt;
      tentativeIntegral = clamp(tentativeIntegral, -INTEGRAL_STATE_LIMIT, INTEGRAL_STATE_LIMIT);
    } else {
      tentativeIntegral = 0;
    }

    let integralTerm = isIntegralEnabled ? KI_GAIN * tentativeIntegral : 0;
    let controlSignal = clamp(proportionalTerm + integralTerm, CONTROL_MIN, CONTROL_MAX);

    if (isIntegralEnabled) {
      const saturatedHigh = controlSignal >= CONTROL_MAX - 1e-3 && normalizedError > 0;
      const saturatedLow = controlSignal <= CONTROL_MIN + 1e-3 && normalizedError < 0;
      if (saturatedHigh || saturatedLow) {
        tentativeIntegral = integralError;
        integralTerm = KI_GAIN * tentativeIntegral;
        controlSignal = clamp(proportionalTerm + integralTerm, CONTROL_MIN, CONTROL_MAX);
      }
    }

    integralError = tentativeIntegral;
    lastIntegralTerm = integralTerm;

    refreshIndicatorsFromState();

    // ------ Dinámica simplificada de la planta ------
    const controlTorqueNm = controlSignal * MAX_ENGINE_TORQUE;
    const totalTorqueNm = controlTorqueNm + currentDisturbanceTorqueNm;
    const normalizedTorque = clamp(
      totalTorqueNm / MAX_ENGINE_TORQUE,
      NORMALIZED_MIN_TORQUE,
      NORMALIZED_MAX_TORQUE
    );
    const driveTarget = normalizedTorque * CONTROL_TO_SPEED_GAIN;
    actualSpeed += ((driveTarget - actualSpeed) / PLANT_TIME_CONSTANT) * dt;

    // Saturación física de velocidad
    if (actualSpeed < 0) actualSpeed = 0;
    if (actualSpeed > maxSpeed) actualSpeed = maxSpeed;

    // Actualizar UI instantánea
    currentSpeedLabel.textContent = actualSpeed.toFixed(1);
    timeLabel.textContent = simTime.toFixed(1);
    updateSpeedometer();
    if (statusActualSpeedEl) {
      statusActualSpeedEl.textContent = `${actualSpeed.toFixed(1)} km/h`;
    }
    if (statusErrorEl) {
      statusErrorEl.textContent = `${error.toFixed(1)} km/h`;
    }
    if (statusControlEl) {
      statusControlEl.textContent = `${(controlSignal * 100).toFixed(0)} %`;
    }
    if (statusPerturbationTorqueEl) {
      statusPerturbationTorqueEl.textContent = formatTorqueNm(currentDisturbanceTorqueNm);
    }

    // Registrar puntos para el gráfico/log cada chartUpdateInterval
    if (simTime - lastChartUpdateTime >= chartUpdateInterval) {
      lastChartUpdateTime = simTime;

      // Agregar nueva muestra al historial
      sampleHistory.push({
        t: simTime,
        setSpeed: setSpeed,
        actualSpeed: actualSpeed,
        error: error,
        disturbanceTorqueNm: currentDisturbanceTorqueNm,
        torqueCommandNm: totalTorqueNm,
        throttlePercent: controlSignal * 100,
        perturbationLabel: currentPerturbationLabel
      });

      // Mantener sólo los últimos 30 s
      if (testRunTotalDuration == null) {
        while (sampleHistory.length > 0 &&
               sampleHistory[0].t < simTime - WINDOW_DURATION) {
          sampleHistory.shift();
        }
      }

      // Actualizar gráfico y log
      updateChartFromHistory();
      updateLogFromHistory();
    }

    // Pedir siguiente frame mientras siga en "play"
    if (isRunning) {
      requestAnimationFrame(simulationStep);
    }
  }

  // ---------------------------------------------------------------------------
  // Event listeners y automatización
  // ---------------------------------------------------------------------------
  if (kpToggle) {
    kpToggle.addEventListener("change", function () {
      isProportionalEnabled = kpToggle.checked;
      if (!isProportionalEnabled) {
        lastProportionalTerm = 0;
      }
      refreshIndicatorsFromState();
    });
  }

  if (kiToggle) {
    kiToggle.addEventListener("change", function () {
      isIntegralEnabled = kiToggle.checked;
      if (!isIntegralEnabled) {
        integralError = 0;
        lastIntegralTerm = 0;
      }
      refreshIndicatorsFromState();
    });
  }

  if (increaseSpeedBtn) {
    increaseSpeedBtn.addEventListener("click", function () {
      adjustSetSpeed(SPEED_STEP);
    });
  }

  if (decreaseSpeedBtn) {
    decreaseSpeedBtn.addEventListener("click", function () {
      adjustSetSpeed(-SPEED_STEP);
    });
  }

  if (pertTypeSelect) {
    pertTypeSelect.addEventListener("change", function () {
      refreshPerturbationInputs();
    });
  }

  if (pertMagnitudeInput) {
    const handleMagnitudeChange = () => {
      updatePerturbationPreview();
    };
    pertMagnitudeInput.addEventListener("input", handleMagnitudeChange);
    pertMagnitudeInput.addEventListener("change", handleMagnitudeChange);
  }

  refreshPerturbationInputs();
  updateActivePerturbationPanel();
  updateSimulationToggleButton();

  if (simulationSpeedSelect) {
    simulationSpeedSelect.addEventListener("change", function () {
      const value = Number(simulationSpeedSelect.value);
      if (!Number.isNaN(value) && value > 0) {
        simSpeedMultiplier = value;
      }
    });
  }

  applyPerturbationBtn.addEventListener("click", function () {
    applyPerturbationFromCurrentInputs();
  });

  if (toggleSimulationBtn) {
    toggleSimulationBtn.addEventListener("click", function () {
      if (isRunning) {
        pauseSimulation();
      } else {
        startSimulation();
      }
    });
  }

  // Reset
  resetSimulationBtn.addEventListener("click", resetSimulationState);

  // --- Panel de pruebas rápidas
  if (testSuiteToggle && testSuitePanel) {
    testSuiteToggle.addEventListener("click", function () {
      testSuitePanel.classList.toggle("d-none");
    });
  }

  if (testSuiteClose && testSuitePanel) {
    testSuiteClose.addEventListener("click", function () {
      testSuitePanel.classList.add("d-none");
    });
  }

  if (testCaseButtons.length) {
    testCaseButtons.forEach(btn => {
      btn.addEventListener("click", function () {
        if (testSuitePanel) {
          testSuitePanel.classList.add("d-none");
        }
        runAutomatedTest({
          speed: Number(btn.dataset.speed),
          pertType: btn.dataset.pertType,
          magnitude: Number(btn.dataset.magnitude),
          pertDuration: Number(btn.dataset.pertDuration),
          pertStart: Number(btn.dataset.pertStart),
          simDuration: Number(btn.dataset.simDuration),
          initialActualSpeed: Number(btn.dataset.initialSpeed),
          speedStepTime: Number(btn.dataset.speedStepTime),
          speedStepValue: Number(btn.dataset.speedStepValue)
        });
      });
    });
  }

  if (customTestForm) {
    customTestForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const formData = new FormData(customTestForm);
      const getNumber = name => parseOptionalNumber(formData.get(name));
      const pertTypeValue = formData.get("customPertType");
      const config = {
        speed: getNumber("customTargetSpeed"),
        initialActualSpeed: getNumber("customInitialSpeed"),
        pertType: pertTypeValue && typeof pertTypeValue === "string" ? pertTypeValue : undefined,
        magnitude: getNumber("customPertMagnitude"),
        pertDuration: getNumber("customPertDuration"),
        pertStart: getNumber("customPertStart"),
        simDuration: getNumber("customSimulationDuration")
      };
      const speedStepTime = getNumber("customSpeedStepTime");
      const speedStepValue = getNumber("customSpeedStepValue");
      if (speedStepTime !== undefined && speedStepValue !== undefined) {
        config.speedStepTime = speedStepTime;
        config.speedStepValue = speedStepValue;
      }
      runAutomatedTest(config);
      if (typeof bootstrap !== "undefined" && customTestModalEl) {
        const modalInstance =
          bootstrap.Modal.getInstance(customTestModalEl) ||
          new bootstrap.Modal(customTestModalEl);
        modalInstance.hide();
      }
    });
  }
  // Al cargar: todo quieto
  updateSpeedometer();
});
