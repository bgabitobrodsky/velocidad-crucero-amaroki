# Simulador de Control de Velocidad - Amarok

Simulador en el navegador para estudiar un controlador PI de velocidad crucero ante perturbaciones (viento, pendientes, carga) y cambios de referencia. Incluye velocimetro analogico, graficas en tiempo real y panel de pruebas rapidas. Puedes usarlo localmente o en la version publicada: https://bgabitobrodsky.github.io/velocidad-crucero-amaroki/

## Requisitos
- Navegador moderno (Chrome, Edge, Firefox).
- Sin dependencias locales: usa CDN para Bootstrap y Chart.js.

## Como usar
1. Abre `index.html` en el navegador (doble clic o sirve con cualquier servidor estatico), o usa la version online indicada arriba.
2. Ajusta la velocidad seleccionada con los botones +/-.
3. Configura una perturbacion (tipo, magnitud, duracion) y pulsa **Aplicar**.
4. Inicia/pausa la simulacion con **Iniciar/Pausar**; **Resetear** vuelve al estado inicial.
5. Usa el desplegable **Pruebas rapidas** para cargar escenarios preconfigurados.
6. El panel "Prueba custom" permite definir todos los parametros y lanzar un escenario.

## Controles y visualizacion
- Velocimetro: muestra la velocidad real instantanea.
- Grafico: curvas de velocidad seleccionada, velocidad real y senal de actuador (%).
- Indicadores KP/KI: se iluminan segun la actividad de cada termino.
- Estado del sistema: valores numericos de velocidad real, error, control y torque de perturbacion.
- Log detallado: ultimas muestras con referencia, velocidad, error, control y perturbacion aplicada.

## Pruebas rapidas incluidas
1. Escalon sin perturbacion (70 -> 100 km/h, 40 s).
2. Viento en contra moderado (80 -> 100 km/h, 15 km/h de 10 a 20 s, 40 s).
3. Viento a favor (100 km/h, 15 km/h de 10 a 20 s, 40 s).
4. Pendiente en subida fuerte (90 -> 100 km/h, 20 grados de 10 a 25 s, 45 s).
5. Pendiente en bajada prolongada (100 km/h, 20 grados de 10 a 25 s, 45 s).
6. Carga + cambio de referencia (80 -> 90 km/h, +25 kg de 10 a 30 s, setpoint a 110 km/h en t=20 s, 40 s).

## Notas tecnicas
- Controlador PI: `u = Kp * e + Ki * integral(e)`, con anti-windup por saturacion.
- Planta simplificada de velocidad con constante de tiempo y saturacion en torque/velocidad.
- Perturbaciones mapeadas a torque equivalente segun tipo (viento, pendiente, carga).

## Contexto
Proyecto realizado en el marco de la catedra de Teoria de Control (UTN Buenos Aires).

