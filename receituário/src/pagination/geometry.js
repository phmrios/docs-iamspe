import { mm, pt } from '../utils/units.js';

/**
 * Geometria fixa do receituário, em px lógicos (96/pol). Fonte única de verdade
 * para Canvas, camada HTML e PDF.
 */
export const PAGE = Object.freeze({
  width: mm(210),
  height: mm(297),
  marginTop: mm(20),
  marginRight: mm(20),
  marginBottom: mm(20),
  marginLeft: mm(20),
});

export const CONTENT_WIDTH = PAGE.width - PAGE.marginLeft - PAGE.marginRight; // 170 mm
export const CONTENT_HEIGHT = PAGE.height - PAGE.marginTop - PAGE.marginBottom; // 257 mm

export const TITLE = Object.freeze({
  text: 'RECEITUÁRIO MÉDICO',
  font: 'bold',
  size: pt(14),
  lineHeight: pt(14) * 1.2,
  gapAfter: mm(10),
});

export const TEXT = Object.freeze({
  font: 'regular',
  size: pt(11),
  lineHeight: pt(11) * 1.5, // entrelinhas 1,5 → 22 px
  paraGap: pt(6),
  tabChars: 2,
});

export const PATIENT = Object.freeze({
  label: 'PACIENTE: ',
  gapAfter: mm(5),
});

export const RULE = Object.freeze({
  thickness: pt(0.5),
  color: '#b4b4b4',
  gapAfter: mm(5),
});

export const FOOTER = Object.freeze({
  height: mm(45),
  safety: mm(10),
  signatureLineOffset: mm(20), // do topo do rodapé até a linha de assinatura
  signatureLineWidth: mm(80),
  signatureLineThickness: pt(0.75),
  signatureSlack: mm(2), // a imagem pode tocar a linha, sem alcançar o nome
  gapLineToName: mm(5),
  lineHeight: pt(11), // entrelinhas simples (1,0)
  placeLabel: 'LOCAL DE ATENDIMENTO: ',
  crmLabel: 'CRM',
});

export const FOOTER_TOP = PAGE.height - PAGE.marginBottom - FOOTER.height;
export const FOOTER_BOTTOM = PAGE.height - PAGE.marginBottom;
export const BODY_BOTTOM = FOOTER_TOP - FOOTER.safety;

/** Região reservada à imagem de assinatura (igual em todas as páginas). */
export const SIGNATURE_REGION = Object.freeze({
  x: PAGE.marginLeft,
  y: FOOTER_TOP,
  width: CONTENT_WIDTH,
  height: FOOTER.signatureLineOffset + FOOTER.signatureSlack,
});

export const SIGNATURE_LINE = Object.freeze({
  x1: PAGE.width / 2 - FOOTER.signatureLineWidth / 2,
  x2: PAGE.width / 2 + FOOTER.signatureLineWidth / 2,
  y: FOOTER_TOP + FOOTER.signatureLineOffset,
});

export const PLACEHOLDERS = Object.freeze({
  patient: 'Nome do paciente',
  body: 'Digite a prescrição',
  doctor: 'Nome do médico',
  uf: 'UF',
  crm: 'CRM',
  place: 'Local de atendimento',
});
