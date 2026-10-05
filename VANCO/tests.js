/*
 * TESTES — um caso conhecido para cada linha das tabelas do POP.
 * Os resultados esperados foram digitados a partir do PDF, não derivados do arquivo de regras.
 * Executar com `node tests.js` ou abrir testes.html no navegador.
 */
(function () {
  'use strict';
  var emNode = typeof module !== 'undefined' && module.exports;
  var P = emNode ? require('./protocol-iamspe-2012.js') : window.VANCO_PROTOCOLOS['iamspe-2012'];
  var E = emNode ? require('./engine.js') : window.VancoEngine;

  var casos = [];
  function caso(regra, origem, nome, esperado, obter) {
    casos.push({ regra: regra, origem: origem, nome: nome, esperado: esperado, obter: obter });
  }

  function dt(dia, hora, min) {
    return new Date(2026, 9, dia, hora, min || 0);
  }
  function esq(doseMg, intervaloH) {
    return { doseMg: doseMg, intervaloH: intervaloH };
  }

  // ------------------------------------------------------------ Cockcroft-Gault
  caso('Cockcroft-Gault', 'Página 1', 'Homem, 72 a, 76 kg, Cr 1,8', '39,9', function () {
    return E.fmtNum(E.cockcroftGault(P, { idade: 72, sexo: 'M', peso: 76, creatinina: 1.8 }), 1);
  });
  caso('Cockcroft-Gault', 'Página 1', 'Mulher, 60 a, 60 kg, Cr 1,0 (× 0,85)', '56,7', function () {
    return E.fmtNum(E.cockcroftGault(P, { idade: 60, sexo: 'F', peso: 60, creatinina: 1.0 }), 1);
  });

  // ------------------------------------------------------------ Tabela 1
  function inicial(nome, paciente, esperado) {
    caso('Dose inicial', 'Tabela 1', nome, esperado, function () {
      var r = E.doseInicial(P, paciente);
      return r.esquema ? E.descreverEsquema(r.esquema) + ' | ' + E.descreverColetaCurta(r.regra.coleta) : 'sem regra';
    });
  }
  inicial('ClCr > 50, 50–99 kg (40 a, M, 75 kg, Cr 1,0)', { idade: 40, sexo: 'M', peso: 75, creatinina: 1.0 }, '1 g 12/12 h | antes da 4ª dose');
  inicial('ClCr > 50, ≥ 100 kg (40 a, M, 110 kg, Cr 1,0)', { idade: 40, sexo: 'M', peso: 110, creatinina: 1.0 }, '1,5 g 12/12 h | antes da 4ª dose');
  inicial('ClCr 10–50, 50–99 kg (72 a, M, 76 kg, Cr 1,8)', { idade: 72, sexo: 'M', peso: 76, creatinina: 1.8 }, '1 g 24/24 h | antes da 3ª dose');
  inicial('ClCr 10–50, ≥ 100 kg (70 a, M, 105 kg, Cr 3,0)', { idade: 70, sexo: 'M', peso: 105, creatinina: 3.0 }, '1 g 12/12 h | antes da 3ª dose');
  inicial('ClCr < 10, 50–99 kg (80 a, F, 55 kg, Cr 6,0)', { idade: 80, sexo: 'F', peso: 55, creatinina: 6.0 }, '1 g 24/24 h | 24 h após 1ª dose');
  inicial('ClCr < 10, ≥ 100 kg (85 a, M, 100 kg, Cr 9,0)', { idade: 85, sexo: 'M', peso: 100, creatinina: 9.0 }, '1 g 24/24 h | 24 h após 1ª dose');
  inicial('Peso < 50 kg: fora da Tabela 1', { idade: 50, sexo: 'F', peso: 45, creatinina: 0.8 }, 'sem regra');

  function limite(nome, faixas, valor, esperado) {
    caso('Dose inicial', 'Tabela 1', 'Limite: ' + nome, esperado, function () {
      var f = E.classificar(faixas, valor);
      return f ? f.id : 'nenhuma';
    });
  }
  limite('ClCr 50,0 pertence a "entre 10 e 50"', P.doseInicial.faixasClCr, 50, '10-50');
  limite('ClCr 50,1 pertence a "> 50"', P.doseInicial.faixasClCr, 50.1, 'gt50');
  limite('ClCr 10,0 pertence a "entre 10 e 50"', P.doseInicial.faixasClCr, 10, '10-50');
  limite('ClCr 9,9 pertence a "< 10"', P.doseInicial.faixasClCr, 9.9, 'lt10');
  limite('peso 100 kg pertence a "≥ 100"', P.doseInicial.faixasPeso, 100, 'ge100');
  limite('peso 99,5 kg pertence a "50–99"', P.doseInicial.faixasPeso, 99.5, '50-99');

  // ------------------------------------------------------------ Tabela 2
  function ajuste(regra, origem, vanco, de, esperado) {
    caso(regra, origem, 'Vanco ' + E.fmtNum(vanco) + ' com ' + E.descreverEsquema(de), esperado, function () {
      var r = E.ajuste(P, { vanco: vanco, esquema: de });
      return r.esquema ? E.descreverEsquema(r.esquema) + ' | ' + E.descreverColetaCurta(r.regra.coleta) : 'sem regra';
    });
  }
  var T3 = ' | 30 min antes da 3ª dose', T4 = ' | 30 min antes da 4ª dose', H48 = ' | 48 h após alteração do esquema posológico';

  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 3, esq(1000, 48), '1 g 24/24 h' + T3);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 3, esq(1000, 24), '1 g 12/12 h' + T3);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 3, esq(1000, 12), '1,5 g 8/8 h' + T4);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 3, esq(1000, 8), '2 g 8/8 h' + T4);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 4.9, esq(1500, 12), '2 g 8/8 h' + T4);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 4.9, esq(1500, 8), '2 g 8/8 h' + T4);
  ajuste('Ajuste < 5', 'Tabela 2 (pág. 3)', 3, esq(2000, 8), 'sem regra');

  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 5, esq(1000, 48), '1 g 24/24 h' + T3);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 8.2, esq(1000, 24), '1 g 12/12 h' + T3);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 10, esq(1000, 12), '1 g 8/8 h' + T4);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 10, esq(1000, 8), '1,5 g 8/8 h' + T4);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 12, esq(1500, 12), '1,5 g 8/8 h' + T4);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 12, esq(1500, 8), '2 g 8/8 h' + T4);
  ajuste('Ajuste 5–14', 'Tabela 2 (pág. 3)', 14, esq(2000, 8), '2,5 g 8/8 h' + T4);

  caso('15–20', 'Tabela 2 (pág. 3)', 'Vanco 17 com 1 g 12/12 h: manter', 'Manter a dose (1 g IV 12/12 h). | Coletar nova vancocinemia 30 min antes da 3ª dose após a última monitorização.', function () {
    var r = E.ajuste(P, { vanco: 17, esquema: esq(1000, 12) });
    return r.conduta[0] + ' | ' + r.coleta[0];
  });
  caso('15–20', 'Tabela 2 (pág. 3)', '2ª mensuração seguida entre 15 e 20', '2 mensurações seguidas entre 15 e 20 mg/L: solicitar dosagem a cada 3 dias.', function () {
    return E.ajuste(P, { vanco: 15, esquema: esq(1000, 12), anteriorNoAlvo: true }).coleta[0];
  });
  caso('15–20', 'Tabela 2 (pág. 3)', 'Próxima coleta: última dose 03/10 08:00, 12/12 h', 'Coleta programada: 04/10 às 19:30 (3ª dose após a monitorização prevista para 04/10 às 20:00).', function () {
    var r = E.ajuste(P, { vanco: 20, esquema: esq(1000, 12), ultimaDose: dt(3, 8), coletaEm: dt(3, 19, 30) });
    return r.coleta[r.coleta.length - 1];
  });

  ajuste('21–40', 'Tabela 2 (pág. 4)', 21, esq(1000, 48), '1 g 72/72 h' + H48);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 25, esq(1000, 24), '1 g 48/48 h' + H48);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 25, esq(1000, 12), '1 g 24/24 h' + H48);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 30, esq(1000, 8), '1 g 12/12 h' + T3);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 30, esq(1500, 12), '1 g 12/12 h' + T3);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 35, esq(1500, 8), '1 g 8/8 h' + T3);
  ajuste('21–40', 'Tabela 2 (pág. 4)', 40, esq(2000, 8), '1,5 g 8/8 h' + T3);
  caso('21–40', 'Tabela 2 (pág. 4)', 'Suspender (ACM) e recoletar em 12 h', 'alerta | Suspender a vancomicina (a critério médico). | Coletar vancocinemia 12 horas após a última mensuração. | Nova vancocinemia (12 h após a coleta informada): 04/10 às 07:30.', function () {
    var r = E.ajuste(P, { vanco: 28, esquema: esq(1000, 12), ultimaDose: dt(3, 8), coletaEm: dt(3, 19, 30) });
    return [r.nivel, r.conduta[0], r.conduta[1], r.coleta[0]].join(' | ');
  });

  caso('> 40', 'Tabela 2 (pág. 4)', 'Vanco 43: suspender e reiniciar com 15–20', 'alerta | Suspender a vancomicina (a critério médico). | Reiniciar quando a vancocinemia estiver entre 15 e 20 mg/L. | Coletar vancocinemia 48 h após alteração do esquema posológico.', function () {
    var r = E.ajuste(P, { vanco: 43, esquema: esq(1000, 12) });
    return [r.nivel, r.conduta[0], r.conduta[1], r.coleta[0]].join(' | ');
  });
  caso('> 40', 'Tabela 2 (pág. 4)', 'Limite: 40 pertence a 21–40; 40,1 a > 40', '21-40 | gt40', function () {
    return E.classificar(P.ajuste.faixas, 40).id + ' | ' + E.classificar(P.ajuste.faixas, 40.1).id;
  });

  caso('Valores entre faixas', 'Tabela 2', 'Vanco 14,5 (entre 5–14 e 15–20): sem conduta automática', 'lacuna | atencao | sem esquema', function () {
    var r = E.ajuste(P, { vanco: 14.5, esquema: esq(1000, 12) });
    return [r.lacuna ? 'lacuna' : 'faixa', r.nivel, r.esquema ? 'esquema' : 'sem esquema'].join(' | ');
  });
  caso('Valores entre faixas', 'Tabela 2', 'Vanco 20,5 (entre 15–20 e 21–40): sem conduta automática', 'lacuna | atencao | sem esquema', function () {
    var r = E.ajuste(P, { vanco: 20.5, esquema: esq(1000, 12) });
    return [r.lacuna ? 'lacuna' : 'faixa', r.nivel, r.esquema ? 'esquema' : 'sem esquema'].join(' | ');
  });

  // ------------------------------------------------------------ Monitorização
  caso('Monitorização', 'Página 2', 'Vale: última dose 08:00, 12/12 h, coleta 19:30', 'compativel | 30', function () {
    var v = E.avaliarVale(P, dt(3, 8), 12, dt(3, 19, 30));
    return v.status + ' | ' + v.minutosAntes;
  });
  caso('Monitorização', 'Página 2', 'Coleta 21:15 (após a dose das 20:00)', 'apos-dose', function () {
    return E.avaliarVale(P, dt(3, 8), 12, dt(3, 21, 15)).status;
  });
  caso('Monitorização', 'Página 2', 'Coleta 17:00 (mais de 1 h antes da dose)', 'cedo', function () {
    return E.avaliarVale(P, dt(3, 8), 12, dt(3, 17)).status;
  });
  caso('Monitorização', 'Página 2', 'Vanco 32: alerta de toxicidade (> 30)', 'Risco de toxicidade', function () {
    return E.ajuste(P, { vanco: 32, esquema: esq(1000, 12) }).alertas.map(function (a) { return a.titulo; }).join(', ');
  });
  caso('Monitorização', 'Página 2', 'Vanco 8: alerta de vale ≤ 10', 'Vale abaixo do mínimo', function () {
    return E.ajuste(P, { vanco: 8, esquema: esq(1000, 24) }).alertas.map(function (a) { return a.titulo; }).join(', ');
  });

  // ------------------------------------------------------------ Hemodiálise
  function hd(peso, esperado) {
    caso('Hemodiálise', 'Página 4', 'Peso ' + E.fmtNum(peso) + ' kg', esperado, function () {
      var f = E.hemodialise(P, { peso: peso }).faixa;
      return E.fmtDose(f.ataqueMg) + ' | ' + E.fmtDose(f.manutencaoMg) + ' | últimos ' + f.ultimosMin + ' min';
    });
  }
  hd(65, '1 g | 500 mg | últimos 30 min');
  hd(69.9, '1 g | 500 mg | últimos 30 min');
  hd(70, '1,25 g | 750 mg | últimos 60 min');
  hd(100, '1,25 g | 750 mg | últimos 60 min');
  hd(100.5, '1,5 g | 1 g | últimos 90 min');

  // ------------------------------------------------------------ Horários
  caso('Horário da coleta', 'Tabelas 1 e 2', '1ª dose 03/10 08:00, 12/12 h, 30 min antes da 4ª dose', '04/10 às 19:30', function () {
    return E.fmtData(E.programarColeta(P, { tipo: 'antesDose', inicio: dt(3, 8), intervaloH: 12, dose: 4, antecedenciaMin: 30 }).quando);
  });
  caso('Horário da coleta', 'Tabelas 1 e 2', '48 h após alteração em 03/10 08:00', '05/10 às 08:00', function () {
    return E.fmtData(E.programarColeta(P, { tipo: 'horasApos', inicio: dt(3, 8), horas: 48 }).quando);
  });
  caso('Horário da coleta', 'Tabela 1', 'Dose inicial 1 g 12/12 h, 1ª dose 03/10 08:00: janela antes da 4ª dose', 'Coleta programada: entre 04/10 às 19:00 e 04/10 às 20:00.', function () {
    var r = E.doseInicial(P, { idade: 40, sexo: 'M', peso: 75, creatinina: 1.0, primeiraDose: dt(3, 8) });
    return r.coleta[r.coleta.length - 2];
  });

  // ------------------------------------------------------------ Alertas de administração
  caso('Alertas de administração', 'Página 1', 'Dose de 1,5 g: infusão 1,5 h, mínimo 300 mL', '1,5 h | 300 mL', function () {
    var t = E.alertaAdministracao(P, 1500).linhas.join(' ');
    return (t.indexOf('1,5 h') >= 0 ? '1,5 h' : '?') + ' | ' + (t.indexOf('300 mL') >= 0 ? '300 mL' : '?');
  });
  caso('Alertas de administração', 'Página 1', 'Dose de 2 g: infusão 2 h, mínimo 400 mL', '2 h | 400 mL', function () {
    var t = E.alertaAdministracao(P, 2000).linhas.join(' ');
    return (t.indexOf('para 2 h') >= 0 ? '2 h' : '?') + ' | ' + (t.indexOf('400 mL') >= 0 ? '400 mL' : '?');
  });
  caso('Alertas de administração', 'Página 1', 'Dose de 1 g: sem alerta', 'sem alerta', function () {
    return E.alertaAdministracao(P, 1000) ? 'alerta' : 'sem alerta';
  });

  // ------------------------------------------------------------ Validação
  caso('Validação de dados', 'Relatório §15', 'Texto, negativo e vazio bloqueiam o cálculo', '3 erros', function () {
    return E.validar(['idade', 'creatinina', 'peso'], { idade: 'abc', creatinina: '-1', peso: '' }).erros.length + ' erros';
  });
  caso('Validação de dados', 'Relatório §15', 'Valores implausíveis pedem confirmação', '0 erros | 3 avisos', function () {
    var v = E.validar(['idade', 'creatinina', 'peso'], { idade: '190', creatinina: '0,03', peso: '740' });
    return v.erros.length + ' erros | ' + v.avisos.length + ' avisos';
  });

  // ------------------------------------------------------------ execução
  var resultados = casos.map(function (c) {
    var obtido;
    try { obtido = c.obter(); } catch (erro) { obtido = 'ERRO: ' + erro.message; }
    return { regra: c.regra, origem: c.origem, nome: c.nome, esperado: c.esperado, obtido: obtido, aprovado: obtido === c.esperado };
  });
  var falhas = resultados.filter(function (r) { return !r.aprovado; });

  if (emNode) {
    resultados.forEach(function (r) {
      console.log((r.aprovado ? 'APROVADO ' : 'REPROVADO') + ' [' + r.regra + '] ' + r.nome);
      if (!r.aprovado) console.log('    esperado: ' + r.esperado + '\n    obtido:   ' + r.obtido);
    });
    console.log('\n' + (resultados.length - falhas.length) + '/' + resultados.length + ' testes aprovados.');
    process.exit(falhas.length ? 1 : 0);
  } else {
    window.VANCO_TESTES = resultados;
  }
})();
