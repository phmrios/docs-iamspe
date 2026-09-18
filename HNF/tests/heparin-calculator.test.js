'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const ProtocolData = require('../js/protocol-data.js');
const HeparinCalculator = require('../js/heparin-calculator.js');

const CONCENTRATION = ProtocolData.HEPARIN_CONCENTRATION_UI_PER_ML;
const PURE_CONCENTRATION = ProtocolData.HEPARIN_PURE_UI_PER_ML;

function initialDoseFor(weightKg, indicationId) {
  return HeparinCalculator.calculateInitialDose({
    weightKg,
    indicationId,
    indications: ProtocolData.INDICATIONS,
    concentrationUiPerMl: CONCENTRATION,
    pureHeparinUiPerMl: PURE_CONCENTRATION,
  });
}

function titrationFor(weightKg, currentRateMlPerHour, ttpaSeconds) {
  return HeparinCalculator.calculateTitrationAdjustment({
    weightKg,
    currentRateMlPerHour,
    ttpaSeconds,
    titrationRules: ProtocolData.TITRATION_RULES,
    concentrationUiPerMl: CONCENTRATION,
  });
}

test('uiToMl converte UI para mL pela concentração informada', () => {
  assert.equal(HeparinCalculator.uiToMl(5600, 100), 56);
  assert.equal(HeparinCalculator.uiToMl(25000, 5000), 5);
});

test('findIndication lança erro para indicação inexistente', () => {
  assert.throws(
    () => HeparinCalculator.findIndication(ProtocolData.INDICATIONS, 'inexistente'),
    /Indicação clínica desconhecida/
  );
});

test('dose inicial para TEP/TVP em paciente de 70kg', () => {
  const result = initialDoseFor(70, 'tep');

  assert.equal(result.bolusUi, 5600); // 70 * 80
  assert.equal(result.bolusSolutionVolumeMl, 56); // 5600 / 100
  assert.equal(result.hourlyRateUi, 1260); // 70 * 18
  assert.equal(result.hourlyRateMl, 12.6);
});

test('dose inicial para TEP/TVP respeita o teto de 10.000 UI de bolus', () => {
  const result = initialDoseFor(200, 'tep'); // 200 * 80 = 16000, acima do teto

  assert.equal(result.bolusUi, 10000);
  assert.equal(result.bolusSolutionVolumeMl, 100);
});

test('dose inicial para SCA respeita o teto de 1.000 UI/h de manutenção', () => {
  const result = initialDoseFor(90, 'sca'); // 90 * 12 = 1080, acima do teto de 1000

  assert.equal(result.hourlyRateUi, 1000);
  assert.equal(result.hourlyRateMl, 10);
});

test('indicação "sem bolus" nunca gera bolus, apenas infusão contínua', () => {
  const result = initialDoseFor(70, 'nobolus');

  assert.equal(result.bolusUi, 0);
  assert.equal(result.hourlyRateUi, 1050); // 70 * 15
});

test('titulação: TTPa abaixo de 45s exige bolus de resgate e aumento de vazão', () => {
  const result = titrationFor(70, 12.6, 40);

  assert.equal(result.rule.id, 'below-target-severe');
  assert.equal(result.rebolusUi, 5600); // 70 * 80
  assert.equal(result.rateDeltaMlPerHour, 2.1); // 70 * 3 / 100
  assert.equal(result.newRateMlPerHour, 14.7);
  assert.equal(result.pauseInfusion, false);
});

test('titulação: TTPa na faixa alvo (60-85s) mantém a vazão sem bolus', () => {
  const result = titrationFor(70, 12.6, 70);

  assert.equal(result.rule.id, 'target');
  assert.equal(result.rebolusUi, 0);
  assert.equal(result.rateDeltaMlPerHour, 0);
  assert.equal(result.newRateMlPerHour, 12.6);
  assert.equal(result.pauseInfusion, false);
});

test('titulação: TTPa acima de 100s pausa a BIC e reduz a vazão', () => {
  const result = titrationFor(70, 12.6, 120);

  assert.equal(result.rule.id, 'above-target-severe');
  assert.equal(result.rebolusUi, 0);
  assert.equal(result.rateDeltaMlPerHour, -2.1); // 70 * -3 / 100
  assert.equal(result.newRateMlPerHour, 10.5);
  assert.equal(result.pauseInfusion, true);
});

test('titulação: a vazão nunca fica negativa mesmo com redução maior que a vazão atual', () => {
  const result = titrationFor(50, 1, 150); // reduz 1.5 mL/h numa vazão de 1 mL/h

  assert.equal(result.newRateMlPerHour, 0);
});

test('titulação: fronteiras de TTPa caem na regra correta (44 vs 45, 59 vs 60, 100 vs 101)', () => {
  assert.equal(titrationFor(70, 10, 44).rule.id, 'below-target-severe');
  assert.equal(titrationFor(70, 10, 45).rule.id, 'below-target-mild');
  assert.equal(titrationFor(70, 10, 59).rule.id, 'below-target-mild');
  assert.equal(titrationFor(70, 10, 60).rule.id, 'target');
  assert.equal(titrationFor(70, 10, 85).rule.id, 'target');
  assert.equal(titrationFor(70, 10, 86).rule.id, 'above-target-mild');
  assert.equal(titrationFor(70, 10, 100).rule.id, 'above-target-mild');
  assert.equal(titrationFor(70, 10, 101).rule.id, 'above-target-severe');
});

test('titulação: re-bolus de resgate respeita seu próprio teto de segurança', () => {
  // Faixa < 45s: 80 UI/kg, teto de 10.000 UI.
  const severe = titrationFor(200, 10, 30);
  assert.equal(severe.rebolusUi, 10000);

  // Faixa 45-59s: 40 UI/kg, teto de 5.000 UI.
  const mild = titrationFor(200, 10, 50);
  assert.equal(mild.rebolusUi, 5000);
});
