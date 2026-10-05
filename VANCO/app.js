/*
 * INTERFACE — lê os formulários, chama o motor (engine.js) e apresenta o resultado (renderer).
 * Nenhuma regra clínica deve ser escrita aqui.
 */
(function () {
  'use strict';

  var E = window.VancoEngine;
  var protocolo = window.VANCO_PROTOCOLOS['iamspe-2012'];
  var CHAVE_HISTORICO = 'vancomicina-historico';
  var MAX_HISTORICO = 20;
  var SELOS = { atencao: 'ATENÇÃO', alerta: 'ALERTA' };

  function $(seletor, raiz) {
    return (raiz || document).querySelector(seletor);
  }

  function el(tag, classe, texto) {
    var no = document.createElement(tag);
    if (classe) no.className = classe;
    if (texto != null) no.textContent = texto;
    return no;
  }

  function lerData(form, nome) {
    var valor = form.elements[nome].value;
    var d = valor ? new Date(valor) : null;
    return d && !isNaN(d.getTime()) ? d : null;
  }

  // ---------------------------------------------------------------- renderer

  function bloco(classe, titulo, linhas) {
    var b = el('section', 'bloco ' + classe);
    b.appendChild(el('h4', null, titulo));
    linhas.forEach(function (l) { b.appendChild(el('p', null, l)); });
    return b;
  }

  function copiar(texto, area, status) {
    function feito() { status.textContent = 'Copiado.'; }
    function manual() {
      area.select();
      status.textContent = document.execCommand('copy') ? 'Copiado.' : 'Selecione o texto e copie manualmente.';
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(texto).then(feito, manual);
    } else {
      manual();
    }
  }

  function mostrarResultado(r) {
    var saida = $('#resultado-' + r.modulo);
    var cartao = el('article', 'resultado nivel-' + r.nivel);
    if (SELOS[r.nivel]) cartao.appendChild(el('span', 'selo', SELOS[r.nivel]));
    cartao.appendChild(el('h3', null, r.titulo));

    var dl = el('dl', 'auditoria');
    r.auditoria.forEach(function (a) {
      dl.appendChild(el('dt', null, a[0]));
      dl.appendChild(el('dd', null, a[1]));
    });
    cartao.appendChild(dl);

    if (r.conduta.length) cartao.appendChild(bloco('conduta', 'Conduta conforme ' + r.protocolo, r.conduta));
    if (r.coleta.length) cartao.appendChild(bloco('neutro', 'Vancocinemia', r.coleta));
    r.alertas.forEach(function (a) { cartao.appendChild(bloco('atencao', a.titulo, a.linhas)); });
    cartao.appendChild(el('p', 'fonte', 'Fonte: ' + r.fonte + '.'));

    var caixa = el('label', 'copiar', 'Texto para evolução — revise antes de copiar');
    var area = el('textarea');
    area.value = E.textoParaCopiar(r);
    var linha = el('div', 'copiar-linha');
    var botao = el('button', 'principal', 'Copiar resultado');
    var status = el('span');
    botao.type = 'button';
    botao.addEventListener('click', function () { copiar(area.value, area, status); });
    linha.appendChild(botao);
    linha.appendChild(status);
    caixa.appendChild(area);
    cartao.appendChild(caixa);
    cartao.appendChild(linha);

    saida.replaceChildren(cartao);
    registrarHistorico(r.resumo);
  }

  function mostrarMensagem(form, tipo, titulo, itens, aoConfirmar) {
    var area = $('.mensagens', form);
    var caixa = el('div', 'mensagem ' + tipo);
    caixa.appendChild(el('strong', null, titulo));
    var lista = el('ul');
    itens.forEach(function (i) { lista.appendChild(el('li', null, i)); });
    caixa.appendChild(lista);
    if (aoConfirmar) {
      var botao = el('button', 'discreto', 'Confirmar valores e prosseguir');
      botao.type = 'button';
      botao.addEventListener('click', aoConfirmar);
      caixa.appendChild(botao);
    }
    area.replaceChildren(caixa);
  }

  // ---------------------------------------------------------------- histórico (localStorage)

  function lerHistorico() {
    try {
      return JSON.parse(localStorage.getItem(CHAVE_HISTORICO)) || [];
    } catch (erro) {
      return [];
    }
  }

  function gravarHistorico(itens) {
    try {
      localStorage.setItem(CHAVE_HISTORICO, JSON.stringify(itens));
    } catch (erro) { /* armazenamento indisponível: o histórico fica só nesta sessão */ }
  }

  var historico = lerHistorico();

  function desenharHistorico() {
    var lista = $('#lista-historico');
    lista.replaceChildren();
    if (!historico.length) {
      lista.appendChild(el('li', 'vazio', 'Nenhum cálculo registrado.'));
      return;
    }
    historico.forEach(function (h) {
      var li = el('li');
      li.appendChild(el('time', null, E.fmtData(new Date(h.quando)).replace(' às ', ' ')));
      li.appendChild(el('span', null, h.resumo));
      lista.appendChild(li);
    });
  }

  function registrarHistorico(resumo) {
    historico.unshift({ quando: new Date().toISOString(), resumo: resumo });
    historico = historico.slice(0, MAX_HISTORICO);
    gravarHistorico(historico);
    desenharHistorico();
  }

  // ---------------------------------------------------------------- patientData (leitura dos formulários)

  // Valida os campos numéricos; em caso de valor implausível, exige confirmação antes de calcular.
  function executar(form, campos, errosExtras, calcular) {
    var brutos = {};
    campos.forEach(function (c) { brutos[c] = form.elements[c].value; });
    var v = E.validar(campos, brutos);
    var erros = v.erros.concat(errosExtras);
    var assinatura = JSON.stringify(brutos);
    $('.mensagens', form).replaceChildren();

    if (erros.length) {
      $('#resultado-' + form.id.replace('form-', '')).replaceChildren();
      mostrarMensagem(form, 'erro', 'Não foi possível calcular:', erros);
      return;
    }
    if (v.avisos.length && form.dataset.confirmado !== assinatura) {
      $('#resultado-' + form.id.replace('form-', '')).replaceChildren();
      mostrarMensagem(form, 'aviso', 'Confirme o dado informado antes de prosseguir:', v.avisos, function () {
        form.dataset.confirmado = assinatura;
        executar(form, campos, errosExtras, calcular);
      });
      return;
    }
    mostrarResultado(calcular(v.valores));
  }

  function aoEnviar(id, tratar) {
    var form = $('#' + id);
    form.addEventListener('submit', function (evento) {
      evento.preventDefault();
      tratar(form);
    });
  }

  aoEnviar('form-inicial', function (form) {
    var sexo = form.elements.sexo.value;
    executar(form, ['idade', 'peso', 'creatinina'], sexo ? [] : ['Sexo: selecione uma opção.'], function (n) {
      return E.doseInicial(protocolo, {
        idade: n.idade, sexo: sexo, peso: n.peso, creatinina: n.creatinina,
        primeiraDose: lerData(form, 'primeiraDose')
      });
    });
  });

  aoEnviar('form-ajuste', function (form) {
    var partes = form.elements.esquema.value.split('-');
    var esquema = partes.length === 2 ? { doseMg: Number(partes[0]), intervaloH: Number(partes[1]) } : null;
    executar(form, ['vanco'], [], function (n) {
      return E.ajuste(protocolo, {
        vanco: n.vanco,
        esquema: esquema,
        anteriorNoAlvo: form.elements.anteriorNoAlvo.checked,
        ultimaDose: lerData(form, 'ultimaDose'),
        coletaEm: lerData(form, 'coletaEm'),
        inicioNovo: lerData(form, 'inicioNovo')
      });
    });
  });

  aoEnviar('form-hd', function (form) {
    executar(form, ['peso'], [], function (n) {
      return E.hemodialise(protocolo, { peso: n.peso });
    });
  });

  aoEnviar('form-coleta', function (form) {
    var tipo = form.elements.tipo.value;
    var inicio = lerData(form, 'inicio');
    var antecedencia = E.parseNumero(form.elements.antecedenciaMin.value);
    var erros = [];
    if (!inicio) erros.push('Data e hora de referência: preencha o campo.');
    if (tipo === 'antesDose' && isNaN(antecedencia)) erros.push('Antecedência: informe um número de minutos.');
    executar(form, [], erros, function () {
      return E.programarColeta(protocolo, {
        tipo: tipo,
        inicio: inicio,
        intervaloH: Number(form.elements.intervaloH.value),
        dose: Number(form.elements.dose.value),
        antecedenciaMin: antecedencia,
        horas: Number(form.elements.horas.value)
      });
    });
  });

  // ---------------------------------------------------------------- abas e seletor de hemodiálise

  var abas = Array.prototype.slice.call(document.querySelectorAll('.abas button'));

  function abrirAba(nome) {
    abas.forEach(function (b) {
      var ativa = b.dataset.aba === nome;
      b.setAttribute('aria-selected', String(ativa));
      $('#painel-' + b.dataset.aba).hidden = !ativa;
    });
  }

  abas.forEach(function (b) {
    b.addEventListener('click', function () { abrirAba(b.dataset.aba); });
  });

  // Com hemodiálise = Sim, o algoritmo convencional (Tabelas 1 e 2) fica desativado, e vice-versa.
  function aplicarHd(emHd) {
    abas.forEach(function (b) {
      var aba = b.dataset.aba;
      b.disabled = emHd ? (aba === 'inicial' || aba === 'ajuste') : aba === 'hd';
    });
    ['inicial', 'ajuste', 'hd'].forEach(function (m) { $('#resultado-' + m).replaceChildren(); });
    $('#dica-hd').textContent = emHd
      ? 'Tabelas 1 e 2 desativadas: o POP tem tabela própria para hemodiálise de alto fluxo.'
      : 'Algoritmo convencional (Tabelas 1 e 2).';
    abrirAba(emHd ? 'hd' : 'inicial');
  }

  Array.prototype.forEach.call(document.querySelectorAll('input[name="hd"]'), function (radio) {
    radio.addEventListener('change', function () { aplicarHd(radio.value === 'sim' && radio.checked); });
  });

  // ---------------------------------------------------------------- inicialização

  $('#protocolo-nome').textContent = protocolo.nome;
  $('#protocolo-versao').textContent = 'Versão do documento: ' + protocolo.versao + ' · ' + protocolo.setor;
  $('#aviso-versao').textContent = 'Esta ferramenta reproduz o ' + protocolo.nomeCurto + ' (criado em ' + protocolo.versao +
    ', revisão prevista para ' + protocolo.revisaoPrevista + '). As regras são as do documento original e não ' +
    'representam recomendação farmacocinética contemporânea.';

  var seletorEsquema = $('#form-ajuste').elements.esquema;
  protocolo.ajuste.esquemas.forEach(function (esq) {
    var op = el('option', null, E.descreverEsquema(esq, true));
    op.value = esq.doseMg + '-' + esq.intervaloH;
    seletorEsquema.appendChild(op);
  });
  var outro = el('option', null, 'Outro esquema (não listado na Tabela 2)');
  outro.value = 'outro';
  seletorEsquema.appendChild(outro);
  seletorEsquema.value = '1000-12';

  var formColeta = $('#form-coleta');
  formColeta.elements.tipo.addEventListener('change', function () {
    var tipo = formColeta.elements.tipo.value;
    Array.prototype.forEach.call(formColeta.querySelectorAll('[data-tipo]'), function (campo) {
      campo.hidden = campo.dataset.tipo !== tipo;
    });
    $('#rotulo-inicio').textContent = tipo === 'antesDose'
      ? 'Data e hora da 1ª dose do esquema'
      : 'Data e hora do evento de referência';
  });

  $('#limpar-historico').addEventListener('click', function () {
    historico = [];
    try { localStorage.removeItem(CHAVE_HISTORICO); } catch (erro) { /* nada a limpar */ }
    desenharHistorico();
  });

  aplicarHd(false);
  desenharHistorico();
})();
