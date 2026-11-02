/*
 * MOTOR — validação (patientData), cálculos (calculations) e decisão (decisionEngine).
 * Não conhece o DOM nem contém regras clínicas: tudo o que é conduta vem do objeto
 * de protocolo recebido como parâmetro (ver protocol-iamspe-2012.js).
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VancoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var MIN = 60 * 1000;
  var HORA = 60 * MIN;

  // ---------------------------------------------------------------- formatação

  function fmtNum(n, casas) {
    var s = casas == null ? String(n) : n.toFixed(casas);
    return s.replace('.', ',');
  }

  function fmtDose(mg) {
    return mg < 1000 ? mg + ' mg' : fmtNum(mg / 1000) + ' g';
  }

  function fmtIntervalo(h) {
    return h + '/' + h + ' h';
  }

  function descreverEsquema(esq, comVia) {
    return fmtDose(esq.doseMg) + (comVia ? ' IV ' : ' ') + fmtIntervalo(esq.intervaloH);
  }

  function doisDigitos(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function fmtData(d) {
    return doisDigitos(d.getDate()) + '/' + doisDigitos(d.getMonth() + 1) + ' às ' +
      doisDigitos(d.getHours()) + ':' + doisDigitos(d.getMinutes());
  }

  function fmtDuracao(min) {
    min = Math.round(min);
    if (min < 60) return min + ' minutos';
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }

  function descreverColetaCurta(c) {
    if (c.tipo === 'horasApos') return c.horas + ' h após ' + c.referencia;
    return (c.antecedenciaMin ? c.antecedenciaMin + ' min ' : '') + 'antes da ' + c.dose + 'ª dose';
  }

  // ---------------------------------------------------------------- patientData

  var CAMPOS = {
    idade: { rotulo: 'Idade', unidade: 'anos', habitual: [18, 110] },
    peso: { rotulo: 'Peso', unidade: 'kg', habitual: [30, 250] },
    creatinina: { rotulo: 'Creatinina sérica', unidade: 'mg/dL', habitual: [0.2, 15] },
    vanco: { rotulo: 'Vancocinemia', unidade: 'mg/L', habitual: [0, 100], permiteZero: true }
  };

  function parseNumero(texto) {
    var s = String(texto == null ? '' : texto).trim().replace(',', '.');
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : NaN;
  }

  // Validação técnica (erros: bloqueiam) e de plausibilidade (avisos: pedem confirmação).
  function validar(nomes, brutos) {
    var erros = [], avisos = [], valores = {};
    nomes.forEach(function (nome) {
      var campo = CAMPOS[nome];
      var bruto = String(brutos[nome] == null ? '' : brutos[nome]).trim();
      if (!bruto) { erros.push(campo.rotulo + ': preencha o campo.'); return; }
      var n = parseNumero(bruto);
      if (isNaN(n)) { erros.push(campo.rotulo + ': "' + bruto + '" não é um número válido.'); return; }
      if (n < 0 || (n === 0 && !campo.permiteZero)) {
        erros.push(campo.rotulo + ': o valor deve ser maior que zero.');
        return;
      }
      valores[nome] = n;
      if (n < campo.habitual[0] || n > campo.habitual[1]) {
        avisos.push(campo.rotulo + ' ' + fmtNum(n) + ' ' + campo.unidade + ': valor fora da faixa habitual.');
      }
    });
    return { erros: erros, avisos: avisos, valores: valores };
  }

  // ---------------------------------------------------------------- calculations

  function cockcroftGault(protocolo, d) {
    var clcr = ((140 - d.idade) * d.peso) / (72 * d.creatinina);
    if (d.sexo === 'F') clcr *= protocolo.clcr.fatorMulher;
    return clcr;
  }

  function arredondar1(n) {
    return Math.round(n * 10) / 10;
  }

  function horariosDoses(primeiraDose, intervaloH, quantidade) {
    var doses = [];
    for (var i = 0; i < quantidade; i++) doses.push(new Date(primeiraDose.getTime() + i * intervaloH * HORA));
    return doses;
  }

  // Converte um "momento de coleta" do protocolo em data/hora concreta.
  function calcularColeta(protocolo, coleta, inicio, intervaloH) {
    if (coleta.tipo === 'horasApos') {
      return { quando: new Date(inicio.getTime() + coleta.horas * HORA), doses: [] };
    }
    var doses = horariosDoses(inicio, intervaloH, coleta.dose);
    var alvo = doses[doses.length - 1];
    if (coleta.antecedenciaMin != null) {
      return { quando: new Date(alvo.getTime() - coleta.antecedenciaMin * MIN), doses: doses, doseAlvo: alvo };
    }
    var janela = protocolo.monitorizacao.coletaAteMinAntes;
    return { janela: [new Date(alvo.getTime() - janela * MIN), alvo], doses: doses, doseAlvo: alvo };
  }

  function linhasDoses(doses) {
    return doses.map(function (d, i) { return 'Dose ' + (i + 1) + ' — ' + fmtData(d); });
  }

  // Verifica se o horário de coleta é compatível com um vale (pré-dose).
  function avaliarVale(protocolo, ultimaDose, intervaloH, coleta) {
    var proxima = new Date(ultimaDose.getTime() + intervaloH * HORA);
    var antes = (proxima.getTime() - coleta.getTime()) / MIN;
    var limite = protocolo.monitorizacao.coletaAteMinAntes;
    var r = { proximaDose: proxima, minutosAntes: antes };
    if (coleta.getTime() <= ultimaDose.getTime()) {
      r.status = 'antes-ultima-dose';
      r.mensagem = 'A coleta informada não é posterior à última dose. Confirme os horários.';
    } else if (antes < 0) {
      r.status = 'apos-dose';
      r.mensagem = 'O horário informado não corresponde a uma coleta pré-dose conforme o POP (' +
        fmtDuracao(-antes) + ' após a dose prevista para ' + fmtData(proxima) +
        '). Confirme o horário da coleta e da administração.';
    } else if (antes > limite) {
      r.status = 'cedo';
      r.mensagem = 'Coleta ' + fmtDuracao(antes) + ' antes da próxima dose (' + fmtData(proxima) +
        '). O POP orienta ' + protocolo.monitorizacao.textoColeta + '.';
    } else {
      r.status = 'compativel';
      r.mensagem = 'Coleta compatível com vale. Intervalo coleta → dose: ' + fmtDuracao(antes) + '.';
    }
    return r;
  }

  // ---------------------------------------------------------------- decisionEngine

  function naFaixa(v, f) {
    if (f.min != null && (f.minInclusivo ? v < f.min : v <= f.min)) return false;
    if (f.max != null && (f.maxInclusivo ? v > f.max : v >= f.max)) return false;
    return true;
  }

  function classificar(faixas, v) {
    for (var i = 0; i < faixas.length; i++) if (naFaixa(v, faixas[i])) return faixas[i];
    return null;
  }

  function mesmoEsquema(a, b) {
    return !!a && !!b && a.doseMg === b.doseMg && a.intervaloH === b.intervaloH;
  }

  function alertaAdministracao(protocolo, doseMg) {
    var adm = protocolo.administracao;
    if (doseMg <= adm.limiteDoseMg) return null;
    var tempo = adm.tempoInfusaoH[doseMg];
    var linhas = ['Dose individual de ' + fmtDose(doseMg) + ' (> ' + fmtDose(adm.limiteDoseMg) + ').'];
    linhas.push(tempo
      ? 'Conforme POP: tempo de infusão estendido para ' + fmtNum(tempo) + ' h.'
      : 'Conforme POP: ' + adm.textoInfusao + ' O POP não especifica o tempo para ' + fmtDose(doseMg) + '.');
    linhas.push('Concentração máxima da solução: ' + adm.concentracaoMaxMgMl + ' mg/mL (volume mínimo de ' +
      Math.ceil(doseMg / adm.concentracaoMaxMgMl) + ' mL para esta dose).');
    return { titulo: 'Atenção à administração', linhas: linhas };
  }

  function novoResultado(protocolo, modulo, titulo) {
    return {
      protocolo: protocolo.nomeCurto, modulo: modulo, titulo: titulo, nivel: 'ok',
      auditoria: [], conduta: [], coleta: [], alertas: [], fonte: '', resumo: '',
      regra: null, esquema: null
    };
  }

  function doseInicial(protocolo, d) {
    var cfg = protocolo.doseInicial;
    var r = novoResultado(protocolo, 'inicial', 'Vancomicina — dose inicial');
    var clcr = arredondar1(cockcroftGault(protocolo, d));
    var faixaClCr = classificar(cfg.faixasClCr, clcr);
    var faixaPeso = classificar(cfg.faixasPeso, d.peso);
    r.clcr = clcr;
    r.faixaClCr = faixaClCr;
    r.faixaPeso = faixaPeso;
    r.fonte = cfg.fonte;
    r.auditoria.push(
      ['Idade', fmtNum(d.idade) + ' anos'],
      ['Sexo', d.sexo === 'F' ? 'feminino (× ' + fmtNum(protocolo.clcr.fatorMulher) + ')' : 'masculino'],
      ['Peso', fmtNum(d.peso) + ' kg'],
      ['Creatinina sérica', fmtNum(d.creatinina) + ' mg/dL'],
      ['ClCr (Cockcroft-Gault)', fmtNum(clcr, 1) + ' mL/min'],
      ['Faixa de ClCr do POP', faixaClCr.rotulo],
      ['Faixa de peso do POP', faixaPeso ? faixaPeso.rotulo : 'não contemplada (peso < 50 kg)']
    );

    if (!faixaPeso) {
      var diaria = cfg.mgKgDia * d.peso;
      r.nivel = 'atencao';
      r.auditoria.push(['Regra aplicada', 'nenhuma — fora da Tabela 1']);
      r.conduta.push(
        'A Tabela 1 do POP só contempla peso ≥ 50 kg; não há esquema tabelado para ' + fmtNum(d.peso) + ' kg.',
        'Texto geral do POP: ' + cfg.textoGeral + '. Para este peso, ' + cfg.mgKgDia + ' mg/kg/dia = ' +
          fmtNum(Math.round(diaria)) + ' mg/dia (' + fmtNum(Math.round(diaria / 2)) +
          ' mg de 12/12 h) antes de qualquer ajuste pela função renal, que o POP não detalha fora da tabela.',
        'Definir o esquema a critério médico.'
      );
      r.resumo = 'Dose inicial · ClCr ' + fmtNum(clcr, 1) + ' · peso fora da Tabela 1';
      return r;
    }

    var regra = cfg.regras.filter(function (x) { return x.clcr === faixaClCr.id && x.peso === faixaPeso.id; })[0];
    r.regra = regra;
    r.esquema = { doseMg: regra.doseMg, intervaloH: regra.intervaloH };
    r.auditoria.push(['Regra aplicada', 'Tabela 1 — ' + regra.id]);
    r.conduta.push('Vancomicina ' + descreverEsquema(r.esquema, true) + '.');

    var c = regra.coleta;
    if (c.tipo === 'horasApos') {
      r.coleta.push('Primeira vancocinemia: ' + c.horas + ' horas após a ' + c.referencia + '.');
    } else {
      r.coleta.push('Primeira vancocinemia: antes da ' + c.dose + 'ª dose (' + protocolo.monitorizacao.textoColeta + ').');
    }
    if (d.primeiraDose) {
      var calc = calcularColeta(protocolo, c, d.primeiraDose, regra.intervaloH);
      r.coleta = r.coleta.concat(linhasDoses(calc.doses));
      r.coleta.push(calc.quando
        ? 'Coleta programada: ' + fmtData(calc.quando) + '.'
        : 'Coleta programada: entre ' + fmtData(calc.janela[0]) + ' e ' + fmtData(calc.janela[1]) + '.');
    }
    r.coleta.push('Dose de manutenção: ajustar conforme a vancocinemia (Tabela 2).');

    if (d.peso > 99 && d.peso < 100) {
      r.alertas.push({
        titulo: 'Faixa de peso',
        linhas: ['O POP lista "50 – 99 kg" e "≥ 100 kg". Peso entre 99 e 100 kg foi enquadrado na faixa 50 – 99 kg.']
      });
    }
    var adm = alertaAdministracao(protocolo, regra.doseMg);
    if (adm) r.alertas.push(adm);
    r.resumo = 'Dose inicial · ClCr ' + fmtNum(clcr, 1) + ' · ' + descreverEsquema(r.esquema);
    return r;
  }

  // Conduta de uma faixa da Tabela 2 para um esquema atual (null = esquema fora da tabela).
  function condutaFaixa(protocolo, faixa, esquema, d) {
    var cfg = protocolo.ajuste;
    var p = { conduta: [], coleta: [], regra: null, esquema: null, semRegra: false };
    var atual = esquema ? descreverEsquema(esquema, true) : 'esquema informado';
    var regra = cfg.regras.filter(function (x) { return x.faixa === faixa.id && mesmoEsquema(x.de, esquema); })[0] || null;

    if (faixa.acao === 'manter') {
      p.conduta.push('Manter a dose' + (esquema ? ' (' + atual + ').' : '.'));
      if (d.anteriorNoAlvo) {
        p.coleta.push('2 mensurações seguidas entre 15 e 20 mg/L: solicitar dosagem a cada ' + faixa.diasQuandoEstavel + ' dias.');
      } else {
        p.coleta.push(faixa.textoColeta, faixa.textoEstavel);
      }
      return p;
    }

    if (faixa.acao === 'suspender') {
      p.conduta.push(
        'Suspender a vancomicina (a critério médico).',
        'Reiniciar quando a vancocinemia estiver entre ' + faixa.reinicio[0] + ' e ' + faixa.reinicio[1] + ' mg/L.',
        'O POP não define o esquema de reinício para esta faixa.'
      );
      p.coleta.push('Coletar vancocinemia ' + descreverColetaCurta(faixa.coleta) + '.', cfg.textoAguardar);
      return p;
    }

    if (faixa.acao === 'suspender-reiniciar') {
      p.conduta.push(
        'Suspender a vancomicina (a critério médico).',
        'Coletar vancocinemia ' + faixa.recoletaHoras + ' horas após a última mensuração.'
      );
    }

    if (!regra) {
      p.semRegra = true;
      p.conduta.push(faixa.acao === 'suspender-reiniciar'
        ? 'Reiniciar quando a vancocinemia estiver entre ' + faixa.reinicio[0] + ' e ' + faixa.reinicio[1] +
          ' mg/L. O POP não prevê esquema de reinício para ' + atual + '.'
        : 'O POP não prevê ajuste para ' + atual + ' na faixa ' + faixa.rotulo + '. Definir a critério médico.');
      return p;
    }

    p.regra = regra;
    p.esquema = regra.para;
    var novo = descreverEsquema(regra.para, true);
    if (faixa.acao === 'suspender-reiniciar') {
      p.conduta.push('Reiniciar quando a vancocinemia estiver entre ' + faixa.reinicio[0] + ' e ' + faixa.reinicio[1] +
        ' mg/L, com ' + novo + ' (esquema anterior: ' + atual + ').');
    } else {
      p.conduta.push('Alterar de ' + atual + ' para ' + novo + '.');
    }
    p.coleta.push(regra.coleta.tipo === 'horasApos'
      ? 'Coletar vancocinemia ' + descreverColetaCurta(regra.coleta) + '.'
      : 'Coletar vancocinemia ' + descreverColetaCurta(regra.coleta) + ' do novo esquema posológico.');
    p.coleta.push(cfg.textoAguardar);
    return p;
  }

  function ajuste(protocolo, d) {
    var cfg = protocolo.ajuste, mon = protocolo.monitorizacao;
    var r = novoResultado(protocolo, 'ajuste', 'Vancomicina — ajuste pela vancocinemia');
    var esquema = d.esquema || null;
    var faixa = classificar(cfg.faixas, d.vanco);
    r.faixa = faixa;
    r.fonte = cfg.fonte;
    r.auditoria.push(
      ['Vancocinemia (vale)', fmtNum(d.vanco) + ' mg/L'],
      ['Esquema atual', esquema ? descreverEsquema(esquema, true) : 'outro (fora da Tabela 2)']
    );

    if (d.ultimaDose && d.coletaEm && esquema) {
      var vale = avaliarVale(protocolo, d.ultimaDose, esquema.intervaloH, d.coletaEm);
      r.vale = vale;
      r.auditoria.push(['Horário da coleta', vale.status === 'compativel' ? vale.mensagem : 'não confirmado como vale']);
      if (vale.status !== 'compativel') {
        r.alertas.push({ titulo: 'Horário da coleta', linhas: [vale.mensagem, mon.textoVale] });
      }
    }

    if (!faixa) {
      // Valor entre duas faixas inteiras do POP (ex.: 14,5 ou 20,5 mg/L).
      var abaixo = cfg.faixas.filter(function (f) { return f.max != null && f.max < d.vanco; }).pop();
      var acima = cfg.faixas.filter(function (f) { return f.min != null && f.min > d.vanco; })[0];
      r.nivel = 'atencao';
      r.lacuna = true;
      r.auditoria.push(['Faixa do POP', 'nenhuma — valor entre ' + abaixo.rotulo + ' e ' + acima.rotulo]);
      r.conduta.push('O POP define faixas em números inteiros e não prevê conduta para ' + fmtNum(d.vanco) +
        ' mg/L. Escolher a faixa a critério médico:');
      [abaixo, acima].forEach(function (f) {
        var p = condutaFaixa(protocolo, f, esquema, d);
        r.conduta.push('Se considerada a faixa ' + f.rotulo + ': ' + p.conduta.concat(p.coleta).join(' '));
      });
      r.resumo = 'Ajuste · Vanco ' + fmtNum(d.vanco) + ' · entre faixas do POP';
    } else {
      var parte = condutaFaixa(protocolo, faixa, esquema, d);
      r.regra = parte.regra;
      r.esquema = parte.esquema;
      r.semRegra = parte.semRegra;
      r.conduta = parte.conduta;
      r.coleta = parte.coleta;
      r.auditoria.push(
        ['Faixa do POP', faixa.rotulo],
        ['Regra aplicada', parte.regra ? 'Tabela 2 — ' + parte.regra.id : 'Tabela 2 — faixa ' + faixa.rotulo +
          (parte.semRegra ? ' (esquema atual não contemplado)' : '')]
      );
      r.fonte = 'Tabela 2 — página ' + faixa.pagina + ' do POP';
      if (faixa.acao === 'suspender' || faixa.acao === 'suspender-reiniciar') r.nivel = 'alerta';
      else if (parte.semRegra) r.nivel = 'atencao';

      // Horários concretos, quando os dados opcionais foram informados
      if (faixa.acao === 'suspender-reiniciar' && d.coletaEm) {
        r.coleta.unshift('Nova vancocinemia (' + faixa.recoletaHoras + ' h após a coleta informada): ' +
          fmtData(new Date(d.coletaEm.getTime() + faixa.recoletaHoras * HORA)) + '.');
      }
      if (faixa.acao === 'manter' && !d.anteriorNoAlvo && d.ultimaDose && esquema) {
        var terceira = new Date(d.ultimaDose.getTime() + 3 * esquema.intervaloH * HORA);
        r.coleta.push('Coleta programada: ' + fmtData(new Date(terceira.getTime() - faixa.coleta.antecedenciaMin * MIN)) +
          ' (3ª dose após a monitorização prevista para ' + fmtData(terceira) + ').');
      }
      if (parte.regra && d.inicioNovo) {
        var calc = calcularColeta(protocolo, parte.regra.coleta, d.inicioNovo, parte.regra.para.intervaloH);
        r.coleta = r.coleta.concat(linhasDoses(calc.doses));
        r.coleta.push('Coleta programada: ' + fmtData(calc.quando) + '.');
      }

      r.resumo = 'Ajuste · Vanco ' + fmtNum(d.vanco) + ' · ' +
        (parte.esquema ? (esquema ? descreverEsquema(esquema) + ' → ' : '') + descreverEsquema(parte.esquema)
          : faixa.acao === 'manter' ? 'manter a dose'
          : faixa.acao === 'suspender' ? 'suspender' : 'sem regra no POP');
      if (faixa.acao === 'suspender-reiniciar') r.resumo += ' (suspender; reinício)';
    }

    if (d.vanco > mon.toxicidadeAcima) {
      r.alertas.push({ titulo: 'Risco de toxicidade', linhas: [mon.textoToxicidade] });
    }
    if (d.vanco <= mon.valeMinimo) {
      r.alertas.push({ titulo: 'Vale abaixo do mínimo', linhas: [mon.textoValeMinimo] });
    }
    if (r.esquema) {
      var adm = alertaAdministracao(protocolo, r.esquema.doseMg);
      if (adm) r.alertas.push(adm);
    }
    return r;
  }

  function hemodialise(protocolo, d) {
    var cfg = protocolo.hemodialise;
    var r = novoResultado(protocolo, 'hd', 'Vancomicina — hemodiálise de alto fluxo');
    var faixa = classificar(cfg.faixas, d.peso);
    r.faixa = faixa;
    r.regra = faixa;
    r.fonte = cfg.fonte;
    r.auditoria.push(
      ['Peso', fmtNum(d.peso) + ' kg'],
      ['Faixa de peso do POP', faixa.rotulo],
      ['Regra aplicada', 'Item 4e — ' + faixa.id]
    );
    r.conduta.push(
      'Dose de ataque: vancomicina ' + fmtDose(faixa.ataqueMg) + ' IV.',
      'Dose de manutenção: vancomicina ' + fmtDose(faixa.manutencaoMg) + ' IV, sempre no fim da hemodiálise (nos últimos ' +
        faixa.ultimosMin + ' minutos da sessão).'
    );
    var adm = alertaAdministracao(protocolo, faixa.ataqueMg);
    if (adm) r.alertas.push(adm);
    r.resumo = 'HD · ' + fmtNum(d.peso) + ' kg · ataque ' + fmtDose(faixa.ataqueMg) + ' / manutenção ' + fmtDose(faixa.manutencaoMg);
    return r;
  }

  function programarColeta(protocolo, d) {
    var r = novoResultado(protocolo, 'coleta', 'Vancomicina — programação da coleta');
    var coleta, calc;
    r.fonte = protocolo.monitorizacao.fonte + '; Tabelas 1 e 2';
    if (d.tipo === 'horasApos') {
      coleta = { tipo: 'horasApos', horas: d.horas, referencia: 'o evento de referência' };
      calc = calcularColeta(protocolo, coleta, d.inicio, null);
      r.auditoria.push(['Referência', fmtData(d.inicio)], ['Regra', 'coletar ' + d.horas + ' h após a referência']);
    } else {
      coleta = { tipo: 'antesDose', dose: d.dose, antecedenciaMin: d.antecedenciaMin };
      calc = calcularColeta(protocolo, coleta, d.inicio, d.intervaloH);
      r.auditoria.push(
        ['Intervalo', fmtIntervalo(d.intervaloH)],
        ['Regra', 'coletar ' + d.antecedenciaMin + ' min antes da ' + d.dose + 'ª dose']
      );
      calc.doses.forEach(function (dose, i) { r.auditoria.push(['Dose ' + (i + 1), fmtData(dose)]); });
      if (d.antecedenciaMin > protocolo.monitorizacao.coletaAteMinAntes) {
        r.nivel = 'atencao';
        r.alertas.push({ titulo: 'Antecedência', linhas: ['O POP orienta ' + protocolo.monitorizacao.textoColeta + '.'] });
      }
    }
    r.quando = calc.quando;
    r.coleta.push('Coleta programada: ' + fmtData(calc.quando) + '.');
    r.resumo = 'Coleta · ' + fmtData(calc.quando);
    return r;
  }

  // ---------------------------------------------------------------- texto para evolução

  function textoParaCopiar(r) {
    var linhas = [r.titulo + ':', ''];
    r.auditoria.forEach(function (a) { linhas.push(a[0] + ': ' + a[1] + (/[.!?]$/.test(a[1]) ? '' : '.')); });
    if (r.conduta.length) {
      linhas.push('', 'Conduta conforme POP institucional de monitorização sérica da vancomicina (' + r.protocolo + '):');
      linhas = linhas.concat(r.conduta);
    }
    if (r.coleta.length) {
      linhas.push('', 'Vancocinemia:');
      linhas = linhas.concat(r.coleta);
    }
    r.alertas.forEach(function (a) {
      linhas.push('', a.titulo + ': ' + a.linhas.join(' '));
    });
    return linhas.join('\n');
  }

  return {
    CAMPOS: CAMPOS,
    parseNumero: parseNumero,
    validar: validar,
    cockcroftGault: cockcroftGault,
    horariosDoses: horariosDoses,
    calcularColeta: calcularColeta,
    avaliarVale: avaliarVale,
    classificar: classificar,
    alertaAdministracao: alertaAdministracao,
    doseInicial: doseInicial,
    ajuste: ajuste,
    hemodialise: hemodialise,
    programarColeta: programarColeta,
    textoParaCopiar: textoParaCopiar,
    fmtNum: fmtNum,
    fmtDose: fmtDose,
    fmtIntervalo: fmtIntervalo,
    fmtData: fmtData,
    descreverEsquema: descreverEsquema,
    descreverColetaCurta: descreverColetaCurta
  };
});
