/**
 * Liga os dados/cálculos clínicos (protocol-data.js, heparin-calculator.js) ao DOM.
 * Único arquivo com responsabilidade de manipular a tela — nenhuma regra clínica
 * mora aqui, só leitura de formulário, chamada das funções puras e renderização.
 *
 * Script clássico (não "type=module") de propósito: assim a página abre direto
 * com duplo clique (file://), sem precisar de servidor local ou build.
 */
(function () {
  'use strict';

  var CONCENTRATION_UI_PER_ML = ProtocolData.HEPARIN_CONCENTRATION_UI_PER_ML;
  var PURE_CONCENTRATION_UI_PER_ML = ProtocolData.HEPARIN_PURE_UI_PER_ML;

  // Peso usado só para ilustrar, na tabela de referência estática, o que cada
  // ajuste do nomograma representa em mL/h. O simulador abaixo dela usa o peso real.
  var EXAMPLE_WEIGHT_KG = 70;

  // ---------- Formatação ----------

  function formatUnits(units) {
    return Math.round(units).toLocaleString('pt-BR') + ' UI';
  }

  function formatMilliliters(volumeMl) {
    return volumeMl.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' mL';
  }

  function formatMillilitersPerHour(volumeMl) {
    return formatMilliliters(volumeMl) + '/h';
  }

  function formatSignedMillilitersPerHour(volumeMl) {
    var sign = volumeMl > 0 ? '+' : '';
    return sign + formatMillilitersPerHour(volumeMl);
  }

  function formatSignedUiPerKgPerHour(uiPerKgPerHour) {
    var sign = uiPerKgPerHour > 0 ? '+' : '';
    return sign + uiPerKgPerHour + ' UI/kg/h';
  }

  // ---------- Leitura e validação de formulário ----------

  function readNumberInput(inputElement, allowZero) {
    var raw = inputElement.value.trim();
    if (raw === '') {
      return { value: null, isValid: false };
    }
    var parsed = Number(raw);
    if (!Number.isFinite(parsed)) {
      return { value: null, isValid: false };
    }
    var isValid = allowZero ? parsed >= 0 : parsed > 0;
    return { value: isValid ? parsed : null, isValid: isValid };
  }

  function setFieldValidity(fieldElement, inputElement, errorElement, isValid, message) {
    fieldElement.dataset.invalid = isValid ? 'false' : 'true';
    inputElement.setAttribute('aria-invalid', isValid ? 'false' : 'true');
    errorElement.textContent = isValid ? '' : message;
  }

  // ---------- Logo com alternativa textual ----------

  function initLogoFallback() {
    var logoImage = document.getElementById('iamspeLogoImg');
    var fallback = document.getElementById('iamspeLogoFallback');
    if (!logoImage || !fallback) return;

    logoImage.addEventListener('error', function () {
      logoImage.hidden = true;
      fallback.hidden = false;
    });
  }

  function initIcons() {
    if (typeof window.lucide !== 'undefined') {
      window.lucide.createIcons();
    }
  }

  function initPrintButton() {
    var button = document.getElementById('printButton');
    if (!button) return;
    button.addEventListener('click', function () {
      window.print();
    });
  }

  // ---------- Select de indicações clínicas ----------

  function renderIndicationOptions() {
    var select = document.getElementById('calcIndication');
    if (!select) return;

    select.innerHTML = '';
    ProtocolData.INDICATIONS.forEach(function (indication) {
      var option = document.createElement('option');
      option.value = indication.id;
      option.textContent =
        indication.label + ' (' + indication.bolusUiPerKg + ' UI/kg + ' + indication.rateUiPerKgPerHour + ' UI/kg/h)';
      select.appendChild(option);
    });
  }

  function findIndicationById(indicationId) {
    return ProtocolData.INDICATIONS.filter(function (item) {
      return item.id === indicationId;
    })[0];
  }

  // ---------- Calculadora de dose e infusão inicial ----------

  function getInitialDoseElements() {
    return {
      weightField: document.getElementById('calcWeightField'),
      weightInput: document.getElementById('calcWeight'),
      weightError: document.getElementById('calcWeightError'),
      indicationSelect: document.getElementById('calcIndication'),
      maxBolusInfo: document.getElementById('calcMaxBolusInfo'),
      resultPanel: document.getElementById('initialDoseResultPanel'),
      bolusValue: document.getElementById('resBolusDose'),
      bolusDetail: document.getElementById('resBolusVol'),
      rateValue: document.getElementById('resRateMl'),
      rateDetail: document.getElementById('resRateUi'),
    };
  }

  function renderInitialDoseInvalidState(elements) {
    elements.resultPanel.dataset.state = 'invalid';
    elements.bolusValue.textContent = '—';
    elements.bolusDetail.textContent = 'Informe um peso válido (kg) para calcular.';
    elements.rateValue.textContent = '—';
    elements.rateDetail.textContent = '';
  }

  function renderInitialDoseResult(elements, result) {
    elements.resultPanel.dataset.state = 'valid';

    if (result.bolusUi > 0) {
      var pureVolumeLabel = result.bolusPureVolumeMl.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      elements.bolusValue.textContent = formatUnits(result.bolusUi);
      elements.bolusDetail.textContent =
        'Volume da solução (100 UI/mL): ' + formatMilliliters(result.bolusSolutionVolumeMl) +
        ' (ou ' + pureVolumeLabel + ' mL pura)';
    } else {
      elements.bolusValue.textContent = 'Sem Bolus';
      elements.bolusDetail.textContent = 'Iniciar direto em infusão contínua em BIC.';
    }

    elements.rateValue.textContent = formatMillilitersPerHour(result.hourlyRateMl);
    elements.rateDetail.textContent =
      'Taxa Contínua: ' + formatUnits(result.hourlyRateUi) + '/h (' + result.indication.rateUiPerKgPerHour + ' UI/kg/h)';
  }

  function updateInitialDoseCalculation() {
    var elements = getInitialDoseElements();
    var indication = findIndicationById(elements.indicationSelect.value);
    elements.maxBolusInfo.textContent = indication.maxBolusLabel;

    var weightReading = readNumberInput(elements.weightInput, false);
    setFieldValidity(
      elements.weightField,
      elements.weightInput,
      elements.weightError,
      weightReading.isValid,
      'Informe um peso em quilogramas maior que zero.'
    );

    if (!weightReading.isValid) {
      renderInitialDoseInvalidState(elements);
      return;
    }

    var result = HeparinCalculator.calculateInitialDose({
      weightKg: weightReading.value,
      indicationId: indication.id,
      indications: ProtocolData.INDICATIONS,
      concentrationUiPerMl: CONCENTRATION_UI_PER_ML,
      pureHeparinUiPerMl: PURE_CONCENTRATION_UI_PER_ML,
    });

    renderInitialDoseResult(elements, result);
    syncTitrationStartingPoint(weightReading.value, result.hourlyRateMl);
  }

  function syncTitrationStartingPoint(weightKg, hourlyRateMl) {
    var titWeightInput = document.getElementById('titWeight');
    var titRateInput = document.getElementById('titCurrentRate');
    if (!titWeightInput || !titRateInput) return;

    titWeightInput.value = weightKg;
    titRateInput.value = hourlyRateMl.toFixed(1);
    updateTitrationSimulation();
  }

  // ---------- Tabela de titulação (gerada a partir de ProtocolData.TITRATION_RULES) ----------

  function textCell(text) {
    var cell = document.createElement('td');
    cell.textContent = text;
    return cell;
  }

  function describePerKgRateAdjustment(rule) {
    if (rule.rateDeltaUiPerKgPerHour === 0) {
      return 'MANTER VELOCIDADE';
    }
    var verb = rule.rateDeltaUiPerKgPerHour > 0 ? 'Aumentar +' : 'Reduzir ';
    return verb + Math.abs(rule.rateDeltaUiPerKgPerHour) + ' UI/kg/h';
  }

  function describeExampleVolumeAdjustment(rule) {
    if (rule.rateDeltaUiPerKgPerHour === 0) {
      return 'Manter mL/h Atual';
    }
    var deltaMl = HeparinCalculator.uiToMl(EXAMPLE_WEIGHT_KG * rule.rateDeltaUiPerKgPerHour, CONCENTRATION_UI_PER_ML);
    return formatSignedMillilitersPerHour(deltaMl) + ' (para ' + EXAMPLE_WEIGHT_KG + ' kg)';
  }

  function buildTitrationRow(rule) {
    var row = document.createElement('tr');
    row.dataset.severity = rule.severity;

    var ratioCell = document.createElement('td');
    ratioCell.className = 'cell-primary';
    ratioCell.appendChild(document.createTextNode(rule.ratioRangeLabel));
    ratioCell.appendChild(document.createElement('br'));
    var badge = document.createElement('span');
    badge.className = 'status-badge';
    badge.textContent = rule.statusLabel;
    ratioCell.appendChild(badge);

    row.appendChild(ratioCell);
    row.appendChild(textCell(rule.ttpaRangeLabel));
    row.appendChild(textCell(rule.rebolusLabel));
    row.appendChild(textCell(describePerKgRateAdjustment(rule)));
    row.appendChild(textCell(describeExampleVolumeAdjustment(rule)));
    row.appendChild(textCell(rule.nextCheckLabel));

    return row;
  }

  function renderTitrationTable() {
    var tbody = document.getElementById('titrationTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    ProtocolData.TITRATION_RULES.forEach(function (rule) {
      tbody.appendChild(buildTitrationRow(rule));
    });
  }

  // ---------- Tabela de reversão com protamina ----------

  function buildProtamineRow(rule) {
    var row = document.createElement('tr');
    row.dataset.severity = rule.severity;
    row.appendChild(textCell(rule.timeRangeLabel));
    row.appendChild(textCell(rule.doseLabel));
    return row;
  }

  function renderProtamineTable() {
    var tbody = document.getElementById('protamineTableBody');
    if (!tbody) return;

    tbody.innerHTML = '';
    ProtocolData.PROTAMINE_RULES.forEach(function (rule) {
      tbody.appendChild(buildProtamineRow(rule));
    });
  }

  // ---------- Simulador de titulação em tempo real ----------

  function getTitrationElements() {
    return {
      weightField: document.getElementById('titWeightField'),
      weightInput: document.getElementById('titWeight'),
      weightError: document.getElementById('titWeightError'),
      rateField: document.getElementById('titRateField'),
      rateInput: document.getElementById('titCurrentRate'),
      rateError: document.getElementById('titRateError'),
      ttpaField: document.getElementById('titTtpaField'),
      ttpaInput: document.getElementById('titTtpaValue'),
      ttpaError: document.getElementById('titTtpaError'),
      bolusResult: document.getElementById('titResBolus'),
      rateResult: document.getElementById('titResRate'),
      nextResult: document.getElementById('titResNext'),
    };
  }

  function renderTitrationInvalidState(elements, message) {
    elements.bolusResult.textContent = '—';
    elements.bolusResult.removeAttribute('data-tone');
    elements.rateResult.textContent = '—';
    elements.rateResult.removeAttribute('data-tone');
    elements.nextResult.textContent = message;
  }

  function renderTitrationResult(elements, adjustment) {
    if (adjustment.pauseInfusion) {
      elements.bolusResult.textContent = 'PAUSAR BIC POR 1 HORA';
      elements.bolusResult.dataset.tone = 'alert';
    } else if (adjustment.rebolusUi > 0) {
      elements.bolusResult.textContent =
        'FAZER BOLUS: ' + formatUnits(adjustment.rebolusUi) + ' (' + formatMilliliters(adjustment.rebolusVolumeMl) + ' da solução)';
      elements.bolusResult.dataset.tone = 'alert';
    } else {
      elements.bolusResult.textContent = 'Nenhum Bolus Necessário';
      elements.bolusResult.dataset.tone = 'safe';
    }

    if (adjustment.rateDeltaMlPerHour === 0) {
      elements.rateResult.textContent = 'MANTER VAZÃO ATUAL em ' + formatMillilitersPerHour(adjustment.newRateMlPerHour);
      elements.rateResult.dataset.tone = 'safe';
    } else {
      var isIncrease = adjustment.rateDeltaMlPerHour > 0;
      var verb = isIncrease ? 'Aumentar ' : 'Reduzir ';
      var deltaLabel = isIncrease
        ? formatSignedMillilitersPerHour(adjustment.rateDeltaMlPerHour)
        : formatMillilitersPerHour(Math.abs(adjustment.rateDeltaMlPerHour));

      elements.rateResult.textContent =
        verb + deltaLabel +
        ' (' + formatSignedUiPerKgPerHour(adjustment.rule.rateDeltaUiPerKgPerHour) + ')' +
        ' → Nova BIC: ' + formatMillilitersPerHour(adjustment.newRateMlPerHour);
      elements.rateResult.dataset.tone = isIncrease ? 'alert' : 'caution';
    }

    elements.nextResult.textContent = adjustment.rule.nextCheckLabel;
  }

  function updateTitrationSimulation() {
    var elements = getTitrationElements();

    var weightReading = readNumberInput(elements.weightInput, false);
    var rateReading = readNumberInput(elements.rateInput, true);
    var ttpaReading = readNumberInput(elements.ttpaInput, false);

    setFieldValidity(elements.weightField, elements.weightInput, elements.weightError, weightReading.isValid, 'Informe um peso válido.');
    setFieldValidity(elements.rateField, elements.rateInput, elements.rateError, rateReading.isValid, 'Informe a vazão atual da BIC.');
    setFieldValidity(elements.ttpaField, elements.ttpaInput, elements.ttpaError, ttpaReading.isValid, 'Informe o TTPa encontrado, em segundos.');

    if (!weightReading.isValid || !rateReading.isValid || !ttpaReading.isValid) {
      renderTitrationInvalidState(elements, 'Preencha peso, vazão atual e TTPa para calcular o reajuste.');
      return;
    }

    var adjustment = HeparinCalculator.calculateTitrationAdjustment({
      weightKg: weightReading.value,
      currentRateMlPerHour: rateReading.value,
      ttpaSeconds: ttpaReading.value,
      titrationRules: ProtocolData.TITRATION_RULES,
      concentrationUiPerMl: CONCENTRATION_UI_PER_ML,
    });

    renderTitrationResult(elements, adjustment);
  }

  // ---------- Inicialização ----------

  function bindInitialDoseInputs() {
    document.getElementById('calcWeight').addEventListener('input', updateInitialDoseCalculation);
    document.getElementById('calcIndication').addEventListener('change', updateInitialDoseCalculation);
  }

  function bindTitrationInputs() {
    document.getElementById('titWeight').addEventListener('input', updateTitrationSimulation);
    document.getElementById('titCurrentRate').addEventListener('input', updateTitrationSimulation);
    document.getElementById('titTtpaValue').addEventListener('input', updateTitrationSimulation);
  }

  document.addEventListener('DOMContentLoaded', function () {
    initLogoFallback();
    initPrintButton();
    renderIndicationOptions();
    renderTitrationTable();
    renderProtamineTable();
    bindInitialDoseInputs();
    bindTitrationInputs();
    updateInitialDoseCalculation();
    initIcons();
  });
})();
