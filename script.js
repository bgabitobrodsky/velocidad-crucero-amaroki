document.addEventListener("DOMContentLoaded", function () {
  // Elementos DOM
  const setSpeedLabel = document.getElementById("setSpeedLabel");
  const increaseSpeedBtn = document.getElementById("increaseSpeed");
  const decreaseSpeedBtn = document.getElementById("decreaseSpeed");
  const pertTypeSelect = document.getElementById("pertType");
  const pertMagnitudeInput = document.getElementById("pertMagnitude");
  const pertDurationSelect = document.getElementById("pertDuration");
  const applyPerturbationBtn = document.getElementById("applyPerturbation");
  const resetSimulationBtn = document.getElementById("resetSimulation");
  const playBtn = document.getElementById("playBtn");
  const pauseBtn = document.getElementById("pauseBtn");
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

  const currentSpeedLabel = document.getElementById("currentSpeedLabel");
  const timeLabel = document.getElementById("timeLabel");
  const speedometerNeedle = document.getElementById("speedometerNeedle");
  const logPanel = document.getElementById("logPanel");
  const kpIndicator = document.getElementById("kpIndicator");
  const kiIndicator = document.getElementById("kiIndicator");
  const kpToggle = document.getElementById("kpToggle");
  const kiToggle = document.getElementById("kiToggle");

  // Estado de la simulación
  const MIN_TARGET_SPEED = 0;
  const MAX_TARGET_SPEED = 200;
  const SPEED_STEP = 5;
  let setSpeed = 80; // referencia (km/h)
  let actualSpeed = 0; // salida (km/h)
  const maxSpeed = 240; // para escalar animación
  let simTime = 0; // segundos
  let lastTimestamp = null;
  let simSpeedMultiplier = simulationSpeedSelect ? Number(simulationSpeedSelect.value) : 0.6;

  // Control PI
  // e(t) = r(t) - y(t)
  // u(t) = Kp*e(t) + Ki*integral(e(t)) (modelo PI del documento)
  const KP_GAIN = 0.85;
  const KI_GAIN = 0.35;
  const CONTROL_MIN = 0;
  const CONTROL_MAX = 1;
  const CONTROL_TO_SPEED_GAIN = MAX_TARGET_SPEED;
  const PLANT_TIME_CONSTANT = 1.6;
  const INTEGRAL_STATE_LIMIT = 3;
  const MAX_ENGINE_TORQUE = 580; // Nm
  const NORMALIZED_MIN_TORQUE = -0.4;
  const NORMALIZED_MAX_TORQUE = 1.3;
  const WIND_TORQUE_COEFF = 0.04; // Nm por (km/h)^2 aprox
  const GRADE_TORQUE_GAIN = MAX_ENGINE_TORQUE;
  const LOAD_TORQUE_PER_KG = 0.22;
  const KP_ACTIVITY_THRESHOLD = 0.02;
  const KI_ACTIVITY_THRESHOLD = 0.02;

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
      max: 12,
      step: 0.5,
      magnitudeFormatter: value => `${value.toFixed(1)}°`,
      computeTorque: value => -GRADE_TORQUE_GAIN * Math.sin((value * Math.PI) / 180)
    },
    downhill: {
      name: "Pendiente en bajada",
      unit: "°",
      magnitudeLabel: "Ángulo",
      min: 0,
      max: 12,
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

  // Estado perturbación
  let currentPerturbationLabel = "Sin pert.";
  let currentDisturbanceTorqueNm = 0;
  let disturbanceEndTime = 0; // tiempo simTime hasta el cual actúa

  // Estado de ejecución (play/pause)
  let isRunning = false;

  // Parámetros de gráfico / ventana de tiempo
  const WINDOW_DURATION = 20; // segundos visibles
  const chartUpdateInterval = 0.2; // segundos entre puntos
  let lastChartUpdateTime = 0;

  // Historial de muestras para últimos 20 s
  // Cada entrada: { t, setSpeed, actualSpeed, error, disturbance }
  let sampleHistory = [];

  // Gráfico (Chart.js) con eje X lineal (tiempo)
  const MIN_Y_SPAN = 10;
  const Y_EXTRA_RATIO = 0.1;
  const ctx = document.getElementById("simulationChart").getContext("2d");
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
        }
      },
      plugins: {
        legend: {
          position: "bottom"
        }
      }
    }
  });

  // Inicialización de labels
  updateSetSpeedDisplay();
  if (simulationSpeedSelect) {
    simulationSpeedSelect.value = simSpeedMultiplier.toString();
  }
  refreshIndicatorsFromState();

  // Helpers
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

    dsRef.data = sampleHistory.map(s => ({ x: s.t, y: s.setSpeed }));
    dsReal.data = sampleHistory.map(s => ({ x: s.t, y: s.actualSpeed }));

    // Ventana fija de tiempo: últimos 10 s
    const minTime = Math.max(0, simTime - WINDOW_DURATION);
    const maxTime = Math.max(WINDOW_DURATION, simTime);
    simulationChart.options.scales.x.min = minTime;
    simulationChart.options.scales.x.max = maxTime;

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

  // Loop de simulación
  function simulationStep(timestamp) {
    if (!isRunning) return;

    if (lastTimestamp == null) {
      lastTimestamp = timestamp;
    }
    const dtMs = timestamp - lastTimestamp;
    lastTimestamp = timestamp;
    const dt = (dtMs / 1000) * simSpeedMultiplier; // s escalados

    simTime += dt;

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
      while (sampleHistory.length > 0 &&
             sampleHistory[0].t < simTime - WINDOW_DURATION) {
        sampleHistory.shift();
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

  // Listeners
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

  if (simulationSpeedSelect) {
    simulationSpeedSelect.addEventListener("change", function () {
      const value = Number(simulationSpeedSelect.value);
      if (!Number.isNaN(value) && value > 0) {
        simSpeedMultiplier = value;
      }
    });
  }

  applyPerturbationBtn.addEventListener("click", function () {
    const preview = updatePerturbationPreview();
    if (!preview) return;
    const { config, magnitude, torqueNm } = preview;
    const duration = Number(pertDurationSelect.value);
    currentDisturbanceTorqueNm = torqueNm;
    disturbanceEndTime = simTime + (Number.isNaN(duration) ? 0 : duration);
    if (Math.abs(torqueNm) < 0.5) {
      currentPerturbationLabel = "Sin pert.";
    } else {
      currentPerturbationLabel = `${config.name} (${config.magnitudeFormatter(magnitude)})`;
    }
    updateActivePerturbationPanel();
  });

  // Play
  playBtn.addEventListener("click", function () {
    if (!isRunning) {
      isRunning = true;
      lastTimestamp = null; // evitar salto en dt
      playBtn.disabled = true;
      pauseBtn.disabled = false;
      requestAnimationFrame(simulationStep);
    }
  });

  // Pause
  pauseBtn.addEventListener("click", function () {
    if (isRunning) {
      isRunning = false;
      playBtn.disabled = false;
      pauseBtn.disabled = true;
    }
  });

  // Reset
  resetSimulationBtn.addEventListener("click", function () {
    isRunning = false;
    playBtn.disabled = false;
    pauseBtn.disabled = true;

    simTime = 0;
    actualSpeed = 0;
    currentDisturbanceTorqueNm = 0;
    currentPerturbationLabel = "Sin pert.";
    disturbanceEndTime = 0;
    lastTimestamp = null;
    lastChartUpdateTime = 0;

    integralError = 0;
    lastProportionalTerm = 0;
    lastIntegralTerm = 0;
    sampleHistory = [];
    isProportionalEnabled = kpToggle ? kpToggle.checked : true;
    isIntegralEnabled = kiToggle ? kiToggle.checked : true;

    // limpiar gráfico
    simulationChart.data.datasets.forEach(ds => {
      ds.data = [];
    });
    simulationChart.options.scales.x.min = 0;
    simulationChart.options.scales.x.max = WINDOW_DURATION;
    simulationChart.update();

    // limpiar UI
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
  });
  // Al cargar: todo quieto
  updateSpeedometer();
});
