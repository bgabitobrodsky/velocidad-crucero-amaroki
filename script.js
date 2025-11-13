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

  const currentSpeedLabel = document.getElementById("currentSpeedLabel");
  const timeLabel = document.getElementById("timeLabel");
  const speedometerNeedle = document.getElementById("speedometerNeedle");
  const logPanel = document.getElementById("logPanel");
  const kpIndicator = document.getElementById("kpIndicator");
  const kiIndicator = document.getElementById("kiIndicator");

  // Estado de la simulación
  const MIN_TARGET_SPEED = 0;
  const MAX_TARGET_SPEED = 200;
  const SPEED_STEP = 5;
  const MAX_PERTURBATION = 40;
  let setSpeed = 80; // referencia (km/h)
  let actualSpeed = 0; // salida (km/h)
  const maxSpeed = 240; // para escalar animación
  let simTime = 0; // segundos
  let lastTimestamp = null;
  let simSpeedMultiplier = simulationSpeedSelect ? Number(simulationSpeedSelect.value) : 0.6;

  // Control PI
  // e(t) = r(t) - y(t)
  // u(t) = Kp*e(t) + Ki*∫e(t)dt + r(t)   (forma con acción proporcional sobre error + referencia)
  let integralError = 0;
  const Kp = 0.8;       // ganancia proporcional
  const Ki = 0.3;       // ganancia integral
  const plantResponse = 1.2; // "constante" de la planta (1/τ efectiva)
  const integralMax = 300;   // límite anti-windup
  const KP_ACTIVITY_THRESHOLD = 0.5;
  const KI_ACTIVITY_THRESHOLD = 0.3;

  // Estado perturbación
  let currentDisturbance = 0; // equivalente en km/h (signo según tipo)
  let currentPerturbationLabel = "Sin pert.";
  let disturbanceEndTime = 0; // tiempo simTime hasta el cual actúa

  // Estado de ejecución (play/pause)
  let isRunning = false;

  // Parámetros de gráfico / ventana de tiempo
  const WINDOW_DURATION = 10; // segundos visibles
  const chartUpdateInterval = 0.1; // segundos entre puntos
  let lastChartUpdateTime = 0;

  // Historial de muestras para últimos 10 s
  // Cada entrada: { t, setSpeed, actualSpeed, error, disturbance }
  let sampleHistory = [];

  // Gráfico (Chart.js) con eje X lineal (tiempo)
  const ctx = document.getElementById("simulationChart").getContext("2d");
  const simulationChart = new Chart(ctx, {
    type: "line",
    data: {
      datasets: [
        {
          label: "Velocidad seteada (km/h)",
          data: [],
          borderColor: "#6c757d",
          backgroundColor: "rgba(108, 117, 125, 0.2)",
          borderWidth: 2,
          tension: 0.2
        },
        {
          label: "Velocidad real (km/h)",
          data: [],
          borderColor: "#d63384",
          backgroundColor: "rgba(214, 51, 132, 0.15)",
          borderWidth: 2.5,
          tension: 0.25
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
  updateControllerIndicators(false, false);

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

  function getPerturbationSign(pertType) {
    switch (pertType) {
      case "headwind":
      case "uphill":
      case "load":
        return -1; // reduce velocidad
      case "tailwind":
      case "downhill":
        return 1; // aumenta velocidad
      default:
        return 0;
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

    simulationChart.update("none");
  }

  // Actualiza el log con los últimos 10 s (del más reciente al más antiguo)
  function updateLogFromHistory() {
    const lines = sampleHistory
      .slice()
      .reverse()
      .map(s => {
        const ctrl = s.controlSignal != null ? s.controlSignal.toFixed(1) : "-";
        return `${s.t.toFixed(1)}s | ref=${s.setSpeed.toFixed(1)} km/h | ` +
               `vel=${s.actualSpeed.toFixed(1)} km/h | ` +
               `err=${s.error.toFixed(1)} km/h | ` +
               `ctrl=${ctrl} | ` +
               `pert=${s.perturbationLabel} (${s.disturbance.toFixed(1)} km/h)`;
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
      currentDisturbance = 0;
      currentPerturbationLabel = "Sin pert.";
    }

    // ------ Control PI ------
    // Error: diferencia entre referencia y salida
    const error = setSpeed - actualSpeed;

    // Parte integral: acumulación del error en el tiempo
    integralError += error * dt;

    // Anti-windup (limitar la integral)
    if (integralError > integralMax) integralError = integralMax;
    if (integralError < -integralMax) integralError = -integralMax;

    // Salida del controlador (u): referencia corregida
    const proportionalTerm = Kp * error;
    const integralTerm = Ki * integralError;
    const controllerOutput = setSpeed + proportionalTerm + integralTerm;

    updateControllerIndicators(
      Math.abs(proportionalTerm) > KP_ACTIVITY_THRESHOLD,
      Math.abs(integralTerm) > KI_ACTIVITY_THRESHOLD
    );

    // ------ Dinámica simplificada de la planta ------
    // La velocidad tiende hacia (controllerOutput + perturbación)
    const effectiveTarget = controllerOutput + currentDisturbance;
    actualSpeed += plantResponse * (effectiveTarget - actualSpeed) * dt;

    // Saturación física de velocidad
    if (actualSpeed < 0) actualSpeed = 0;
    if (actualSpeed > maxSpeed) actualSpeed = maxSpeed;

    // Actualizar UI instantánea
    currentSpeedLabel.textContent = actualSpeed.toFixed(1);
    timeLabel.textContent = simTime.toFixed(1);
    updateSpeedometer();

    // Registrar puntos para el gráfico/log cada chartUpdateInterval
    if (simTime - lastChartUpdateTime >= chartUpdateInterval) {
      lastChartUpdateTime = simTime;

      // Agregar nueva muestra al historial
      sampleHistory.push({
        t: simTime,
        setSpeed: setSpeed,
        actualSpeed: actualSpeed,
        error: error,
        disturbance: currentDisturbance,
        controlSignal: controllerOutput,
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

  if (pertMagnitudeInput) {
    pertMagnitudeInput.addEventListener("change", function () {
      let magnitude = Number(pertMagnitudeInput.value);
      if (Number.isNaN(magnitude)) magnitude = 0;
      magnitude = clamp(magnitude, 0, MAX_PERTURBATION);
      pertMagnitudeInput.value = magnitude.toString();
    });
  }

  if (simulationSpeedSelect) {
    simulationSpeedSelect.addEventListener("change", function () {
      const value = Number(simulationSpeedSelect.value);
      if (!Number.isNaN(value) && value > 0) {
        simSpeedMultiplier = value;
      }
    });
  }

  applyPerturbationBtn.addEventListener("click", function () {
    let magnitude = Number(pertMagnitudeInput.value);
    const duration = Number(pertDurationSelect.value);
    const sign = getPerturbationSign(pertTypeSelect.value);

    if (Number.isNaN(magnitude)) magnitude = 0;
    magnitude = clamp(magnitude, 0, MAX_PERTURBATION);
    pertMagnitudeInput.value = magnitude.toString();

    currentDisturbance = sign * magnitude;
    disturbanceEndTime = simTime + duration;
    if (sign === 0 || magnitude === 0) {
      currentPerturbationLabel = "Sin pert.";
    } else {
      currentPerturbationLabel =
        pertTypeSelect.options[pertTypeSelect.selectedIndex].text;
    }
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
    currentDisturbance = 0;
    currentPerturbationLabel = "Sin pert.";
    disturbanceEndTime = 0;
    lastTimestamp = null;
    lastChartUpdateTime = 0;

    integralError = 0;
    sampleHistory = [];

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
    updateControllerIndicators(false, false);
  });
  // Al cargar: todo quieto
  updateSpeedometer();
});
