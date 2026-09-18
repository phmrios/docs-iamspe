/**
 * Cálculos puros de dose e titulação de Heparina Não Fracionada.
 *
 * Nenhuma função aqui toca o DOM. Isso é deliberado: são as funções com maior
 * consequência clínica da página (definem doses e velocidades de infusão), então
 * precisam poder ser testadas isoladamente, sem precisar simular um navegador.
 * Quem monta a tela é js/ui-controller.js.
 */
(function (root) {
  'use strict';

  function uiToMl(units, concentrationUiPerMl) {
    return units / concentrationUiPerMl;
  }

  function findIndication(indications, indicationId) {
    var indication = indications.filter(function (item) {
      return item.id === indicationId;
    })[0];

    if (!indication) {
      throw new Error('Indicação clínica desconhecida: "' + indicationId + '"');
    }
    return indication;
  }

  /**
   * Dose de ataque (bolus) e velocidade inicial de infusão contínua, para um
   * peso e indicação clínica dados.
   */
  function calculateInitialDose(params) {
    var weightKg = params.weightKg;
    var indication = findIndication(params.indications, params.indicationId);
    var concentrationUiPerMl = params.concentrationUiPerMl;
    var pureHeparinUiPerMl = params.pureHeparinUiPerMl;

    var bolusUi = Math.min(weightKg * indication.bolusUiPerKg, indication.maxBolusUi);

    var hourlyRateUi = weightKg * indication.rateUiPerKgPerHour;
    if (indication.maxRateUiPerHour !== null) {
      hourlyRateUi = Math.min(hourlyRateUi, indication.maxRateUiPerHour);
    }

    return {
      indication: indication,
      bolusUi: bolusUi,
      bolusSolutionVolumeMl: uiToMl(bolusUi, concentrationUiPerMl),
      bolusPureVolumeMl: uiToMl(bolusUi, pureHeparinUiPerMl),
      hourlyRateUi: hourlyRateUi,
      hourlyRateMl: uiToMl(hourlyRateUi, concentrationUiPerMl),
    };
  }

  function findTitrationRule(titrationRules, ttpaSeconds) {
    var rule = titrationRules.filter(function (item) {
      return item.matchesTtpa(ttpaSeconds);
    })[0];

    if (!rule) {
      throw new Error('Nenhuma regra de titulação cobre o TTPa de ' + ttpaSeconds + 's');
    }
    return rule;
  }

  /**
   * Reajuste de re-bolus e vazão na BIC a partir do TTPa de controle encontrado,
   * seguindo o nomograma de ProtocolData.TITRATION_RULES.
   */
  function calculateTitrationAdjustment(params) {
    var weightKg = params.weightKg;
    var currentRateMlPerHour = params.currentRateMlPerHour;
    var concentrationUiPerMl = params.concentrationUiPerMl;
    var rule = findTitrationRule(params.titrationRules, params.ttpaSeconds);

    var rebolusUi = rule.rebolusUiPerKg > 0
      ? Math.min(weightKg * rule.rebolusUiPerKg, rule.rebolusMaxUi)
      : 0;

    var rateDeltaMlPerHour = uiToMl(weightKg * rule.rateDeltaUiPerKgPerHour, concentrationUiPerMl);
    var newRateMlPerHour = Math.max(0, currentRateMlPerHour + rateDeltaMlPerHour);

    return {
      rule: rule,
      rebolusUi: rebolusUi,
      rebolusVolumeMl: uiToMl(rebolusUi, concentrationUiPerMl),
      rateDeltaMlPerHour: rateDeltaMlPerHour,
      newRateMlPerHour: newRateMlPerHour,
      pauseInfusion: rule.pauseInfusion,
    };
  }

  var HeparinCalculator = {
    uiToMl: uiToMl,
    findIndication: findIndication,
    calculateInitialDose: calculateInitialDose,
    findTitrationRule: findTitrationRule,
    calculateTitrationAdjustment: calculateTitrationAdjustment,
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = HeparinCalculator;
  } else {
    root.HeparinCalculator = HeparinCalculator;
  }
})(typeof window !== 'undefined' ? window : globalThis);
