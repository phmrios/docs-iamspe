/*
 * REGRAS DO PROTOCOLO — POP "Monitorização Sérica da Vancomicina", CCIH-HSPE / IAMSPE.
 * Documento criado em julho/2012, com revisão prevista para julho/2014.
 *
 * Este arquivo contém apenas dados transcritos do PDF. Nenhuma lógica de interface
 * ou de cálculo deve ser colocada aqui. Para uma revisão do protocolo, criar outro
 * arquivo (ex.: protocol-iamspe-revisado.js) com a mesma estrutura.
 */
(function (root) {
  'use strict';

  // Momentos de coleta usados nas Tabelas 1 e 2
  var ANTES_3A_30MIN = { tipo: 'antesDose', dose: 3, antecedenciaMin: 30 };
  var ANTES_4A_30MIN = { tipo: 'antesDose', dose: 4, antecedenciaMin: 30 };
  var APOS_48H = { tipo: 'horasApos', horas: 48, referencia: 'alteração do esquema posológico' };

  function e(doseMg, intervaloH) {
    return { doseMg: doseMg, intervaloH: intervaloH };
  }

  var protocolo = {
    id: 'iamspe-2012',
    nome: 'IAMSPE — Monitorização Sérica da Vancomicina',
    nomeCurto: 'POP IAMSPE 2012',
    versao: 'julho/2012',
    revisaoPrevista: 'julho/2014',
    setor: 'CCIH-HSPE · GE-CIH/MI',

    // Página 1 — item 3 (Definições)
    clcr: {
      fonte: 'Página 1 — item 3 (Cockcroft-Gault)',
      fatorMulher: 0.85
    },

    // Página 1 — Tabela 1
    doseInicial: {
      fonte: 'Tabela 1 — Dose de ataque (inicial) baseada no peso e no Cl Cr (página 1)',
      textoGeral: 'dose de ataque de 30 mg/kg/dia dividida em duas tomadas (a cada 12 horas), baseada na função renal',
      mgKgDia: 30,
      faixasClCr: [
        { id: 'gt50', rotulo: '> 50 mL/min', min: 50, minInclusivo: false },
        { id: '10-50', rotulo: 'Entre 10 e 50 mL/min', min: 10, minInclusivo: true, max: 50, maxInclusivo: true },
        { id: 'lt10', rotulo: '< 10 mL/min', max: 10, maxInclusivo: false }
      ],
      // O POP lista "50 – 99 kg" e "≥ 100 kg"; a primeira faixa é aplicada a todo peso < 100 kg.
      faixasPeso: [
        { id: '50-99', rotulo: '50 – 99 kg', min: 50, minInclusivo: true, max: 100, maxInclusivo: false },
        { id: 'ge100', rotulo: '≥ 100 kg', min: 100, minInclusivo: true }
      ],
      regras: [
        { id: 'T1-01', clcr: 'gt50', peso: '50-99', doseMg: 1000, intervaloH: 12, coleta: { tipo: 'antesDose', dose: 4 } },
        { id: 'T1-02', clcr: 'gt50', peso: 'ge100', doseMg: 1500, intervaloH: 12, coleta: { tipo: 'antesDose', dose: 4 } },
        { id: 'T1-03', clcr: '10-50', peso: '50-99', doseMg: 1000, intervaloH: 24, coleta: { tipo: 'antesDose', dose: 3 } },
        { id: 'T1-04', clcr: '10-50', peso: 'ge100', doseMg: 1000, intervaloH: 12, coleta: { tipo: 'antesDose', dose: 3 } },
        { id: 'T1-05', clcr: 'lt10', peso: '50-99', doseMg: 1000, intervaloH: 24, coleta: { tipo: 'horasApos', horas: 24, referencia: '1ª dose' } },
        { id: 'T1-06', clcr: 'lt10', peso: 'ge100', doseMg: 1000, intervaloH: 24, coleta: { tipo: 'horasApos', horas: 24, referencia: '1ª dose' } }
      ]
    },

    // Página 1 — administração
    administracao: {
      fonte: 'Página 1 — item 4a',
      limiteDoseMg: 1000,
      tempoInfusaoH: { 1500: 1.5, 2000: 2 },
      textoInfusao: 'Dose individual > 1 g: estender o tempo de infusão para 1,5 ou 2 horas (exemplo do POP: doses de 1,5 ou 2 g).',
      concentracaoMaxMgMl: 5
    },

    // Página 2 — itens 4b e 4c
    monitorizacao: {
      fonte: 'Página 2 — itens 4b e 4c',
      valeMinimo: 10,
      alvoComplicadas: [15, 20],
      toxicidadeAcima: 30,
      coletaAteMinAntes: 60,
      textoVale: 'A vancocinemia deve ser dosada sempre antes da próxima dose (VALE) e não após a dose (PICO).',
      textoColeta: 'colher até uma hora antes da administração do medicamento',
      textoValeMinimo: 'A vancocinemia no vale deve ser sempre mantida acima de 10 mg/L.',
      textoComplicadas: 'Infecções complicadas por S. aureus (bacteremia, endocardite, osteomielite, meningite, pneumonia hospitalar): vale recomendado entre 15 e 20 mg/L.',
      textoToxicidade: 'Níveis séricos acima de 30 mg/L estão associados a alto risco de toxicidade.',
      textoNovaColeta: 'Nova coleta sempre que houver alteração da função renal (aumento de creatinina de 0,5 mg/dL ou melhora da insuficiência renal).'
    },

    // Páginas 3 e 4 — Tabela 2
    ajuste: {
      fonte: 'Tabela 2 — Dose de manutenção e ajuste baseado na vancocinemia (páginas 3 e 4)',
      textoAguardar: 'Aguardar o resultado da vancocinemia para administração de doses subsequentes.',
      esquemas: [e(1000, 48), e(1000, 24), e(1000, 12), e(1000, 8), e(1500, 12), e(1500, 8), e(2000, 8)],
      faixas: [
        { id: 'lt5', rotulo: '< 5 mg/L', max: 5, maxInclusivo: false, acao: 'ajustar', pagina: 3 },
        { id: '5-14', rotulo: '5 – 14 mg/L', min: 5, minInclusivo: true, max: 14, maxInclusivo: true, acao: 'ajustar', pagina: 3 },
        {
          id: '15-20', rotulo: '15 – 20 mg/L', min: 15, minInclusivo: true, max: 20, maxInclusivo: true, acao: 'manter', pagina: 3,
          coleta: ANTES_3A_30MIN,
          textoColeta: 'Coletar nova vancocinemia 30 min antes da 3ª dose após a última monitorização.',
          textoEstavel: 'Quando se obtiver 2 mensurações seguidas entre 15 e 20, solicitar dosagem a cada 3 dias.',
          diasQuandoEstavel: 3
        },
        {
          id: '21-40', rotulo: '21 – 40 mg/L', min: 21, minInclusivo: true, max: 40, maxInclusivo: true, acao: 'suspender-reiniciar', pagina: 4,
          recoletaHoras: 12,
          reinicio: [15, 20]
        },
        {
          id: 'gt40', rotulo: '> 40 mg/L', min: 40, minInclusivo: false, acao: 'suspender', pagina: 4,
          reinicio: [15, 20],
          coleta: APOS_48H
        }
      ],
      regras: [
        // < 5 mg/L
        { id: 'T2-01', faixa: 'lt5', de: e(1000, 48), para: e(1000, 24), coleta: ANTES_3A_30MIN },
        { id: 'T2-02', faixa: 'lt5', de: e(1000, 24), para: e(1000, 12), coleta: ANTES_3A_30MIN },
        { id: 'T2-03', faixa: 'lt5', de: e(1000, 12), para: e(1500, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-04', faixa: 'lt5', de: e(1000, 8), para: e(2000, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-05', faixa: 'lt5', de: e(1500, 12), para: e(2000, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-06', faixa: 'lt5', de: e(1500, 8), para: e(2000, 8), coleta: ANTES_4A_30MIN },
        // 5 – 14 mg/L
        { id: 'T2-07', faixa: '5-14', de: e(1000, 48), para: e(1000, 24), coleta: ANTES_3A_30MIN },
        { id: 'T2-08', faixa: '5-14', de: e(1000, 24), para: e(1000, 12), coleta: ANTES_3A_30MIN },
        { id: 'T2-09', faixa: '5-14', de: e(1000, 12), para: e(1000, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-10', faixa: '5-14', de: e(1000, 8), para: e(1500, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-11', faixa: '5-14', de: e(1500, 12), para: e(1500, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-12', faixa: '5-14', de: e(1500, 8), para: e(2000, 8), coleta: ANTES_4A_30MIN },
        { id: 'T2-13', faixa: '5-14', de: e(2000, 8), para: e(2500, 8), coleta: ANTES_4A_30MIN },
        // 21 – 40 mg/L (esquema de reinício)
        { id: 'T2-14', faixa: '21-40', de: e(1000, 48), para: e(1000, 72), coleta: APOS_48H },
        { id: 'T2-15', faixa: '21-40', de: e(1000, 24), para: e(1000, 48), coleta: APOS_48H },
        { id: 'T2-16', faixa: '21-40', de: e(1000, 12), para: e(1000, 24), coleta: APOS_48H },
        { id: 'T2-17', faixa: '21-40', de: e(1000, 8), para: e(1000, 12), coleta: ANTES_3A_30MIN },
        { id: 'T2-18', faixa: '21-40', de: e(1500, 12), para: e(1000, 12), coleta: ANTES_3A_30MIN },
        { id: 'T2-19', faixa: '21-40', de: e(1500, 8), para: e(1000, 8), coleta: ANTES_3A_30MIN },
        { id: 'T2-20', faixa: '21-40', de: e(2000, 8), para: e(1500, 8), coleta: ANTES_3A_30MIN }
      ]
    },

    // Página 4 — item 4e
    hemodialise: {
      fonte: 'Página 4 — item 4e (hemodiálise de alto fluxo)',
      textoManutencao: 'A dose de manutenção deve ser administrada sempre no fim da hemodiálise.',
      faixas: [
        { id: 'HD-01', rotulo: '< 70 kg', max: 70, maxInclusivo: false, ataqueMg: 1000, manutencaoMg: 500, ultimosMin: 30 },
        { id: 'HD-02', rotulo: '70 – 100 kg', min: 70, minInclusivo: true, max: 100, maxInclusivo: true, ataqueMg: 1250, manutencaoMg: 750, ultimosMin: 60 },
        { id: 'HD-03', rotulo: '> 100 kg', min: 100, minInclusivo: false, ataqueMg: 1500, manutencaoMg: 1000, ultimosMin: 90 }
      ]
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = protocolo;
  } else {
    root.VANCO_PROTOCOLOS = root.VANCO_PROTOCOLOS || {};
    root.VANCO_PROTOCOLOS[protocolo.id] = protocolo;
  }
})(typeof window !== 'undefined' ? window : globalThis);
