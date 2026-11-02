/**
 * Fonte única de verdade para os valores clínicos do Protocolo de Heparinização EV UTI IAMSPE.
 *
 * Por que isto existe como dado, e não espalhado em HTML + if/else:
 * a versão anterior desta página tinha a tabela de titulação escrita à mão no HTML
 * e, separadamente, os limiares de TTPa reescritos em JavaScript. As duas cópias
 * podiam divergir silenciosamente a cada atualização do protocolo. Aqui a tabela
 * exibida em tela e a lógica de cálculo são geradas a partir do MESMO array.
 *
 * Funciona tanto como <script> clássico no navegador (expõe window.ProtocolData)
 * quanto via require() no Node (usado pelos testes em tests/), sem precisar de
 * bundler ou de "type=module" — o que quebraria ao abrir o HTML com file://.
 */
(function (root) {
  'use strict';

  // Solução padronizada da UTI: 25.000 UI de HNF (5 mL) + 245 mL de SF 0,9% = 250 mL a 100 UI/mL.
  var HEPARIN_CONCENTRATION_UI_PER_ML = 100;

  // Concentração da ampola pura (sem diluição): 25.000 UI em 5 mL.
  var HEPARIN_PURE_UI_PER_ML = 5000;

  var STANDARD_SOLUTION = {
    heparinUi: 25000,
    heparinAmpouleVolumeMl: 5,
    diluentVolumeMl: 245,
    totalVolumeMl: 250,
    concentrationUiPerMl: HEPARIN_CONCENTRATION_UI_PER_ML,
    validityHours: 24,
  };

  // Doses de ataque (bolus) e manutenção iniciais, por indicação clínica.
  var INDICATIONS = [
    {
      id: 'tep',
      label: 'TEP / TVP / Trombose Aguda',
      bolusUiPerKg: 80,
      rateUiPerKgPerHour: 18,
      maxBolusUi: 10000,
      maxRateUiPerHour: null,
      maxBolusLabel: 'Até 10.000 UI (TEP/TVP)',
    },
    {
      id: 'sca',
      label: 'SCA / Síndrome Coronariana',
      bolusUiPerKg: 60,
      rateUiPerKgPerHour: 12,
      maxBolusUi: 4000,
      // A SCA tem teto de infusão contínua (independente do peso) que as outras indicações não têm.
      maxRateUiPerHour: 1000,
      maxBolusLabel: 'Até 4.000 UI (SCA)',
    },
    {
      id: 'nobolus',
      label: 'Sem Bolus - Alto Risco',
      bolusUiPerKg: 0,
      rateUiPerKgPerHour: 15,
      maxBolusUi: 0,
      maxRateUiPerHour: null,
      maxBolusLabel: 'Sem Bolus (Alto Risco)',
    },
  ];

  // Nomograma de titulação por TTPa/Razão R (CHEST/Raschke, adaptado à solução de 100 UI/mL).
  // A ordem importa: matchesTtpa é avaliada na ordem do array até a primeira que bater.
  var TITRATION_RULES = [
    {
      id: 'below-target-severe',
      ratioRangeLabel: '< 1,2',
      ttpaRangeLabel: '< 45 seg',
      matchesTtpa: function (ttpaSeconds) { return ttpaSeconds < 45; },
      statusLabel: 'Abaixo do alvo',
      severity: 'critical-low',
      rebolusLabel: 'Bolus 80 UI/kg EV',
      rebolusUiPerKg: 80,
      rebolusMaxUi: 10000,
      rateDeltaUiPerKgPerHour: 3,
      pauseInfusion: false,
      nextCheckLabel: 'Em 6 horas',
    },
    {
      id: 'below-target-mild',
      ratioRangeLabel: '1,2 a 1,4',
      ttpaRangeLabel: '45 a 59 seg',
      matchesTtpa: function (ttpaSeconds) { return ttpaSeconds >= 45 && ttpaSeconds <= 59; },
      statusLabel: 'Abaixo do alvo',
      severity: 'warning-low',
      rebolusLabel: 'Bolus 40 UI/kg EV',
      rebolusUiPerKg: 40,
      rebolusMaxUi: 5000,
      rateDeltaUiPerKgPerHour: 2,
      pauseInfusion: false,
      nextCheckLabel: 'Em 6 horas',
    },
    {
      id: 'target',
      ratioRangeLabel: '1,5 a 2,5',
      ttpaRangeLabel: '60 a 85 seg',
      matchesTtpa: function (ttpaSeconds) { return ttpaSeconds >= 60 && ttpaSeconds <= 85; },
      statusLabel: 'Alvo terapêutico',
      severity: 'target',
      rebolusLabel: 'Nenhum Bolus',
      rebolusUiPerKg: 0,
      rebolusMaxUi: 0,
      rateDeltaUiPerKgPerHour: 0,
      pauseInfusion: false,
      nextCheckLabel: '24h (se 2x seguidas no alvo)',
    },
    {
      id: 'above-target-mild',
      ratioRangeLabel: '2,6 a 3,0',
      ttpaRangeLabel: '86 a 100 seg',
      matchesTtpa: function (ttpaSeconds) { return ttpaSeconds >= 86 && ttpaSeconds <= 100; },
      statusLabel: 'Acima do alvo',
      severity: 'warning-high',
      rebolusLabel: 'Nenhum Bolus',
      rebolusUiPerKg: 0,
      rebolusMaxUi: 0,
      rateDeltaUiPerKgPerHour: -2,
      pauseInfusion: false,
      nextCheckLabel: 'Em 6 horas',
    },
    {
      id: 'above-target-severe',
      ratioRangeLabel: '> 3,0',
      ttpaRangeLabel: '> 100 seg',
      matchesTtpa: function (ttpaSeconds) { return ttpaSeconds > 100; },
      statusLabel: 'Crítico',
      severity: 'critical-high',
      rebolusLabel: 'PAUSAR BIC POR 1 HORA',
      rebolusUiPerKg: 0,
      rebolusMaxUi: 0,
      rateDeltaUiPerKgPerHour: -3,
      pauseInfusion: true,
      nextCheckLabel: 'Em 6h pós-reinício',
    },
  ];

  // Regra de neutralização: 1 mg de Sulfato de Protamina para cada 100 UI de HNF,
  // ajustada pelo tempo decorrido desde o desligamento da BIC.
  var PROTAMINE_RULES = [
    {
      timeRangeLabel: '< 30 minutos',
      doseLabel: '1 mg para cada 100 UI infundidas nas últimas 2 horas (máx 50 mg)',
      severity: 'critical-high',
    },
    {
      timeRangeLabel: '30 a 60 minutos',
      doseLabel: '0,5 mg para cada 100 UI infundidas nas últimas 2 horas',
      severity: 'warning-high',
    },
    {
      timeRangeLabel: '> 2 horas',
      doseLabel: '0,25 mg para cada 100 UI infundidas nas últimas 2 horas',
      severity: 'neutral',
    },
  ];

  var ProtocolData = {
    HEPARIN_CONCENTRATION_UI_PER_ML: HEPARIN_CONCENTRATION_UI_PER_ML,
    HEPARIN_PURE_UI_PER_ML: HEPARIN_PURE_UI_PER_ML,
    STANDARD_SOLUTION: STANDARD_SOLUTION,
    INDICATIONS: INDICATIONS,
    TITRATION_RULES: TITRATION_RULES,
    PROTAMINE_RULES: PROTAMINE_RULES,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ProtocolData;
  } else {
    root.ProtocolData = ProtocolData;
  }
})(typeof window !== 'undefined' ? window : globalThis);
